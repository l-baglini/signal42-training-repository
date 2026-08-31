package com.solo.authentication.controller;

import com.solo.authentication.dto.AuthResponse;
import com.solo.authentication.dto.GoogleLoginRequestDto;
import com.solo.authentication.dto.LoginRequestDto;
import com.solo.authentication.dto.RegisterRequestDto;
import com.solo.authentication.service.GoogleAuthService;
import com.solo.authentication.validation.AuthValidationService;
import com.solo.authentication.service.UserDetailsService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RequiredArgsConstructor
@RestController
public class AuthController {

  private final UserDetailsService userDetailsService;
  private final GoogleAuthService googleAuthService;
  private final AuthValidationService authValidationService;

  /**
   * Authenticates a user with the given credentials and returns an auth token.
   */
  @PostMapping("/login")
  public ResponseEntity<AuthResponse> login(@RequestBody LoginRequestDto loginRequestDto) {
    authValidationService.validateLogin(loginRequestDto);
    AuthResponse authResponse = userDetailsService.login(loginRequestDto);
    return ResponseEntity.ok(authResponse);
  }

  /**
   * Registers a new user and returns an auth token.
   */
  @PostMapping("/register")
  public ResponseEntity<AuthResponse> register(@RequestBody RegisterRequestDto registerRequestDto) {
    authValidationService.validateRegister(registerRequestDto);
    AuthResponse authResponse = userDetailsService.createUser(registerRequestDto);
    return ResponseEntity.status(HttpStatus.CREATED).body(authResponse);
  }

  /**
   * "Accedi con Google": verifica l'ID token del client e restituisce il JWT dell'app, creando
   * l'utente al primo accesso o collegandolo a un account esistente con la stessa email
   * verificata (vedi GoogleAuthService). Usato sia per il login sia per la registrazione via
   * Google lato frontend: è lo stesso identico endpoint in entrambi i casi.
   */
  @PostMapping("/auth/google")
  public ResponseEntity<AuthResponse> loginWithGoogle(@RequestBody GoogleLoginRequestDto dto) {
    authValidationService.validateGoogleLogin(dto);
    return ResponseEntity.ok(googleAuthService.login(dto.idToken()));
  }
}
