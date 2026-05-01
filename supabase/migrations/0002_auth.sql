-- Authentication: link auth.users to tenants, and a super_admins allowlist.
-- Access control is enforced at the application layer (server pages call
-- requireTenantAccess / requireSuperAdmin); RLS stays permissive for now
-- because the TV display and customer /play routes must remain public.

create table if not exists tenant_users (
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'host' check (role in ('owner', 'host')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create index if not exists tenant_users_user_idx on tenant_users (user_id);

create table if not exists super_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);
