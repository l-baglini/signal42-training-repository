package com.solo.search.repository;

import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Handles the pgvector-specific operations (schema setup, writing embeddings, cosine-distance
 * similarity search) on the dedicated vector datasource (see {@code VectorDbConfig}), using plain
 * JDBC — Hibernate has no native pgvector type and this table isn't JPA-mapped.
 */
@Repository
public class VectorSearchRepository {

  private final JdbcTemplate vectorJdbcTemplate;

  public VectorSearchRepository(JdbcTemplate vectorJdbcTemplate) {
    this.vectorJdbcTemplate = vectorJdbcTemplate;
  }

  /**
   * Creates the pgvector extension, table, and indexes if they don't exist yet. {@code dimensions}
   * comes from actually probing the configured embedding model ({@code VectorSchemaInitializer}),
   * never from user input — interpolating it into the DDL (pgvector's {@code vector(N)} type
   * requires a literal, not a bind parameter) carries no injection risk.
   */
  public void ensureSchema(int dimensions) {
    vectorJdbcTemplate.execute("CREATE EXTENSION IF NOT EXISTS vector");
    vectorJdbcTemplate.execute(
        """
        CREATE TABLE IF NOT EXISTS message_embedding (
            id_message        VARCHAR(64) PRIMARY KEY,
            fk_id_chat        VARCHAR(36) NOT NULL,
            fk_id_user_detail BIGINT NOT NULL,
            embedding         vector(%d) NOT NULL,
            created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
            .formatted(dimensions));
    vectorJdbcTemplate.execute(
        "CREATE INDEX IF NOT EXISTS idx_message_embedding_user "
            + "ON message_embedding (fk_id_user_detail)");
    vectorJdbcTemplate.execute(
        "CREATE INDEX IF NOT EXISTS idx_message_embedding_vector "
            + "ON message_embedding USING hnsw (embedding vector_cosine_ops)");
  }

  /** Inserts or replaces the embedding for one message (message sync is itself idempotent). */
  public void upsertEmbedding(
      String messageId, String chatId, Long userDetailId, float[] embedding) {
    vectorJdbcTemplate.update(
        """
        INSERT INTO message_embedding (id_message, fk_id_chat, fk_id_user_detail, embedding)
        VALUES (?, ?, ?, ?::vector)
        ON CONFLICT (id_message) DO UPDATE
          SET fk_id_chat = EXCLUDED.fk_id_chat, embedding = EXCLUDED.embedding
        """,
        messageId,
        chatId,
        userDetailId,
        toVectorLiteral(embedding));
  }

  /**
   * Returns the {@code limit} messages closest to {@code queryEmbedding} for this user, ordered by
   * ascending cosine distance ({@code <=>}, matching the HNSW index's {@code vector_cosine_ops}).
   */
  public List<VectorMatch> search(Long userDetailId, float[] queryEmbedding, int limit) {
    String literal = toVectorLiteral(queryEmbedding);
    return vectorJdbcTemplate.query(
        """
        SELECT id_message, fk_id_chat, embedding <=> ?::vector AS distance
        FROM message_embedding
        WHERE fk_id_user_detail = ?
        ORDER BY embedding <=> ?::vector
        LIMIT ?
        """,
        (rs, rowNum) ->
            new VectorMatch(
                rs.getString("id_message"), rs.getString("fk_id_chat"), rs.getDouble("distance")),
        literal,
        userDetailId,
        literal,
        limit);
  }

  /** Converts a float array into pgvector's text literal form, e.g. {@code [0.1,0.2,0.3]}. */
  static String toVectorLiteral(float[] embedding) {
    StringBuilder sb = new StringBuilder(embedding.length * 8 + 2);
    sb.append('[');
    for (int i = 0; i < embedding.length; i++) {
      if (i > 0) {
        sb.append(',');
      }
      sb.append(embedding[i]);
    }
    sb.append(']');
    return sb.toString();
  }

  /** A single vector-search hit. {@code distance} is the cosine distance (0 = identical). */
  public record VectorMatch(String messageId, String chatId, double distance) {}
}
