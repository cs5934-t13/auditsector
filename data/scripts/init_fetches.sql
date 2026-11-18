CREATE TABLE IF NOT EXISTS fetches (
    fetch_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    spider_id VARCHAR(255) NOT NULL,
    fetch_url VARCHAR(255) NOT NULL,
    fetched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_fetch_source (spider_id, fetch_url)
);
