package com.solo.authentication.model;

import jakarta.persistence.*;
import java.util.HashSet;
import java.util.Set;
import lombok.Getter;
import lombok.Setter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

@Getter
@Setter
@Entity
@Table(name = "user_detail")
public class UserDetail {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  @Column(name = "id_user_detail", nullable = false)
  private Long id;

  @ManyToOne(fetch = FetchType.EAGER)
  @JoinColumn(name = "fk_id_role")
  private Role role;

  @Column(name = "name", nullable = false)
  private String name;

  @Column(name = "email", nullable = false)
  private String email;

  @Column(name = "password", nullable = false)
  private String password;

  @Column(name = "enable", nullable = false)
  private boolean enable;

  @Column(name = "deleted", nullable = false)
  private boolean deleted;

  /**
   * Get all authorities, role's authorities and custom allowed authorities - custom denied
   * authorities
   */
  public Set<GrantedAuthority> getAllAuthorities() {
    Set<GrantedAuthority> authorities = new HashSet<>();

    // inherited from role
    if (role != null) {

      // add all permission from role
      role.getAuthorities()
          .forEach(
              authority ->
                  authorities.add(
                      new SimpleGrantedAuthority(authority.getKeyword().toUpperCase())));

      // add role itself
      String name = role.getName().toUpperCase();
      authorities.add(new SimpleGrantedAuthority("ROLE_" + name));
    }

    return authorities;
  }
}
