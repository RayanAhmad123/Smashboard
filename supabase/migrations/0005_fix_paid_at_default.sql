-- Defensive: ensure paid_at has no DB-level default that would auto-mark
-- newly inserted teams as paid. The column should remain plain nullable
-- timestamptz, only set by markTeamPaid().
alter table tournament_teams
  alter column paid_at drop default;
