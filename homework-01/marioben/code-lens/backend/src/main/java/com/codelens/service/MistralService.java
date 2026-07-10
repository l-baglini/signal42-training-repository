package com.codelens.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.codelens.dto.CodeReviewRequest;
import com.codelens.dto.CodeReviewResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

@Service
@Slf4j
public class MistralService {

    private static final String SYSTEM_PROMPT = """
            You are an expert senior code reviewer with 15+ years of experience across multiple languages and paradigms.
            Analyze the two code snippets provided by the user and evaluate each one on the following criteria.

            For EACH snippet produce a detailed evaluation:
            1. Cleanliness (1-10): formatting, DRY principle, code organization, no dead code
            2. Security (1-10): vulnerabilities, injection risks, unsafe practices, sensitive data exposure
            3. Readability (1-10): variable naming, comments quality, code clarity, cognitive load
            4. Design Patterns (1-10): SOLID principles, appropriate pattern usage, architecture quality, cohesion
            5. Overall Score (1-10): holistic evaluation

            You MUST respond with ONLY a valid JSON object — no markdown, no code fences, no extra text.
            Use exactly this structure:
            {
              "snippet1": {
                "cleanliness": {"score": 7, "observations": "...", "suggestions": ["..."]},
                "security": {"score": 8, "observations": "...", "suggestions": ["..."]},
                "readability": {"score": 6, "observations": "...", "suggestions": ["..."]},
                "designPatterns": {"score": 5, "observations": "...", "suggestions": ["..."]},
                "overallScore": 7,
                "summary": "One paragraph summary of snippet 1"
              },
              "snippet2": {
                "cleanliness": {"score": 5, "observations": "...", "suggestions": ["..."]},
                "security": {"score": 9, "observations": "...", "suggestions": ["..."]},
                "readability": {"score": 7, "observations": "...", "suggestions": ["..."]},
                "designPatterns": {"score": 8, "observations": "...", "suggestions": ["..."]},
                "overallScore": 7,
                "summary": "One paragraph summary of snippet 2"
              },
              "comparison": "A narrative paragraph comparing both snippets, highlighting key differences and trade-offs.",
              "winner": "snippet1"
            }
            The "winner" field must be exactly one of: "snippet1", "snippet2", or "tie".
            """;

    private final RestClient restClient;
    private final String model;
    private final ObjectMapper objectMapper;

    public MistralService(
            @Value("${mistral.api.key}") String apiKey,
            @Value("${mistral.api.url}") String apiUrl,
            @Value("${mistral.model}") String model) {
        this.model = model;
        this.objectMapper = new ObjectMapper();
        this.restClient = RestClient.builder()
                .baseUrl(apiUrl)
                .defaultHeader("Authorization", "Bearer " + apiKey)
                .defaultHeader("Content-Type", "application/json")
                .build();
    }

    public CodeReviewResponse reviewCode(CodeReviewRequest request) {
        String language = (request.getLanguage() != null && !request.getLanguage().isBlank())
                ? request.getLanguage()
                : "auto-detect";

        String userMessage = """
                Snippet 1 (language: %s):
                %s

                Snippet 2 (language: %s):
                %s
                """.formatted(language, request.getSnippet1(), language, request.getSnippet2());

        Map<String, Object> body = Map.of(
                "model", model,
                "messages", List.of(
                        Map.of("role", "system", "content", SYSTEM_PROMPT),
                        Map.of("role", "user", "content", userMessage)
                ),
                "temperature", 0.2,
                "response_format", Map.of("type", "json_object")
        );

        try {
            log.info("Calling Mistral API with model={}", model);
            String rawResponse = restClient.post()
                    .body(body)
                    .retrieve()
                    .body(String.class);

            JsonNode root = objectMapper.readTree(rawResponse);
            String content = root.path("choices").get(0).path("message").path("content").asText();
            log.debug("Mistral raw content: {}", content);

            return objectMapper.readValue(content, CodeReviewResponse.class);
        } catch (Exception e) {
            log.error("Error calling Mistral API", e);
            throw new RuntimeException("Failed to get AI review: " + e.getMessage(), e);
        }
    }
}
