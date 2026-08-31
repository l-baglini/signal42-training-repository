package com.solo.recovery.dto;

import com.solo.chat.dto.ChatDto;
import java.util.List;

/**
 * Response of {@code GET /chats/recover}. {@code chats} is the user's full chat list (not
 * filtered by date — chats themselves have no content, so there's no reason to omit any of
 * them); {@code messages} is only the messages created within the requested [from, to] range.
 */
public record RecoverChatsResponseDto(List<ChatDto> chats, List<RecoveredMessageDto> messages) {}