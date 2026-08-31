package com.solo.authentication.service;

import com.solo.authentication.dto.AuthResponse;
import com.solo.authentication.model.UserDetail;
import com.solo.authentication.repository.UserDetailsRepository;
import com.solo.exception.InvalidCredentialsException;
import com.solo.security.service.JwtService;
import jakarta.transaction.Transactional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.log4j.Log4j2;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.stereotype.Service;

/**
 * "Accedi con Google": scambia un ID token Google (ottenuto lato client via expo-auth-session,
 * vedi LoginPage/RegisterPage sul frontend) con il JWT di questa app, riusando lo stesso
 * AuthResponse/JwtService del login email+password — Google serve solo a dimostrare "questa
 * persona possiede questa email", mai come sistema di sessione parallelo.
 *
 * <p>Il collegamento account avviene per email verificata, di proposito: se l'email nel token
 * Google corrisponde già a un account con password, si entra in quello stesso account invece di
 * rifiutare o duplicare (bloccato comunque dal vincolo UNIQUE su user_detail.email).
 */
@Log4j2
@Service
@RequiredArgsConstructor
public class GoogleAuthService {

  private final JwtDecoder googleIdTokenDecoder;
  private final UserDetailsRepository userDetailsRepository;
  private final PasswordEncoder passwordEncoder;
  private final JwtService jwtService;

  @Transactional
  public AuthResponse login(String idToken) {
    Jwt googleToken = decode(idToken);

    Boolean emailVerified = googleToken.getClaimAsBoolean("email_verified");
    String email = googleToken.getClaimAsString("email");
    if (!Boolean.TRUE.equals(emailVerified) || email == null || email.isBlank()) {
      throw new InvalidCredentialsException();
    }

    UserDetail userDetail =
        userDetailsRepository.findByUserEmail(email).orElseGet(() -> createFromGoogle(googleToken, email));

    if (!userDetail.isEnable()) {
      throw new InvalidCredentialsException();
    }

    String token = jwtService.generateAccessToken(userDetail);
    return new AuthResponse(token, userDetail.getName());
  }

  private Jwt decode(String idToken) {
    try {
      return googleIdTokenDecoder.decode(idToken);
    } catch (JwtException e) {
      log.warn("Rejected Google id token: {}", e.getMessage());
      throw new InvalidCredentialsException();
    }
  }

  private UserDetail createFromGoogle(Jwt googleToken, String email) {
    String name = googleToken.getClaimAsString("name");

    UserDetail userDetail = new UserDetail();
    userDetail.setName(name != null && !name.isBlank() ? name : email.substring(0, email.indexOf('@')));
    userDetail.setEmail(email);
    // Nessuna password scelta (questo account si autentica solo via Google): salviamo un hash
    // casuale inutilizzabile invece di allentare il vincolo NOT NULL/la validazione del login a
    // password, così quel percorso resta invariato.
    userDetail.setPassword(passwordEncoder.encode(UUID.randomUUID().toString()));
    userDetail.setEnable(true);
    userDetail.setRole(null);
    return userDetailsRepository.save(userDetail);
  }
}
