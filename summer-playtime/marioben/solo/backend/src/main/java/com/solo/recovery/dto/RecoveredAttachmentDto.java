package com.solo.recovery.dto;

/** A recovered attachment: {@code url} is a short-lived presigned S3 GET URL (see MessageStorageService). */
public record RecoveredAttachmentDto(String id, String url, String contentType, String filename) {}