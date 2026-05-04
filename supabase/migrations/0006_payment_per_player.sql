-- Payment is tracked per individual player rather than per team.
-- Drop the team-level paid_at and add a paid_at per slot.
alter table tournament_teams
  drop column if exists paid_at,
  add column if not exists player1_paid_at timestamptz null,
  add column if not exists player2_paid_at timestamptz null;
