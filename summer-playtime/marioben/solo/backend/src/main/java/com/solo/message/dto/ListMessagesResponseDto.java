package com.solo.message.dto;

import java.util.List;

/** Response body of {@code GET /chats/{chatId}/messages}. */
public record ListMessagesResponseDto(List<RemoteMessageDto> messages) {}
