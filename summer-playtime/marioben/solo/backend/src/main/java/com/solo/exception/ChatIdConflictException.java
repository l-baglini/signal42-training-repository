package com.solo.exception;

public class ChatIdConflictException extends RuntimeException {
  public ChatIdConflictException() {
    super("Chat id already in use");
  }
}
