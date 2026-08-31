package com.solo.message.dto;

import java.util.List;

/** A message as read back for {@code GET /chats/{chatId}/messages}: index fields from the
 * database plus content/attachments read back from S3. */
public record RemoteMessageDto(
    String id,
    String chatId,
    String text,
    String description,
    long createdAt,
    List<RemoteAttachmentDto> attachments) {}
