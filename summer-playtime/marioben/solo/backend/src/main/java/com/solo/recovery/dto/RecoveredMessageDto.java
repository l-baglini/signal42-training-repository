package com.solo.recovery.dto;

import java.util.List;

/** A message recovered from the database index + its content read back from S3. */
public record RecoveredMessageDto(
    String id,
    String chatId,
    String text,
    String description,
    long createdAt,
    List<RecoveredAttachmentDto> attachments) {}