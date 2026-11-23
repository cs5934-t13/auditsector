CREATE TABLE IF NOT EXISTS fetches (
    fetch_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    spider_id VARCHAR(255) NOT NULL,
    fetch_url VARCHAR(255) NOT NULL,
    fetched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- DOWNLOADED means the file is on disk but not yet in `audit_headers`;
    -- PROCESSED means the report was committed. Only PROCESSED suppresses a
    -- re-download, so a crawl killed mid-processing resumes instead of either
    -- re-fetching everything or silently dropping the unfinished reports.
    status ENUM('DOWNLOADED', 'PROCESSED') NOT NULL DEFAULT 'PROCESSED',
    UNIQUE KEY uq_fetch_source (spider_id, fetch_url)
);
