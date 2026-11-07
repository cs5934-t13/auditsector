-- Organization-wide text shown throughout the application.
--
-- A single row (settings_id = 1) holds every setting. GET /settings creates it
-- on first read using these column defaults, so the table can be empty.
CREATE TABLE IF NOT EXISTS app_settings (
    settings_id            TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    organization_name      VARCHAR(200) NOT NULL DEFAULT 'City of Alexandria',
    password_reset_message VARCHAR(2000) NOT NULL
        DEFAULT 'To reset your password, contact the administrators.',
    general_help           VARCHAR(2000) NOT NULL
        DEFAULT 'For help using AuditSector, review the guidance below or contact your administrator.',
    updated_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_settings_single_row CHECK (settings_id = 1)
);
