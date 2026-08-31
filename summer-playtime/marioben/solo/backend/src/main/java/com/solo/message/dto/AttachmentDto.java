package com.solo.message.dto;

/**
 * Metadata for one attachment of a message. The actual bytes are NOT here: they travel as a
 * separate file part in the multipart request, named exactly {@code id} so the backend can match
 * this metadata to the uploaded file (see {@code MessageController#sync}).
 */
public record AttachmentDto(String id, String contentType, String filename) {}
