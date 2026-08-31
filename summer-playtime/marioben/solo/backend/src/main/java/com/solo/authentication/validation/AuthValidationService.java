package com.solo.authentication.validation;

import com.solo.authentication.dto.GoogleLoginRequestDto;
import com.solo.authentication.dto.LoginRequestDto;
import com.solo.authentication.dto.RegisterRequestDto;
import com.solo.common.validation.Validations;
import org.springframework.stereotype.Service;

/** Validates the request bodies handled by {@code AuthController}. */
@Service
public class AuthValidationService {

  /**
   * Validates that the login request body has a valid email and a non-blank password.
   */
  public void validateLogin(LoginRequestDto dto) {
    Validations.requireNotNull(dto, "body");
    Validations.requireEmail(dto.email(), "email");
    Validations.requireNotBlank(dto.password(), "password");
  }

  /**
   * Validates that the register request body has a name, a valid email, and a valid password.
   */
  public void validateRegister(RegisterRequestDto dto) {
    Validations.requireNotNull(dto, "body");
    Validations.requireNotBlank(dto.name(), "name");
    Validations.requireEmail(dto.email(), "email");
    Validations.requirePassword(dto.password(), "password");
  }

  /**
   * Validates that the "login with Google" request body carries an ID token to verify.
   */
  public void validateGoogleLogin(GoogleLoginRequestDto dto) {
    Validations.requireNotNull(dto, "body");
    Validations.requireNotBlank(dto.idToken(), "idToken");
  }
}
