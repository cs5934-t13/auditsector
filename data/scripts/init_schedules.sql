CREATE TABLE IF NOT EXISTS schedules (
    schedule_id     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    created_by      BIGINT UNSIGNED NOT NULL,
    source_link     VARCHAR(255) NOT NULL UNIQUE,
    scan_frequency  ENUM('HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'ARCHIVE') NOT NULL DEFAULT 'WEEKLY',
    -- ACTIVE schedules are scanned. UNSUPPORTED means no spider can handle the
    -- URL, and DISABLED is an operator switch; both are skipped by the worker.
    scan_status     ENUM('ACTIVE', 'UNSUPPORTED', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    -- Why the last run failed. Three fields, for three audiences: a stable code
    -- the UI translates, a short sentence it shows, and raw technical detail
    -- reserved for administrators. All NULL after a success.
    last_error_code ENUM('UNSUPPORTED_SOURCE', 'SOURCE_UNREADABLE', 'SCAN_TIMEOUT', 'SCAN_FAILED') NULL,
    last_error      TEXT NULL,
    last_error_detail TEXT NULL,
    -- Progress for the run currently in flight. `current_run_started_at` being
    -- non-NULL *is* the "scanning" signal; `last_run_status` stays an
    -- outcome-only ENUM (SUCCESS/ERROR). All four are cleared when the run ends,
    -- so a stale bar never outlives its run.
    current_run_started_at DATETIME NULL,
    -- Reports the source listed, once the collection page has been parsed.
    run_total       INT UNSIGNED NULL,
    run_downloaded  INT UNSIGNED NOT NULL DEFAULT 0,
    run_processed   INT UNSIGNED NOT NULL DEFAULT 0,
    last_run_at     DATETIME NULL,
    last_run_status ENUM('SUCCESS', 'ERROR') NULL,
    next_run_at     DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_users_schedules
        FOREIGN KEY (created_by) REFERENCES users(user_id)
        ON DELETE RESTRICT,
    INDEX idx_schedule_due (scan_frequency, next_run_at)
);
