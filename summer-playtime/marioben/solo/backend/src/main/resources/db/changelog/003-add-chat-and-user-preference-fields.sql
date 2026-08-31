--liquibase formatted sql
--changeset mario:003-add-chat-and-user-preference-fields

CREATE TABLE chat
(
    id_chat           VARCHAR(36)  NOT NULL PRIMARY KEY COMMENT 'Client-generated UUID, matches local SQLite messages.chat_id',
    fk_id_user_detail BIGINT       NOT NULL COMMENT 'Owner of the chat',
    name              VARCHAR(255) NOT NULL COMMENT 'Chat display name',
    icon              VARCHAR(50)  NOT NULL COMMENT 'Icon key, see frontend chatOptions.ts',
    color             VARCHAR(50)  NOT NULL COMMENT 'Color key, see frontend chatOptions.ts',
    favorite          BOOLEAN      NOT NULL DEFAULT FALSE COMMENT 'Favorite flag',
    backup            BOOLEAN      NOT NULL DEFAULT FALSE COMMENT 'Whether the chat is opted into backup',
    security_mode     VARCHAR(20)  NOT NULL DEFAULT 'none' COMMENT 'none | pin | face',
    security_pin_hash VARCHAR(255) COMMENT 'SHA-256 hash of PIN, set only when security_mode = pin',
    created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Creation time',
    updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last update time',
    CONSTRAINT chat_user_detail_fk FOREIGN KEY (fk_id_user_detail) REFERENCES user_detail (id_user_detail)
) COMMENT = 'Chat metadata synced across devices: message bodies stay device-local';

CREATE INDEX chat_user_detail_idx ON chat (fk_id_user_detail);

ALTER TABLE user_preference
    ADD COLUMN backup_active  BOOLEAN     NOT NULL DEFAULT TRUE COMMENT 'Whether backup is active for the user',
    ADD COLUMN cloud_provider VARCHAR(20) NOT NULL DEFAULT 'none' COMMENT 'none | drive';

ALTER TABLE user_preference
    ADD CONSTRAINT user_preference_user_detail_uq UNIQUE (fk_id_user_detail);
