--liquibase formatted sql
--changeset mario:004-add-plan

CREATE TABLE plan
(
    id_plan     BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT 'Internal primary key',
    title       VARCHAR(255)   NOT NULL COMMENT 'Plan title',
    description VARCHAR(1000)  NOT NULL COMMENT 'Plan description',
    price       DECIMAL(10, 2) NOT NULL COMMENT 'Plan price'
) COMMENT = 'Subscription plans offered to users';

INSERT INTO plan (title, description, price)
VALUES ('Free', 'Funzionalita di base per iniziare', 0.00),
       ('Pro', 'Funzionalita avanzate per utenti singoli', 4.99),
       ('Premium', 'Tutte le funzionalita senza limiti', 9.99);