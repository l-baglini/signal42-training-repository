package com.solo.chat.model;

import com.solo.authentication.model.UserDetail;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "chat")
public class Chat {
  // Client-generated UUID (not @GeneratedValue): the app already uses this id as the local
  // SQLite messages.chat_id foreign key and the /chat/[id] route param before the chat is ever
  // synced, so the server adopts the client's id instead of assigning its own.
  @Id
  @Column(name = "id_chat", nullable = false, length = 36)
  private String id;

  @ManyToOne(fetch = FetchType.EAGER)
  @JoinColumn(name = "fk_id_user_detail", nullable = false)
  private UserDetail userDetail;

  @Column(name = "name", nullable = false)
  private String name;

  @Column(name = "icon", nullable = false)
  private String icon;

  @Column(name = "color", nullable = false)
  private String color;

  @Column(name = "favorite", nullable = false)
  private boolean favorite;

  @Column(name = "backup", nullable = false)
  private boolean backup;

  @Column(name = "security_mode", nullable = false)
  private String securityMode;

  @Column(name = "security_pin_hash")
  private String securityPinHash;

  // DB-managed default (CURRENT_TIMESTAMP): read-only here, used only to order findByUserDetailId
  // results consistently; never written by the app, so it's excluded from insert/update.
  @Column(name = "created_at", insertable = false, updatable = false)
  private OffsetDateTime createdAt;
}
