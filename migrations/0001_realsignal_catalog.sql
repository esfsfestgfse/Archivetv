-- Durable catalog model. Media URLs are references only; playback remains
-- provider-owned and every item keeps its source and rights metadata.
CREATE TABLE IF NOT EXISTS programs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  source_identifier TEXT,
  title TEXT NOT NULL,
  description TEXT,
  duration_seconds REAL,
  aspect_ratio REAL,
  media_type TEXT NOT NULL DEFAULT 'video',
  media_url TEXT,
  source_url TEXT,
  rights TEXT,
  year TEXT,
  metadata_json TEXT,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS channel_programs (
  channel_key TEXT NOT NULL,
  program_id TEXT NOT NULL,
  score REAL NOT NULL DEFAULT 0,
  last_seen_at INTEGER NOT NULL,
  PRIMARY KEY (channel_key, program_id),
  FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS channel_rules (
  channel_key TEXT PRIMARY KEY,
  rules_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS source_health (
  source_key TEXT PRIMARY KEY,
  successes INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  cooldown_until INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_channel_programs_recent ON channel_programs(channel_key, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_programs_provider ON programs(provider, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_programs_status ON programs(status, last_seen_at DESC);
