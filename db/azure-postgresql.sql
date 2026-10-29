CREATE TABLE IF NOT EXISTS workspaces (
  owner_id TEXT PRIMARY KEY NOT NULL,
  generation TEXT NOT NULL,
  state_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  processed_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  owner_id TEXT NOT NULL,
  bucket TEXT NOT NULL,
  window_start BIGINT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner_id, bucket)
);
