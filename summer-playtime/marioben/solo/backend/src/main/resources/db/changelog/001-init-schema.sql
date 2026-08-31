--liquibase formatted sql
--changeset mario:001-init-schema

CREATE TABLE authority
(
    id_authority BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT 'Internal primary key',
    keyword      VARCHAR(255) NOT NULL COMMENT 'Unique permission code',
    name         VARCHAR(255) COMMENT 'Name of the permission',
    category     VARCHAR(255) COMMENT 'Category the permission belongs to',
    module       VARCHAR(1000) COMMENT 'Application module or area the permission refers to',
    description  VARCHAR(1000) COMMENT 'Extended description of what the permission allows'
) COMMENT = 'List of available authorities (permissions)';

CREATE TABLE role
(
    id_role     BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT 'Internal primary key',
    name        VARCHAR(255) COMMENT 'Role name',
    description VARCHAR(1000) COMMENT 'Description of what a user with this role can do'
) COMMENT = 'List of roles to be assigned to a user';

CREATE TABLE authority_role
(
    id_authority_role BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT 'Internal primary key',
    fk_id_role        BIGINT NOT NULL COMMENT 'Role to which the permission is assigned',
    fk_id_authority   BIGINT NOT NULL COMMENT 'Permission assigned to the role',
    CONSTRAINT authority_role_authority_fk FOREIGN KEY (fk_id_authority) REFERENCES authority (id_authority),
    CONSTRAINT authority_role_role_fk FOREIGN KEY (fk_id_role) REFERENCES role (id_role)
) COMMENT = 'Junction table that associates a set of authorities to a role';

CREATE TABLE user_detail
(
    id_user_detail BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT 'Internal primary key',
    fk_id_role     BIGINT COMMENT 'Role assigned to the user (nullable: user with no role)',
    name           VARCHAR(255) NOT NULL COMMENT 'Display name chosen at registration',
    email          VARCHAR(300) NOT NULL UNIQUE COMMENT 'Login email (unique)',
    password       VARCHAR(255) NOT NULL COMMENT 'BCrypt-hashed password',
    enable         BOOLEAN      NOT NULL DEFAULT TRUE COMMENT 'Whether the account is enabled',
    deleted        BOOLEAN      NOT NULL DEFAULT FALSE COMMENT 'status of user: TRUE = deleted, FALSE = active',
    CONSTRAINT fk_user_details_role FOREIGN KEY (fk_id_role) REFERENCES role (id_role)
) COMMENT = 'Registry of user details';
