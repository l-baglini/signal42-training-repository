package com.solo.recovery.controller;

import com.solo.authentication.model.AuthenticationToken;
import com.solo.recovery.dto.RecoverChatsResponseDto;
import com.solo.recovery.service.RecoveryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RequiredArgsConstructor
@RestController
@RequestMapping("/chats")
public class RecoveryController {

  private final RecoveryService recoveryService;

  // from/to are epoch millis (same convention as MessageDto#createdAt), matching what the client
  // already has lying around for a date without needing a date-format negotiation.
  @GetMapping("/recover")
  public ResponseEntity<RecoverChatsResponseDto> recover(
      Authentication authentication, @RequestParam long from, @RequestParam long to) {
    return ResponseEntity.ok(recoveryService.recover(userId(authentication), from, to));
  }

  private static Long userId(Authentication authentication) {
    return ((AuthenticationToken) authentication).getDetails();
  }
}
