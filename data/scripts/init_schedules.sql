CREATE TABLE IF NOT EXISTS schedules (
    schedule_id     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    created_by      BIGINT UNSIGNED NOT NULL,
    source_link     VARCHAR(255) NOT NULL UNIQUE,
    scan_frequency  ENUM('HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'ARCHIVE') NOT NULL DEFAULT 'WEEKLY',
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
