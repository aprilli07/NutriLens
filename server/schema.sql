-- NutriLens schema (MySQL 8+). Applied by `npm run db:migrate`.

CREATE TABLE IF NOT EXISTS products (
  code             VARCHAR(64)  NOT NULL PRIMARY KEY,
  name             VARCHAR(255) NOT NULL,
  brands           VARCHAR(255) NULL,
  ingredients_text TEXT         NULL,
  allergen_tags    VARCHAR(512) NULL,
  trace_tags       VARCHAR(512) NULL,
  label_tags       VARCHAR(1024) NULL,
  analysis_tags    VARCHAR(255) NULL,  -- OFF ingredients_analysis_tags (used only as eval ground truth)
  countries        VARCHAR(255) NULL,
  nutriscore       CHAR(1)      NULL,
  image_url        VARCHAR(512) NULL,
  energy_kcal      FLOAT NULL,
  fat              FLOAT NULL,
  saturated_fat    FLOAT NULL,
  carbohydrates    FLOAT NULL,
  sugars           FLOAT NULL,
  fiber            FLOAT NULL,
  proteins         FLOAT NULL,
  salt             FLOAT NULL,
  sodium           FLOAT NULL,
  scans            INT UNSIGNED NOT NULL DEFAULT 0,       -- OFF unique_scans_n, used for ranking
  avoid_mask       SMALLINT UNSIGNED NOT NULL DEFAULT 0,  -- bit i set => restriction i says "avoid"
  unsure_mask     SMALLINT UNSIGNED NOT NULL DEFAULT 0,  -- bit i set => caution or not enough data for restriction i
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Search tier 1: the products people actually scan (OFF unique_scans_n >= 2), ordered by popularity.
-- Small enough to stay in memory, so ranking by `id` is cheap. Rebuilt by the importer.
CREATE TABLE IF NOT EXISTS product_search (
  id           INT UNSIGNED NOT NULL PRIMARY KEY,  -- popularity rank, 1 = most scanned
  code         VARCHAR(64)  NOT NULL,
  name         VARCHAR(255) NOT NULL,
  brands       VARCHAR(255) NULL,
  image_url    VARCHAR(512) NULL,
  nutriscore   CHAR(1)      NULL,
  avoid_mask   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  unsure_mask SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  FULLTEXT KEY ft_search_name (name, brands)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Vocabulary for typo correction and autocomplete, built by the importer from product names and brands.
CREATE TABLE IF NOT EXISTS search_terms (
  term VARCHAR(64) NOT NULL PRIMARY KEY,
  freq INT UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  display_name  VARCHAR(100) NULL,
  restrictions  JSON NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Every scan made on any device signed in to the household account, so parents can follow along.
CREATE TABLE IF NOT EXISTS scans (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  code         VARCHAR(64)  NOT NULL,
  name         VARCHAR(255) NOT NULL,
  image_url    VARCHAR(512) NULL,
  verdict      ENUM('good', 'caution', 'avoid', 'unknown') NOT NULL,
  restrictions JSON NOT NULL,
  scanned_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_scans_user_time (user_id, scanned_at),
  CONSTRAINT fk_scans_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Cached Gemini explanations, keyed by sha256(code + restrictions + model).
CREATE TABLE IF NOT EXISTS ai_cache (
  cache_key  CHAR(64) NOT NULL PRIMARY KEY,
  payload    JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
