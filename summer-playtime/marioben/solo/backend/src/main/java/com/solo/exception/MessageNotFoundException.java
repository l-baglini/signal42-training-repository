package com.solo.exception;

public class MessageNotFoundException extends RuntimeException {
  public MessageNotFoundException() {
    super("Message not found");
  }
}
