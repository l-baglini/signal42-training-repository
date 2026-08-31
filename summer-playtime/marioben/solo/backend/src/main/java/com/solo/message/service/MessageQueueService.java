package com.solo.message.service;

import com.solo.chat.repository.ChatRepository;
import com.solo.exception.ChatNotFoundException;
import com.solo.exception.MessageNotFoundException;
import com.solo.message.dto.ListMessagesResponseDto;
import com.solo.message.dto.MessageDto;
import com.solo.message.dto.RemoteAttachmentDto;
import com.solo.message.dto.RemoteMessageDto;
import com.solo.message.model.Message;
import com.solo.message.repository.MessageRepository;
import com.solo.message.service.MessageStorageService.LoadedMessage;
import com.solo.message.validation.MessageValidationService;
import com.solo.search.repository.VectorSearchRepository;
import com.solo.search.service.EmbeddingClient;
import jakarta.transaction.Transactional;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import lombok.RequiredArgsConstructor;
import lombok.extern.log4j.Log4j2;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/**
 * Entry point for messages arriving through {@code MessageController#sync}. Orchestrates the
 * write path of the S3 pattern: validate the message, write its content to S3, then index it in
 * the {@code message} table so it can be found (and later deleted) without touching S3 first.
 */
@Log4j2
@RequiredArgsConstructor
@Service
public class MessageQueueService {

    // Bounded pool for parallel S3 reads in list(), same rationale/sizing as
    // com.solo.recovery.service.RecoveryService's PARALLELISM: hide S3 GET latency behind
    // concurrency without overwhelming the S3 client's own connection pool. Short-lived (one per
    // request), not a shared bean.
    private static final int PARALLELISM = 16;

    private final MessageValidationService messageValidationService;
    private final MessageStorageService messageStorageService;
    private final MessageRepository messageRepository;
    private final ChatRepository chatRepository;
    private final EmbeddingClient embeddingClient;
    private final VectorSearchRepository vectorSearchRepository;

    @Transactional
    public void writeToStorage(
            Long userId, String chatId, MessageDto message, Map<String, MultipartFile> attachmentFiles) {
        // check if message already exists by id in the table messagges
        if (messageRepository.existsById(message.id())) {
            // Sync can be retried by the client (e.g. after a dropped connection) with the same
            // batch: treat re-sending an already-stored message id as a no-op instead of failing.
            log.info("Message already synced, skipping: chatId={}, messageId={}", chatId, message.id());
            return;
        }

        // validate the message
        messageValidationService.validate(message, attachmentFiles);

        // S3 first, DB second: the index row must never point at content that isn't there yet. If
        // the DB insert below fails, the S3 object is simply orphaned (harmless — a retry with the
        // same message id just overwrites it) rather than the index lying about what exists.
        String s3Prefix = messageStorageService.store(userId, chatId, message, attachmentFiles);

        // create the entry in the database
        Message entity = new Message();
        entity.setId(message.id());
        entity.setChat(chatRepository.getReferenceById(chatId));
        entity.setUserDetailId(userId);
        entity.setCreatedAt(Instant.ofEpochMilli(message.createdAt()).atOffset(ZoneOffset.UTC));
        entity.setS3Prefix(s3Prefix);
        messageRepository.save(entity);

        // Best-effort, local-AI message search (see com.solo.search / SPEC.md §3.6): never let a
        // missing/unreachable embedding model break message sync, which has to keep working with
        // this feature entirely unconfigured (the common case for anyone not running LM Studio).
        if (message.text() != null && !message.text().isBlank()) {
            try {
                float[] embedding = embeddingClient.embed(message.text());
                vectorSearchRepository.upsertEmbedding(message.id(), chatId, userId, embedding);
            } catch (RuntimeException e) {
                log.warn(
                        "Skipping embedding for message {}: local AI search unavailable ({})",
                        message.id(),
                        e.getMessage());
            }
        }

        log.info(
                "Message synced: chatId={}, messageId={}, userId={}, attachments={}, s3Prefix={}",
                chatId,
                message.id(),
                userId,
                message.attachments().size(),
                s3Prefix);
    }

    /**
     * Rewrites the description of an already-synced message (long-press "aggiungi descrizione" in
     * the app, see {@code MessageController}). Only S3 changes — {@code message} table rows never
     * store the description, S3 is the sole source of truth for it, same as text/attachments.
     *
     * @throws MessageNotFoundException if the message doesn't exist, isn't in that chat, or
     *     doesn't belong to this user — one query doubles as the ownership check.
     */
    public void updateDescription(Long userId, String chatId, String messageId, String description) {
        Message message =
                messageRepository
                        .findByIdAndChatIdAndUserDetailId(messageId, chatId, userId)
                        .orElseThrow(MessageNotFoundException::new);
        messageStorageService.updateDescription(message.getS3Prefix(), description);
    }

    /**
     * Lists a chat's messages with content read back from S3 (see {@code
     * MessageController#list}) — the read side of the web client's "no local database" model:
     * with no SQLite to hold history between page loads, the chat thread is reloaded from here on
     * every mount/focus instead.
     *
     * @throws ChatNotFoundException if the chat doesn't exist or isn't owned by this user. Checked
     *     explicitly (rather than trusting an empty list) so that case is distinguishable from "the
     *     chat exists but has no messages yet".
     */
    public ListMessagesResponseDto list(Long userId, String chatId) {
        if (!chatRepository.existsByIdAndUserDetailId(chatId, userId)) {
            throw new ChatNotFoundException();
        }

        List<Message> messages =
                messageRepository.findByChatIdAndUserDetailIdOrderByCreatedAtAsc(chatId, userId);
        if (messages.isEmpty()) {
            return new ListMessagesResponseDto(List.of());
        }

        ExecutorService executor = Executors.newFixedThreadPool(Math.min(PARALLELISM, messages.size()));
        try {
            List<CompletableFuture<RemoteMessageDto>> futures =
                    messages.stream()
                            .map(message -> CompletableFuture.supplyAsync(() -> loadOrSkip(message), executor))
                            .toList();
            List<RemoteMessageDto> loaded =
                    futures.stream().map(CompletableFuture::join).filter(Objects::nonNull).toList();
            return new ListMessagesResponseDto(loaded);
        } finally {
            executor.shutdown();
        }
    }

    // A message row can in principle point at S3 content that's missing/corrupt, independently of
    // the DB row itself (see MessageStorageService#load). The chat thread should render everything
    // it *can* read rather than fail to load entirely over one bad message.
    private RemoteMessageDto loadOrSkip(Message message) {
        try {
            LoadedMessage loaded = messageStorageService.load(message.getS3Prefix());
            List<RemoteAttachmentDto> attachments =
                    loaded.attachments().stream()
                            .map(a -> new RemoteAttachmentDto(a.id(), a.url(), a.contentType(), a.filename()))
                            .toList();
            return new RemoteMessageDto(
                    message.getId(),
                    message.getChat().getId(),
                    loaded.text(),
                    loaded.description(),
                    message.getCreatedAt().toInstant().toEpochMilli(),
                    attachments);
        } catch (RuntimeException e) {
            log.warn(
                    "Skipping message {} while listing chat {}: content unreadable from S3 ({})",
                    message.getId(),
                    message.getChat().getId(),
                    e.getMessage());
            return null;
        }
    }
}
