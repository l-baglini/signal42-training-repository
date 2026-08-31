package com.solo.security.model;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

public record ApiError(int status, String message, String path, OffsetDateTime timestamp) {

  public static ApiError of(int status, String message, String path) {
    return new ApiError(status, message, path, OffsetDateTime.now(ZoneOffset.UTC));
  }
}
