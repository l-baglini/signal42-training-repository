package com.solo.search.dto;

/** Request body of {@code POST /search/chat}: a single natural-language prompt. */
public record ChatRequestDto(String input) {}
