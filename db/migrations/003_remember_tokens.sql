create table if not exists remember_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  selector      text not null unique,
  validator_hash bytea not null,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz not null default now(),
  expires_at    timestamptz not null
);
create index if not exists remember_tokens_user_idx on remember_tokens (user_id);
create index if not exists remember_tokens_expires_idx on remember_tokens (expires_at);
