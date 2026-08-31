package com.solo.userpreference.controller;

import com.solo.authentication.model.AuthenticationToken;
import com.solo.userpreference.dto.PreferenceDto;
import com.solo.userpreference.dto.UpdatePreferenceRequestDto;
import com.solo.userpreference.service.UserPreferenceService;
import com.solo.userpreference.validation.UserPreferenceValidationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RequiredArgsConstructor
@RestController
@RequestMapping("/preferences")
public class UserPreferenceController {

  private final UserPreferenceService userPreferenceService;
  private final UserPreferenceValidationService userPreferenceValidationService;

  @GetMapping
  public ResponseEntity<PreferenceDto> get(Authentication authentication) {
    return ResponseEntity.ok(userPreferenceService.get(userId(authentication)));
  }

  @PatchMapping
  public ResponseEntity<PreferenceDto> update(
      Authentication authentication, @RequestBody UpdatePreferenceRequestDto dto) {
    userPreferenceValidationService.validateUpdate(dto);
    return ResponseEntity.ok(userPreferenceService.update(userId(authentication), dto));
  }

  private static Long userId(Authentication authentication) {
    return ((AuthenticationToken) authentication).getDetails();
  }
}
