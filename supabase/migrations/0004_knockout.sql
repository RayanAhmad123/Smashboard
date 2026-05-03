-- Knockout bracket support.
-- advances_per_group: how many teams per group advance to knockout (NULL = no playoffs).
-- has_bronze: whether a bronze/3rd-place match is played.
alter table tournaments
  add column if not exists advances_per_group smallint null,
  add column if not exists has_bronze boolean not null default false;

-- Tracks which team rests (has a bye) in a given round during group play
-- when a group has an odd number of teams.
create table if not exists round_rests (
  id              uuid primary key default gen_random_uuid(),
  tournament_id   uuid not null references tournaments(id) on delete cascade,
  round_number    int  not null,
  team_id         uuid not null references tournament_teams(id) on delete cascade,
  unique (tournament_id, round_number, team_id)
);
