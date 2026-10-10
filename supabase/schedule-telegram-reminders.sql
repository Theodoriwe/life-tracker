-- Run once in Supabase SQL Editor after deploying the Edge Function.
-- Replace both placeholders. Use the same random secret as REMINDER_CRON_SECRET
-- in Edge Function secrets. Do not commit a filled-in copy of this file.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists vault with schema vault;

select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'reminders_project_url');
select vault.create_secret('REPLACE_WITH_RANDOM_CRON_SECRET', 'reminders_cron_secret');

select cron.schedule(
  'telegram-reminders-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_project_url' order by created_at desc limit 1) || '/functions/v1/telegram-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_cron_secret' order by created_at desc limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
