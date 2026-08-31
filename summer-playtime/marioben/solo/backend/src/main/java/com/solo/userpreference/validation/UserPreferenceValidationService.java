package com.solo.userpreference.validation;

import com.solo.common.validation.Validations;
import com.solo.userpreference.dto.UpdatePreferenceRequestDto;
import org.springframework.stereotype.Service;

/** Validates the request bodies handled by {@code UserPreferenceController}. */
@Service
public class UserPreferenceValidationService {

  public void validateUpdate(UpdatePreferenceRequestDto dto) {
    Validations.requireNotNull(dto, "body");
  }
}