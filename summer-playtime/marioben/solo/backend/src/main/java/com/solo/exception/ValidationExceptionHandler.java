package com.solo.exception;

import com.solo.security.model.ApiError;
import jakarta.servlet.http.HttpServletRequest;

import lombok.extern.log4j.Log4j2;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@Log4j2
@RestControllerAdvice
public class ValidationExceptionHandler {

  @ResponseStatus(HttpStatus.CONFLICT)
  @ExceptionHandler(EmailAlreadyExistsException.class)
  public ApiError handleEmailAlreadyExists(
      EmailAlreadyExistsException e, HttpServletRequest request) {
    return ApiError.of(HttpStatus.CONFLICT.value(), e.getMessage(), request.getRequestURI());
  }

  @ExceptionHandler(NoResourceFoundException.class)
  public ResponseEntity<ApiError> handleNoResourceFound(
      NoResourceFoundException e, HttpServletRequest request) {
    return ResponseEntity.status(HttpStatus.NOT_FOUND)
        .contentType(MediaType.APPLICATION_JSON)
        .body(
            ApiError.of(
                HttpStatus.NOT_FOUND.value(), "Resource not found", request.getRequestURI()));
  }

  @ResponseStatus(HttpStatus.FORBIDDEN)
  @ExceptionHandler(AccessDeniedException.class)
  public ApiError handleAccessDenied(AccessDeniedException e, HttpServletRequest request) {
    return ApiError.of(HttpStatus.FORBIDDEN.value(), "Forbidden Access", request.getRequestURI());
  }

  @ResponseStatus(HttpStatus.NOT_FOUND)
  @ExceptionHandler(ChatNotFoundException.class)
  public ApiError handleChatNotFound(ChatNotFoundException e, HttpServletRequest request) {
    return ApiError.of(HttpStatus.NOT_FOUND.value(), e.getMessage(), request.getRequestURI());
  }

  @ResponseStatus(HttpStatus.CONFLICT)
  @ExceptionHandler(ChatIdConflictException.class)
  public ApiError handleChatIdConflict(ChatIdConflictException e, HttpServletRequest request) {
    return ApiError.of(HttpStatus.CONFLICT.value(), e.getMessage(), request.getRequestURI());
  }

  @ResponseStatus(HttpStatus.NOT_FOUND)
  @ExceptionHandler(MessageNotFoundException.class)
  public ApiError handleMessageNotFound(MessageNotFoundException e, HttpServletRequest request) {
    return ApiError.of(HttpStatus.NOT_FOUND.value(), e.getMessage(), request.getRequestURI());
  }

  @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
  @ExceptionHandler({Exception.class, RuntimeException.class})
  public ApiError handleException(Exception e, HttpServletRequest request) {
    log.error("Internal Server error: {}, {}", e.getMessage(), e);
    return ApiError.of(
        HttpStatus.INTERNAL_SERVER_ERROR.value(), "Internal Server Error", request.getRequestURI());
  }

  @ResponseStatus(HttpStatus.BAD_REQUEST)
  @ExceptionHandler(InvalidCredentialsException.class)
  public ApiError handleException(InvalidCredentialsException e, HttpServletRequest request) {
    return ApiError.of(HttpStatus.BAD_REQUEST.value(), e.getMessage(), request.getRequestURI());
  }

  @ResponseStatus(HttpStatus.BAD_REQUEST)
  @ExceptionHandler(IllegalArgumentException.class)
  public ApiError handleException(IllegalArgumentException e, HttpServletRequest request) {
    return ApiError.of(HttpStatus.BAD_REQUEST.value(), e.getMessage(), request.getRequestURI());
  }
}
