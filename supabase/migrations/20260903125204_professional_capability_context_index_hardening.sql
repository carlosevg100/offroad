-- Cover the optional audit actor foreign key used during user and organization cleanup.
create index if not exists institution_capability_profiles_updated_by_idx
  on public.institution_capability_profiles (updated_by)
  where updated_by is not null;
