package com.solo.message.model;

import com.solo.chat.model.Chat;
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

/**
 * DB-side index row for a message whose actual content (text + attachments) lives in S3 under
 * {@link #s3Prefix}. Keeping this row thin is intentional: it exists only to answer "does this
 * message exist" and "where is its content", never to hold the content itself.
 */
@Getter
@Setter
@Entity
@Table(name = "message")
public class Message {

  // Client-generated id, same reasoning as Chat.id: the app already assigns this id locally
  // before the message is ever synced, so the server adopts it instead of generating its own.
  @Id
  @Column(name = "id_message", nullable = false, length = 64)
  private String id;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "fk_id_chat", nullable = false)
  private Chat chat;

  // Denormalized on purpose: this is the S3 tenant partition (messages/<userDetailId>/...), so
  // it's kept as a plain column to look it up without joining through chat -> user_detail.
  @Column(name = "fk_id_user_detail", nullable = false)
  private Long userDetailId;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;

  @Column(name = "s3_prefix", nullable = false, length = 500)
  private String s3Prefix;
}
