package com.solo.message.dto;

/** An attachment as read back from S3: {@code url} is a short-lived presigned GET URL. */
public record RemoteAttachmentDto(String id, String url, String contentType, String filename) {}
