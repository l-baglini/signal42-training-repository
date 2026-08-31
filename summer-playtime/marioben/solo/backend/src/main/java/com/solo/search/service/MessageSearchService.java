package com.solo.search.service;

import com.solo.authentication.model.UserDetail;
import com.solo.authentication.repository.UserDetailsRepository;
import com.solo.chat.model.Chat;
import com.solo.chat.repository.ChatRepository;
import com.solo.message.model.Message;
import com.solo.message.repository.MessageRepository;
import com.solo.message.service.MessageStorageService;
import com.solo.search.repository.VectorSearchRepository;
import com.solo.search.repository.VectorSearchRepository.VectorMatch;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.log4j.Log4j2;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Orchestrates the local-AI search: embed the question, find the closest messages in pgvector,
 * read their real content back from S3. Called from {@code MessageSearchTools} (the MCP-facing
 * tool), kept separate the same way {@code KbSemanticSearchTools}/{@code KbService} are split in
 * the quoak project this was ported from.
 *
 * <p>Scoped to a single configured "owner" account (see {@code search.owner-email} / SPEC.md
 * §3.6): an MCP tool call from LM Studio carries no app session/JWT, so there is no per-request
 * user to scope by — unlike every other endpoint in this backend, which scope by the
 * authenticated caller.
 */
@Log4j2
@Service
@RequiredArgsConstructor
public class MessageSearchService {

  private static final int MAX_RESULTS = 8;

  private final EmbeddingClient embeddingClient;
  private final VectorSearchRepository vectorSearchRepository;
  private final MessageRepository messageRepository;
  private final ChatRepository chatRepository;
  private final MessageStorageService messageStorageService;
  private final UserDetailsRepository userDetailsRepository;

  @Value("${search.owner-email:}")
  private String ownerEmail;

  @Transactional
  public List<SearchHit> search(String query) {
    if (ownerEmail.isBlank()) {
      throw new IllegalStateException(
          "search.owner-email is not configured — set SEARCH_OWNER_EMAIL");
    }
    UserDetail owner =
        userDetailsRepository
            .findByUserEmail(ownerEmail)
            .orElseThrow(
                () ->
                    new IllegalStateException(
                        "search.owner-email does not match any solo account"));

    float[] queryEmbedding = embeddingClient.embed(query);
    List<VectorMatch> matches = vectorSearchRepository.search(owner.getId(), queryEmbedding, MAX_RESULTS);

    List<SearchHit> hits = new ArrayList<>();
    for (VectorMatch match : matches) {
      Message message = messageRepository.findById(match.messageId()).orElse(null);
      if (message == null) {
        // Embedded once, since deleted (or the vector index drifted from MySQL) — skip.
        continue;
      }
      try {
        MessageStorageService.LoadedMessage loaded = messageStorageService.load(message.getS3Prefix());
        String chatName =
            chatRepository.findById(match.chatId()).map(Chat::getName).orElse("chat");
        hits.add(
            new SearchHit(chatName, message.getCreatedAt(), loaded.text(), 1.0 - match.distance()));
      } catch (RuntimeException e) {
        log.warn(
            "Skipping message {} in local AI search: content unreadable from S3 ({})",
            match.messageId(),
            e.getMessage());
      }
    }
    return hits;
  }

  /** One search result: the message's chat name, timestamp, text, and a [0,1] similarity score. */
  public record SearchHit(String chatName, OffsetDateTime createdAt, String text, double similarity) {}
}
