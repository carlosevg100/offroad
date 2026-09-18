-- Cover the tenant/work revision FK and serve paginated immutable history.
create index contribution_revisions_work_history_idx on public.contribution_revisions(organization_id,work_id,contribution_id,revision desc);
create index work_contributions_page_idx on public.work_contributions(organization_id,work_id,channel_id,created_at desc,id desc);
drop index public.work_contributions_channel_idx;
