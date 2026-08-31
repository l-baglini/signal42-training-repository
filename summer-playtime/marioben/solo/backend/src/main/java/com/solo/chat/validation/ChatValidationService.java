package com.solo.chat.validation;

import com.solo.chat.dto.CreateChatRequestDto;
import com.solo.chat.dto.UpdateChatRequestDto;
import com.solo.common.validation.Validations;
import java.util.Set;
import org.springframework.stereotype.Service;

/** Validates the request bodies handled by {@code ChatController}. */
@Service
public class ChatValidationService {

  private static final Set<String> SECURITY_MODES = Set.of("none", "pin", "face");

  public void validateCreate(CreateChatRequestDto dto) {
    Validations.requireNotNull(dto, "body");
    Validations.requireNotBlank(dto.id(), "id");
    Validations.requireNotBlank(dto.name(), "name");
    Validations.requireNotBlank(dto.icon(), "icon");
    Validations.requireNotBlank(dto.color(), "color");
    validateSecurity(dto.securityMode(), dto.securityPinHash());
  }

  public void validateUpdate(UpdateChatRequestDto dto) {
    Validations.requireNotNull(dto, "body");
    if (dto.name() != null) Validations.requireNotBlank(dto.name(), "name");
    if (dto.icon() != null) Validations.requireNotBlank(dto.icon(), "icon");
    if (dto.color() != null) Validations.requireNotBlank(dto.color(), "color");
    if (dto.securityMode() != null) validateSecurity(dto.securityMode(), dto.securityPinHash());
  }

  private void validateSecurity(String mode, String pinHash) {
    if (mode == null) return;
    Validations.requireOneOf(mode, SECURITY_MODES, "securityMode");
    if (mode.equals("pin")) {
      Validations.requireNotBlank(pinHash, "securityPinHash");
    }
  }
}
