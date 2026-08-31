package com.solo.userpreference.model;

import com.solo.authentication.model.UserDetail;
import com.solo.plan.model.Plan;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "user_preference")
public class UserPreference {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  @Column(name = "id_user_preference", nullable = false)
  private Long id;

  @ManyToOne(fetch = FetchType.EAGER)
  @JoinColumn(name = "fk_id_user_detail", nullable = false)
  private UserDetail userDetail;

  // fk_id_backup rimane in colonna a livello di DB (mai droppata da una migrazione) ma non più
  // mappata qui: il package com.solo.backup che la referenziava è stato rimosso perché scaffold
  // morto (mai letto/scritto da nessun service), vedi 002-add-backup-and-user-preference.sql.

  @ManyToOne(fetch = FetchType.EAGER)
  @JoinColumn(name = "fk_id_plan")
  private Plan plan;
}
