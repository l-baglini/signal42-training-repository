package com.solo.search.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.solo.search.client.LlmChatClient;
import com.solo.search.dto.ChatRequestDto;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Proxies a chat prompt to the local LM Studio instance, with the MCP "integrations" that let it
 * call back into {@code MessageSearchTools} mid-generation. Requires a logged-in app user (unlike
 * quoak's equivalent endpoint, which is public): only someone signed into this account should be
 * able to trigger a local-AI search at all, even though the search itself is scoped to the fixed
 * {@code search.owner-email} account rather than to whoever is calling (see
 * {@code MessageSearchService}).
 */
@RequiredArgsConstructor
@RestController
@RequestMapping("/search")
public class SearchController {

  private final LlmChatClient llmChatClient;

  @PostMapping("/chat")
  public JsonNode chat(@RequestBody ChatRequestDto dto) {
    if (dto.input() == null || dto.input().isBlank()) {
      throw new IllegalArgumentException("input must not be blank");
    }
    return llmChatClient.chat(dto.input());
  }
}
