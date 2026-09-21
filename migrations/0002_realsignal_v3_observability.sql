-- RealSignal V3 observability and release-gate data.
-- Event rows are deliberately bounded at the API edge; aggregates keep the
-- guide/health surface fast without requiring the client to scan raw history.
CREATE TABLE IF NOT EXISTS playback_events (
  id TEXT PRIMARY KEY,
  channel_key TEXT NOT NULL,
  client_key TEXT NOT NULL,
  surface TEXT NOT NULL DEFAULT 'unknown',
  cast_connected INTEGER NOT NULL DEFAULT 0,
  event_type TEXT NOT NULL,
  value_ms REAL,
  queue_depth INTEGER,
  program_id TEXT,
  source_key TEXT,
  created_at INTEGER NOT NULL,
  metadata_json TEXT
);

CREATE TABLE IF NOT EXISTS channel_health (
  channel_key TEXT PRIMARY KEY,
  samples INTEGER NOT NULL DEFAULT 0,
  first_frame_count INTEGER NOT NULL DEFAULT 0,
  first_frame_total_ms REAL NOT NULL DEFAULT 0,
  first_frame_last_ms REAL,
  switch_count INTEGER NOT NULL DEFAULT 0,
  switch_total_ms REAL NOT NULL DEFAULT 0,
  switch_last_ms REAL,
  guide_count INTEGER NOT NULL DEFAULT 0,
  guide_total_ms REAL NOT NULL DEFAULT 0,
  guide_last_ms REAL,
  queue_samples INTEGER NOT NULL DEFAULT 0,
  queue_total_depth REAL NOT NULL DEFAULT 0,
  queue_last_depth INTEGER,
  repeats INTEGER NOT NULL DEFAULT 0,
  skips INTEGER NOT NULL DEFAULT 0,
  stalls INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  recoveries INTEGER NOT NULL DEFAULT 0,
  last_status TEXT,
  last_seen_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_playback_events_channel_time ON playback_events(channel_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_playback_events_source_time ON playback_events(source_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_channel_health_score ON channel_health(failures DESC, stalls DESC, repeats DESC, last_seen_at DESC);
