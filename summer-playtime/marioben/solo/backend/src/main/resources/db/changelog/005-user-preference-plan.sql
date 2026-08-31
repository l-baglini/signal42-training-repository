--liquibase formatted sql
--changeset mario:005-user-preference-plan

ALTER TABLE user_preference
    DROP COLUMN backup_active,
    DROP COLUMN cloud_provider;

ALTER TABLE user_preference
    ADD COLUMN fk_id_plan BIGINT COMMENT 'Plan chosen by the user',
    ADD CONSTRAINT user_preference_plan_fk FOREIGN KEY (fk_id_plan) REFERENCES plan (id_plan);