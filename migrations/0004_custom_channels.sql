-- RealSignal 5.0: user-owned channel recipes.
-- The recipe is intentionally separate from the verified program catalog: a
-- custom channel describes what to discover, while only verified catalog rows
-- are eligible for playback.
CREATE TABLE IF NOT EXISTS custom_channels (
  channel_id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  name TEXT NOT NULL,
  recipe_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_custom_channels_owner
  ON custom_channels(owner_key, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_custom_channels_status
  ON custom_channels(status, updated_at DESC);
