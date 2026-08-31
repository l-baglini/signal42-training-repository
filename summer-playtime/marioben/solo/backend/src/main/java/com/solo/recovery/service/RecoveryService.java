package com.solo.recovery.service;

import com.solo.chat.dto.ChatDto;
import com.solo.chat.service.ChatService;
import com.solo.message.model.Message;
import com.solo.message.repository.MessageRepository;
import com.solo.message.service.MessageStorageService;
import com.solo.message.service.MessageStorageService.LoadedMessage;
import com.solo.recovery.dto.RecoverChatsResponseDto;
import com.solo.recovery.dto.RecoveredAttachmentDto;
import com.solo.recovery.dto.RecoveredMessageDto;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import lombok.RequiredArgsConstructor;
import lombok.extern.log4j.Log4j2;
import org.springframework.stereotype.Service;

/**
 * Rebuilds a user's chats + messages for the Settings "recover" flow: the chat list comes
 * straight from the DB (cheap), each message's content comes from S3 (one GET per message, plus
 * one presign per attachment) — this is the part that's "sicuramente un processo lungo" for a
 * wide date range, so it's fanned out across a small thread pool instead of done one message at a
 * time in the request thread.
 *
 * <p>This is a synchronous request/response by design (no job queue/polling infra exists in this
 * backend yet, see the exploration that preceded this feature): {@link #MAX_MESSAGES} bounds the
 * worst case so a client can't accidentally trigger an unbounded scan.
 */
@Log4j2
@RequiredArgsConstructor
@Service
public class RecoveryService {

  // Keeps a single synchronous request bounded: past this, ask the client to narrow the range
  // instead of silently taking minutes. Comfortably above what the Settings UI's own quick
  // ranges (7d/30d/12m) would produce for a normal user.
  private static final int MAX_MESSAGES = 2000;

  // Bounded pool for parallel S3 reads: high enough to hide S3 GET latency behind concurrency,
  // low enough not to overwhelm the S3 client's own connection pool. Short-lived (one per
  // request), not a shared bean, since load is bursty (idle between recoveries, then a spike).
  private static final int PARALLELISM = 16;

  private final ChatService chatService;
  private final MessageRepository messageRepository;
  private final MessageStorageService messageStorageService;

  public RecoverChatsResponseDto recover(Long userId, long fromEpochMilli, long toEpochMilli) {
    if (fromEpochMilli > toEpochMilli) {
      throw new IllegalArgumentException("'from' must not be after 'to'");
    }

    List<ChatDto> chats = chatService.listForUser(userId);

    OffsetDateTime from = Instant.ofEpochMilli(fromEpochMilli).atOffset(ZoneOffset.UTC);
    OffsetDateTime to = Instant.ofEpochMilli(toEpochMilli).atOffset(ZoneOffset.UTC);
    List<Message> messages =
        messageRepository.findByUserDetailIdAndCreatedAtBetweenOrderByCreatedAtAsc(userId, from, to);
    if (messages.size() > MAX_MESSAGES) {
      throw new IllegalArgumentException(
          "Selected range has "
              + messages.size()
              + " messages, which is more than the "
              + MAX_MESSAGES
              + " allowed in one recovery; please narrow the date range");
    }
    if (messages.isEmpty()) {
      return new RecoverChatsResponseDto(chats, List.of());
    }

    ExecutorService executor = Executors.newFixedThreadPool(Math.min(PARALLELISM, messages.size()));
    try {
      List<CompletableFuture<RecoveredMessageDto>> futures =
          messages.stream().map(message -> CompletableFuture.supplyAsync(() -> loadOrSkip(message), executor)).toList();
      List<RecoveredMessageDto> recovered =
          futures.stream().map(CompletableFuture::join).filter(Objects::nonNull).toList();
      return new RecoverChatsResponseDto(chats, recovered);
    } finally {
      executor.shutdown();
    }
  }

  // A message row can in principle point at S3 content that's missing/corrupt, independently of
  // the DB row itself (see MessageStorageService#load). Recovery should return everything it
  // *can* read rather than fail the whole batch over one bad message.
  private RecoveredMessageDto loadOrSkip(Message message) {
    try {
      LoadedMessage loaded = messageStorageService.load(message.getS3Prefix());
      List<RecoveredAttachmentDto> attachments =
          loaded.attachments().stream()
              .map(a -> new RecoveredAttachmentDto(a.id(), a.url(), a.contentType(), a.filename()))
              .toList();
      return new RecoveredMessageDto(
          message.getId(),
          message.getChat().getId(),
          loaded.text(),
          loaded.description(),
          message.getCreatedAt().toInstant().toEpochMilli(),
          attachments);
    } catch (RuntimeException e) {
      log.warn(
          "Skipping message {} during recovery: content unreadable from S3 ({})",
          message.getId(),
          e.getMessage());
      return null;
    }
  }
}
