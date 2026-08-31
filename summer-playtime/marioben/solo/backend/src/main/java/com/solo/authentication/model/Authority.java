package com.solo.authentication.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "authority")
public class Authority {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  @Column(name = "id_authority", nullable = false)
  private Long id;

  @Size(max = 255)
  @NotNull
  @Column(name = "keyword", nullable = false)
  private String keyword;

  @Size(max = 255)
  @Column(name = "name")
  private String name;

  @Size(max = 255)
  @Column(name = "category")
  private String category;

  @Size(max = 1000)
  @Column(name = "module", length = 1000)
  private String module;

  @Size(max = 1000)
  @Column(name = "description", length = 1000)
  private String description;
}
