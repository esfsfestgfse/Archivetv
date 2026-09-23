-- RealSignal V4 adaptive catalog state.
-- This ledger is intentionally separate from channel_programs: catalog rows
-- describe availability, while this table records what a channel has actually
-- served so freshness survives browser, device, and session changes.
CREATE TABLE IF NOT EXISTS channel_freshness (
  channel_key TEXT NOT NULL,
  program_id TEXT NOT NULL,
  last_served_at INTEGER NOT NULL,
  play_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (channel_key, program_id),
  FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_channel_freshness_recent
  ON channel_freshness(channel_key, last_served_at DESC);

CREATE INDEX IF NOT EXISTS idx_channel_freshness_program
  ON channel_freshness(program_id, last_served_at DESC);
