package com.solo.authentication.model;

import java.util.Collection;
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;
import lombok.Getter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

public class AuthenticationToken extends JwtAuthenticationToken {

  @Getter private final Jwt jwt;

  @Getter private Long userDetailsId;

  @Getter private Long roleId;

  private final Set<GrantedAuthority> authorities;

  public AuthenticationToken(Jwt jwtToken, UserDetail userDetails) {
    super(jwtToken, userDetails.getAllAuthorities());
    setAuthenticated(true);
    this.jwt = jwtToken;
    this.authorities = userDetails.getAllAuthorities();
    this.userDetailsId = userDetails.getId();

    if (userDetails.getRole() != null) {
      this.roleId = userDetails.getRole().getId();
    }
  }

  @Override
  public Object getCredentials() {
    return jwt;
  }

  @Override
  public String getPrincipal() {
    return jwt.getClaims().get("email").toString();
  }

  @Override
  public Long getDetails() {
    return userDetailsId;
  }

  @Override
  public Collection<GrantedAuthority> getAuthorities() {
    if (authorities != null && !authorities.isEmpty()) {
      return authorities;
    }
    return new HashSet<>();
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) return true;
    if (o == null || getClass() != o.getClass()) return false;
    if (!super.equals(o)) return false;
    AuthenticationToken that = (AuthenticationToken) o;
    return Objects.equals(jwt, that.jwt) && Objects.equals(authorities, that.authorities);
  }

  @Override
  public int hashCode() {
    return Objects.hash(super.hashCode(), jwt, authorities);
  }
}
