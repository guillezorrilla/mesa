-- Anonymous install counts (ADR-0026). Days are the broker's UTC date; no IP or request detail is kept.
CREATE TABLE installs (
  id TEXT PRIMARY KEY,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  version TEXT NOT NULL,
  channel TEXT NOT NULL
);

-- One row each time an install first runs a version: how fast releases are adopted.
CREATE TABLE install_versions (
  id TEXT NOT NULL,
  version TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  PRIMARY KEY (id, version)
);
