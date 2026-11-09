CREATE TABLE IF NOT EXISTS audit_headers(
    audit_id    CHAR(36) PRIMARY KEY,
    schedule_id BIGINT UNSIGNED NOT NULL,
    title       VARCHAR(255) NOT NULL,
    muni        VARCHAR(255) DEFAULT '' NOT NULL,
    audit_date  DATETIME NOT NULL,
    risk_level  ENUM('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NULL,
    run_status  ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED') DEFAULT 'PENDING' NOT NULL,
    summary     TEXT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- CONSTRAINT fk_audit_schedule
    --     Foreign Key (schedule_id) REFERENCES schedules(schedule_id)
    --     ON DELETE RESTRICT,
    INDEX idx_audit_schedule_date (schedule_id, audit_date),
    INDEX idx_audit_risk (risk_level),
    INDEX idx_audit_status (run_status)
);


CREATE TABLE IF NOT EXISTS tags(
    tag_id      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS audit_tags(
    audit_id    CHAR(36) NOT NULL,
    tag_id      BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (audit_id, tag_id),
    INDEX idx_tag_audit (tag_id, audit_id),
    CONSTRAINT fk_at_audit
        Foreign Key (audit_id)  REFERENCES audit_headers(audit_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_at_tag
        Foreign Key (tag_id)    REFERENCES tags(tag_id)
        ON DELETE RESTRICT
);
