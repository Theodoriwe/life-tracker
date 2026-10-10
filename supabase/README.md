# Telegram reminders

The Mini App saves user data in the existing `public.users` table (`telegram_id`, `data`). The scheduled Edge Function reads this data every minute and sends private messages through the bot that opens the Mini App.

## One-time setup

1. In the Supabase SQL Editor, run `migrations/20261010000000_telegram_notification_deliveries.sql`. This creates the delivery log used to prevent duplicate messages.
2. Deploy the function from the repository root with `supabase login`, `supabase link --project-ref YOUR_PROJECT_REF`, then `supabase functions deploy telegram-reminders --no-verify-jwt`. The function has its own `x-cron-secret` check. Do not expose its URL as a public webhook.
3. In Supabase Dashboard → Edge Functions → Secrets, set `TELEGRAM_BOT_TOKEN` to the token for the bot that opens this Mini App. Set `REMINDER_CRON_SECRET` to a long random string. Never put these values in `VITE_*` variables, GitHub code, or this SQL template. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied to Edge Functions by Supabase.
4. Copy `schedule-telegram-reminders.sql`, replace `YOUR_PROJECT_REF` and `REPLACE_WITH_RANDOM_CRON_SECRET` in your private copy, and run it in the Supabase SQL Editor. Use the same random string as `REMINDER_CRON_SECRET`. The SQL stores it in Supabase Vault and schedules one invocation per minute.
5. In the GitHub repository settings, set Actions variable `VITE_TELEGRAM_REMINDERS_READY=true` and rerun the Pages deployment. This only removes the setup notice in the app; it does not deploy the function.

Each user must open the bot chat and press **Start**, or grant write access from the Mini App. They then enable the desired reminders in Settings and save. The time zone is captured from their device when they save settings. Bot messages only work for users whose data successfully syncs to the Supabase `users` table.

The schedule checks exact local minutes. A minute missed because the cron or Edge Function was offline is not sent later. The delivery log prevents a second send for the same scheduled message. For diagnosis, inspect Edge Function logs and `public.telegram_notification_deliveries`. Telegram delivery errors such as a blocked bot are logged server-side.

For large user counts, move from a full `users` scan to a queue of upcoming reminders. The current implementation is suitable for a small project.
