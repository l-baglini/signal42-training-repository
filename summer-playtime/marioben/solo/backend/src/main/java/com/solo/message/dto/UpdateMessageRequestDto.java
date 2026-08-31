package com.solo.message.dto;

/** Body of {@code PATCH /chats/{chatId}/messages/{messageId}}: null clears the description. */
public record UpdateMessageRequestDto(String description) {}
