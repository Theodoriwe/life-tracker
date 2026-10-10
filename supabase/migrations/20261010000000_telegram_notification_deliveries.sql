create table if not exists public.telegram_notification_deliveries (
  telegram_id bigint not null,
  notification_key text not null,
  sent_at timestamptz not null default now(),
  primary key (telegram_id, notification_key)
);

create index if not exists telegram_notification_deliveries_sent_at_idx
  on public.telegram_notification_deliveries (sent_at);

alter table public.telegram_notification_deliveries enable row level security;
revoke all on public.telegram_notification_deliveries from anon, authenticated;
grant select, insert, delete on public.telegram_notification_deliveries to service_role;
