-- Players created by public self-registration should not appear in the host
-- player roster (they cause duplicate/variant name noise). Mark them with a
-- flag so the host queries can filter them out while still keeping them
-- available for tournament team lookups.

alter table players
  add column if not exists from_public_registration boolean not null default false;

-- Re-create register_for_tournament to stamp the flag on auto-created players.
create or replace function register_for_tournament(
  p_tenant_id uuid,
  p_tournament_id uuid,
  p_player1_name text,
  p_player1_phone text,
  p_player2_name text,
  p_player2_phone text
) returns tournament_registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t tournaments%rowtype;
  v_phone1 text := smashboard_normalize_phone(p_player1_phone);
  v_phone2 text := smashboard_normalize_phone(p_player2_phone);
  v_name1 text := nullif(btrim(p_player1_name), '');
  v_name2 text := nullif(btrim(p_player2_name), '');
  v_player1_id uuid;
  v_player2_id uuid;
  v_team_count int;
  v_team_id uuid;
  v_status text;
  v_reg tournament_registrations%rowtype;
begin
  if v_name1 is null then
    raise exception 'player1_name required';
  end if;

  select * into v_t from tournaments where id = p_tournament_id for update;
  if not found then
    raise exception 'tournament not found';
  end if;
  if v_t.tenant_id <> p_tenant_id then
    raise exception 'tournament not in this venue';
  end if;
  if v_t.status <> 'draft' then
    raise exception 'tournament not open for registration';
  end if;
  if not v_t.open_registration then
    raise exception 'tournament not open for registration';
  end if;
  if v_t.max_teams is null then
    raise exception 'tournament has no slot limit set';
  end if;

  select count(*)::int into v_team_count
    from tournament_teams
   where tournament_id = p_tournament_id;

  if v_team_count < v_t.max_teams then
    if v_phone1 is not null then
      select id into v_player1_id from players
       where tenant_id = p_tenant_id and phone = v_phone1;
    end if;
    if v_player1_id is null then
      insert into players (tenant_id, name, phone, level, active, from_public_registration)
      values (p_tenant_id, v_name1, v_phone1, 5.0, true, true)
      returning id into v_player1_id;
    end if;

    if v_name2 is not null then
      if v_phone2 is not null then
        select id into v_player2_id from players
         where tenant_id = p_tenant_id and phone = v_phone2;
      end if;
      if v_player2_id is null then
        insert into players (tenant_id, name, phone, level, active, from_public_registration)
        values (p_tenant_id, v_name2, v_phone2, 5.0, true, true)
        returning id into v_player2_id;
      end if;
    end if;

    insert into tournament_teams (tournament_id, group_id, player1_id, player2_id, seed)
    values (p_tournament_id, null, v_player1_id, v_player2_id, null)
    returning id into v_team_id;

    v_status := 'approved';
  else
    v_status := 'pending';
  end if;

  insert into tournament_registrations (
    tenant_id, tournament_id, status,
    player1_name, player1_phone,
    player2_name, player2_phone,
    created_player1_id, created_player2_id, tournament_team_id
  ) values (
    p_tenant_id, p_tournament_id, v_status,
    v_name1, v_phone1,
    v_name2, v_phone2,
    v_player1_id, v_player2_id, v_team_id
  ) returning * into v_reg;

  return v_reg;
end;
$$;

grant execute on function register_for_tournament(uuid, uuid, text, text, text, text) to anon;

-- Re-create approve_registration with the same flag.
create or replace function approve_registration(p_registration_id uuid)
returns tournament_registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reg tournament_registrations%rowtype;
  v_t tournaments%rowtype;
  v_team_count int;
  v_player1_id uuid;
  v_player2_id uuid;
  v_team_id uuid;
begin
  select * into v_reg from tournament_registrations
   where id = p_registration_id
   for update;
  if not found then
    raise exception 'registration not found';
  end if;
  if v_reg.status <> 'pending' then
    raise exception 'registration is not pending';
  end if;

  select * into v_t from tournaments where id = v_reg.tournament_id for update;
  if not found then
    raise exception 'tournament not found';
  end if;
  if v_t.max_teams is null then
    raise exception 'tournament has no slot limit set';
  end if;

  select count(*)::int into v_team_count
    from tournament_teams
   where tournament_id = v_reg.tournament_id;
  if v_team_count >= v_t.max_teams then
    raise exception 'no slots available';
  end if;

  if v_reg.player1_phone is not null then
    select id into v_player1_id from players
     where tenant_id = v_reg.tenant_id and phone = v_reg.player1_phone;
  end if;
  if v_player1_id is null then
    insert into players (tenant_id, name, phone, level, active, from_public_registration)
    values (v_reg.tenant_id, v_reg.player1_name, v_reg.player1_phone, 5.0, true, true)
    returning id into v_player1_id;
  end if;

  if v_reg.player2_name is not null then
    if v_reg.player2_phone is not null then
      select id into v_player2_id from players
       where tenant_id = v_reg.tenant_id and phone = v_reg.player2_phone;
    end if;
    if v_player2_id is null then
      insert into players (tenant_id, name, phone, level, active, from_public_registration)
      values (v_reg.tenant_id, v_reg.player2_name, v_reg.player2_phone, 5.0, true, true)
      returning id into v_player2_id;
    end if;
  end if;

  insert into tournament_teams (tournament_id, group_id, player1_id, player2_id, seed)
  values (v_reg.tournament_id, null, v_player1_id, v_player2_id, null)
  returning id into v_team_id;

  update tournament_registrations
     set status = 'approved',
         created_player1_id = v_player1_id,
         created_player2_id = v_player2_id,
         tournament_team_id = v_team_id
   where id = p_registration_id
   returning * into v_reg;

  return v_reg;
end;
$$;

grant execute on function approve_registration(uuid) to anon;
