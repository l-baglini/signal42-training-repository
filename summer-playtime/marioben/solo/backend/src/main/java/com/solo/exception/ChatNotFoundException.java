package com.solo.exception;

public class ChatNotFoundException extends RuntimeException {
  public ChatNotFoundException() {
    super("Chat not found");
  }
}
