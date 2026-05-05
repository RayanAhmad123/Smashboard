-- Add archived_at column to tournaments for soft-archiving sessions.
alter table tournaments
  add column if not exists archived_at timestamptz null;
