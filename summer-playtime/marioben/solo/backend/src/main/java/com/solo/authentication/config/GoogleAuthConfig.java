package com.solo.authentication.config;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

/**
 * Verifies Google Sign-In ID tokens for {@code POST /auth/google} (see GoogleAuthService):
 * decodes and validates them against Google's own published signing keys — independent of the
 * app's own {@code JwtDecoder} ({@code SecurityConfig#jwtDecoder}), which only verifies tokens
 * minted by this backend itself. Both beans share the {@code JwtDecoder} type, so Spring tells
 * them apart by matching bean name to injection-point name: keep this bean method named
 * {@code googleIdTokenDecoder} in sync with the field of the same name in
 * {@code GoogleAuthService} (no {@code @Qualifier} is used).
 */
@Configuration
public class GoogleAuthConfig {

  // Google's fixed, well-known JWKS endpoint for ID token signature verification.
  private static final String GOOGLE_JWK_SET_URI = "https://www.googleapis.com/oauth2/v3/certs";
  private static final String GOOGLE_ISSUER = "https://accounts.google.com";

  // The app requests a Google ID token with a *different* client id per platform (see
  // useGoogleSignIn.ts on the frontend: androidClientId vs iosClientId), so a token's `aud`
  // claim can legitimately be either one — a single expected audience would reject whichever
  // platform's client id isn't configured as "the" one. google.client-ids is a comma-separated
  // list of every client id the app is allowed to present; defaults to empty (not configured),
  // which means the audience check never matches and /auth/google fails closed instead of the
  // app failing to start.
  @Bean
  public JwtDecoder googleIdTokenDecoder(@Value("${google.client-ids:}") String clientIdsRaw) {
    Set<String> clientIds =
        Arrays.stream(clientIdsRaw.split(","))
            .map(String::trim)
            .filter(id -> !id.isEmpty())
            .collect(Collectors.toSet());

    NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(GOOGLE_JWK_SET_URI).build();
    decoder.setJwtValidator(
        new DelegatingOAuth2TokenValidator<>(
            JwtValidators.createDefault(), issuerValidator(), audienceValidator(clientIds)));
    return decoder;
  }

  private static OAuth2TokenValidator<Jwt> issuerValidator() {
    return jwt ->
        GOOGLE_ISSUER.equals(jwt.getIssuer() == null ? null : jwt.getIssuer().toString())
            ? OAuth2TokenValidatorResult.success()
            : OAuth2TokenValidatorResult.failure(
                new OAuth2Error("invalid_issuer", "Unexpected token issuer: " + jwt.getIssuer(), null));
  }

  private static OAuth2TokenValidator<Jwt> audienceValidator(Set<String> clientIds) {
    return jwt ->
        jwt.getAudience() != null && jwt.getAudience().stream().anyMatch(clientIds::contains)
            ? OAuth2TokenValidatorResult.success()
            : OAuth2TokenValidatorResult.failure(
                new OAuth2Error(
                    "invalid_audience",
                    "Token audience does not match any configured Google client id",
                    null));
  }
}
