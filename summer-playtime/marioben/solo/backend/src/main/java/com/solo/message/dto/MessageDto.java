package com.solo.message.dto;

import java.util.List;

/**
 * One message as sent by the client in the "messages" JSON part of a sync request.
 * {@code attachments} is optional (text-only messages omit it or send an empty list); when
 * present, each entry must have a matching file part in the same multipart request. {@code
 * description} is optional (null if the user hasn't long-pressed to add one before the message's
 * first sync) — set afterward, it goes through {@code PATCH /chats/{chatId}/messages/{id}}
 * instead, since by then the message has already been synced once.
 */
public record MessageDto(
    String id, String text, String description, long createdAt, List<AttachmentDto> attachments) {

  // Lets the client omit "attachments" entirely for text-only messages instead of sending [].
  public MessageDto {
    if (attachments == null) attachments = List.of();
  }
}
