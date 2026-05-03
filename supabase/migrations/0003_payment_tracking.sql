-- Payment tracking per team.
-- paid_at is set when the host marks the team as having paid.
alter table tournament_teams
  add column if not exists paid_at timestamptz null;
