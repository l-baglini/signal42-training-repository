package com.solo.search.client;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Duration;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.http.client.ClientHttpRequestFactoryBuilder;
import org.springframework.boot.http.client.ClientHttpRequestFactorySettings;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Thin client over the local LM Studio chat server ({@code POST {base-url}{chat-path}}), mirroring
 * the equivalent client in the quoak project this was ported from: a {@code model}, an {@code
 * input} prompt, and a list of {@code integrations} (e.g. {@code mcp/solo}) so LM Studio can call
 * back into our MCP tool ({@code MessageSearchTools}) mid-generation.
 *
 * <p>The read timeout is intentionally high — an MCP-augmented generation can take minutes.
 */
@Component
public class LlmChatClient {

  private final RestClient restClient;
  private final String chatPath;
  private final String model;
  private final List<String> integrations;

  public LlmChatClient(
      @Value("${llm.base-url:http://localhost:1234}") String baseUrl,
      @Value("${llm.chat-path:/api/v1/chat}") String chatPath,
      @Value("${llm.api-key:}") String apiKey,
      @Value("${llm.model:google/gemma-4-e4b}") String model,
      @Value("${llm.integrations:mcp/solo}") List<String> integrations,
      @Value("${llm.connect-timeout-ms:10000}") long connectTimeoutMs,
      @Value("${llm.read-timeout-ms:600000}") long readTimeoutMs) {

    this.chatPath = chatPath;
    this.model = model;
    this.integrations = integrations;

    ClientHttpRequestFactorySettings settings =
        ClientHttpRequestFactorySettings.defaults()
            .withConnectTimeout(Duration.ofMillis(connectTimeoutMs))
            .withReadTimeout(Duration.ofMillis(readTimeoutMs));

    RestClient.Builder builder =
        RestClient.builder()
            .baseUrl(baseUrl)
            .requestFactory(ClientHttpRequestFactoryBuilder.detect().build(settings));
    if (!apiKey.isBlank()) {
      builder.defaultHeader("Authorization", "Bearer " + apiKey);
    }
    this.restClient = builder.build();
  }

  /** Sends a prompt to the local LLM server and returns the raw upstream JSON response. */
  public JsonNode chat(String input) {
    ChatRequest body = new ChatRequest(model, input, integrations);
    return restClient
        .post()
        .uri(chatPath)
        .contentType(MediaType.APPLICATION_JSON)
        .body(body)
        .retrieve()
        .body(JsonNode.class);
  }

  private record ChatRequest(String model, String input, List<String> integrations) {}
}
