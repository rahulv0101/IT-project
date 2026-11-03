-- Online sessions no longer require a meeting URL. Keep room requirements for in-person sessions.
ALTER TABLE group_sessions DROP CONSTRAINT group_sessions_location_check;
ALTER TABLE group_sessions ADD CONSTRAINT group_sessions_location_check CHECK (
  (mode='online' AND length(trim(location)) BETWEEN 0 AND 500)
  OR (mode='in_person' AND length(trim(location)) BETWEEN 1 AND 500)
);
