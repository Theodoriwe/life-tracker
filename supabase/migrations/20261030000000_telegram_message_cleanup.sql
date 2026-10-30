alter table public.telegram_notification_deliveries
  add column if not exists telegram_message_id bigint;

grant select, insert, update, delete on public.telegram_notification_deliveries to service_role;
