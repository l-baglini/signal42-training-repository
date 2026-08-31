--liquibase formatted sql
--changeset mario:002-add-backup-and-user-preference

CREATE TABLE backup
(
    id_backup BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT 'Internal primary key',
    name      VARCHAR(255) NOT NULL COMMENT 'Backup name'
) COMMENT = 'List of backups';

CREATE TABLE user_preference
(
    id_user_preference BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT 'Internal primary key',
    fk_id_user_detail   BIGINT NOT NULL COMMENT 'User the preference belongs to',
    fk_id_backup        BIGINT COMMENT 'Backup associated to the user preference',
    CONSTRAINT user_preference_user_detail_fk FOREIGN KEY (fk_id_user_detail) REFERENCES user_detail (id_user_detail),
    CONSTRAINT user_preference_backup_fk FOREIGN KEY (fk_id_backup) REFERENCES backup (id_backup)
) COMMENT = 'User preferences';