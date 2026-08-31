--liquibase formatted sql
--changeset mario:006-add-message

-- Index of messages whose content lives in S3 (see com.solo.message.service.MessageStorageService).
-- This table is deliberately thin: MySQL gives us fast lookup/delete by chat and a durable
-- pointer (s3_prefix) to the content, while S3 stores the actual message body and attachments.
-- We never use S3 itself as a database.
CREATE TABLE message
(
    id_message        VARCHAR(64)  NOT NULL PRIMARY KEY COMMENT 'Client-generated message id',
    fk_id_chat        VARCHAR(36)  NOT NULL COMMENT 'Chat the message belongs to',
    fk_id_user_detail BIGINT       NOT NULL COMMENT 'Owner of the message (S3 tenant partition)',
    created_at        DATETIME     NOT NULL COMMENT 'Message creation time, sent by the client',
    s3_prefix         VARCHAR(500) NOT NULL COMMENT 'S3 key prefix holding message.json and attachments/',
    CONSTRAINT message_chat_fk FOREIGN KEY (fk_id_chat) REFERENCES chat (id_chat),
    CONSTRAINT message_user_detail_fk FOREIGN KEY (fk_id_user_detail) REFERENCES user_detail (id_user_detail)
) COMMENT = 'Index of messages persisted in S3: this table is the lookup, S3 holds the content';

CREATE INDEX message_chat_idx ON message (fk_id_chat);
