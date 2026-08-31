package com.solo.search.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Thin client over LM Studio's local, OpenAI-compatible embeddings endpoint ({@code POST
 * /v1/embeddings}). No API key: LM Studio is expected to run unauthenticated on localhost,
 * alongside this backend, on the same machine.
 */
@Component
public class EmbeddingClient {

  private final RestClient restClient;
  private final String model;

  public EmbeddingClient(
      @Value("${embedding.base-url:http://localhost:1234}") String baseUrl,
      @Value("${embedding.model:}") String model) {
    this.model = model;
    this.restClient = RestClient.builder().baseUrl(baseUrl).build();
  }

  /**
   * Embeds one piece of text.
   *
   * @throws IllegalStateException if {@code embedding.model} isn't configured, or LM Studio
   *     returned no embedding (unreachable, model not loaded, etc.)
   */
  public float[] embed(String text) {
    if (model.isBlank()) {
      throw new IllegalStateException(
          "embedding.model is not configured — set EMBEDDING_MODEL to the embedding model"
              + " currently loaded in LM Studio");
    }
    EmbeddingResponse response =
        restClient
            .post()
            .uri("/v1/embeddings")
            .contentType(MediaType.APPLICATION_JSON)
            .body(new EmbeddingRequest(model, text))
            .retrieve()
            .body(EmbeddingResponse.class);

    if (response == null || response.data() == null || response.data().isEmpty()) {
      throw new IllegalStateException("LM Studio returned an empty embedding response");
    }
    return response.data().getFirst().embedding();
  }

  private record EmbeddingRequest(String model, String input) {}

  @JsonIgnoreProperties(ignoreUnknown = true)
  private record EmbeddingResponse(List<EmbeddingData> data) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record EmbeddingData(float[] embedding) {}
  }
}
