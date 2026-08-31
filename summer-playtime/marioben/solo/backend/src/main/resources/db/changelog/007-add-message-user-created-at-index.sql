--liquibase formatted sql
--changeset mario:007-add-message-user-created-at-index

-- Supports the chats+messages recovery range query (com.solo.recovery), which filters messages by
-- (fk_id_user_detail, created_at). Without this index that scan falls back to the existing
-- fk_id_chat index (or a full scan), which degrades badly as the table grows.
CREATE INDEX message_user_created_idx ON message (fk_id_user_detail, created_at);
