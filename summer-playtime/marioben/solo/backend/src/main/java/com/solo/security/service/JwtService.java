package com.solo.security.service;

import com.solo.authentication.model.UserDetail;
import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.crypto.SecretKey;
import lombok.Getter;
import lombok.Setter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.stereotype.Service;

@Service
@Getter
@Setter
public class JwtService {

  private final SecretKey key;
  private final long accessTtlSeconds;
  private final long refreshTtlSeconds;
  private final String issuer;

  public JwtService(
      @Value("${spring.security.jwt.secret}") String secret,
      @Value("${spring.security.jwt.access-ttl-seconds}") long accessTtlSeconds,
      @Value("${spring.security.jwt.refresh-ttl-seconds}") long refreshTtlSeconds,
      @Value("${spring.security.jwt.issuer}") String issuer) {

    if (secret == null || secret.length() < 64) {
      throw new IllegalArgumentException("Invalid secret");
    }

    this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    this.accessTtlSeconds = accessTtlSeconds;
    this.refreshTtlSeconds = refreshTtlSeconds;
    this.issuer = issuer;
  }

  public String generateAccessToken(UserDetail userDetail) {
    Instant now = Instant.now();
    List<String> authority =
        userDetail.getAllAuthorities() == null
            ? List.of()
            : userDetail.getAllAuthorities().stream().map(GrantedAuthority::getAuthority).toList();

    return buildJwt(
        String.valueOf(userDetail.getId()),
        issuer,
        Date.from(now),
        Date.from(now.plusSeconds(accessTtlSeconds)),
        Map.of("email", userDetail.getEmail(), "roles", authority),
        key);
  }

  String buildJwt(
      String sub, String iss, Date iat, Date exp, Map<String, Object> claims, SecretKey key) {
    return Jwts.builder()
        .id(UUID.randomUUID().toString())
        .subject(sub)
        .issuer(iss)
        .issuedAt(iat)
        .expiration(exp)
        .claims(claims)
        .signWith(key)
        .compact();
  }
}
