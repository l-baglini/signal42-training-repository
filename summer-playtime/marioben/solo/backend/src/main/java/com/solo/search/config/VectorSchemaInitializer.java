package com.solo.search.config;

import com.solo.search.repository.VectorSearchRepository;
import com.solo.search.service.EmbeddingClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.log4j.Log4j2;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * Creates the pgvector schema on startup, sized to whatever the configured embedding model
 * actually returns — probed once with a throwaway call rather than asked for as a config number,
 * since the right dimension depends entirely on which embedding model is loaded in LM Studio and
 * guessing wrong would silently corrupt the index.
 *
 * <p>Best-effort on purpose: local AI search is an optional feature, so Postgres or LM Studio not
 * being up yet must never stop the rest of the app (chats/messages/auth) from starting.
 */
@Log4j2
@Component
@RequiredArgsConstructor
public class VectorSchemaInitializer implements ApplicationRunner {

  private final EmbeddingClient embeddingClient;
  private final VectorSearchRepository vectorSearchRepository;

  @Value("${embedding.model:}")
  private String embeddingModel;

  @Override
  public void run(ApplicationArguments args) {
    if (embeddingModel.isBlank()) {
      log.info("EMBEDDING_MODEL not set: local AI message search stays disabled until configured.");
      return;
    }
    try {
      float[] probe = embeddingClient.embed("solo schema probe");
      vectorSearchRepository.ensureSchema(probe.length);
      log.info("Local AI message search ready ({}-dimensional embeddings).", probe.length);
    } catch (RuntimeException e) {
      log.warn(
          "Could not initialize local AI message search (is Postgres/LM Studio reachable?): {}",
          e.getMessage());
    }
  }
}
