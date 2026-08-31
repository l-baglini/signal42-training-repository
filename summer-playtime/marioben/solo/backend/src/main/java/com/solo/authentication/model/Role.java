package com.solo.authentication.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.Size;
import java.util.Set;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "role")
public class Role {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  @Column(name = "id_role", nullable = false)
  private Long id;

  @Size(max = 255)
  @Column(name = "name")
  private String name;

  @Size(max = 1000)
  @Column(name = "description", length = 1000)
  private String description;

  @ManyToMany(fetch = FetchType.EAGER)
  @JoinTable(
      name = "authority_role",
      joinColumns = @JoinColumn(name = "fk_id_role"),
      inverseJoinColumns = @JoinColumn(name = "fk_id_authority"))
  Set<Authority> authorities;
}
