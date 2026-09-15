create table if not exists transcript_projects (
  id uuid primary key,
  title text not null,
  summary text not null,
  transcript text not null,
  map_json jsonb not null,
  position_overrides_json jsonb not null default '{}'::jsonb,
  selected_node_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
