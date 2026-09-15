alter table transcript_projects
  add column if not exists version integer not null default 1;

create index if not exists transcript_projects_updated_id_idx
  on transcript_projects (updated_at desc, id desc);
