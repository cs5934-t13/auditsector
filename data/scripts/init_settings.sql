-- Organization-wide text shown throughout the application.
--
-- A single row (settings_id = 1) holds every setting. GET /settings creates it
-- on first read using these column defaults, so the table can be empty.
--
-- `organization_name` is plain text. The other three hold a small, validated
-- subset of HTML (p, br, strong, em, u, ul, ol, li, a[href]) so an administrator
-- can format them in the settings editor; see `web/server/app/richtext.py`.
-- The defaults are HTML so a fresh database matches what the client renders.
-- A legacy plain-text value still works: the API converts it on read.
CREATE TABLE IF NOT EXISTS app_settings (
    settings_id            TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    organization_name      VARCHAR(200) NOT NULL DEFAULT 'City of Alexandria',
    password_reset_message VARCHAR(2000) NOT NULL
        DEFAULT '<p>To reset your password, contact the administrators.</p>',
    general_help           VARCHAR(2000) NOT NULL
        DEFAULT '<p>For help using Audit Sector, review the guidance below or contact your administrator.</p>',
    contact                VARCHAR(2000) NOT NULL
        DEFAULT '<p>Contact us at <a href="mailto:team@auditsector.example">team@auditsector.example</a>.</p>',
    updated_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_settings_single_row CHECK (settings_id = 1)
);
