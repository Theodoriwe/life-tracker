import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Goal = {
  id?: string;
  title?: string;
  group?: string;
  scheduledFor?: string | null;
  deadline?: string | null;
  time?: string | null;
  createdAt?: string | null;
  icon?: string;
  priority?: "high" | "medium" | "low";
  recurring?: string;
  recurrenceSeriesId?: string;
  recurrenceEndDate?: string | null;
  recurrenceSkippedDates?: string[];
  recurrenceState?: Record<string, { completed?: boolean; missed?: boolean; missedStreak?: number }>;
  subtasks?: { id: string; title?: string; done?: boolean }[];
  nextStepTitle?: string;
  continuationFromId?: string;
  continuationFromTitle?: string;
  continuationGoalId?: string;
  completed?: boolean;
  archived?: boolean;
};

type Medication = {
  id?: string;
  name?: string;
  doseUnit?: "tablets" | "drops";
  unitsPerDose?: number;
  frequency?: string;
  times?: string[];
  intervalDays?: number;
  intervalTime?: string;
  startDate?: string;
};

type Settings = {
  userName?: string;
  telegramNotificationsEnabled?: boolean;
  medicationRemindersEnabled?: boolean;
  taskRemindersEnabled?: boolean;
  taskReminderIntervalHours?: number;
  startDayMessageEnabled?: boolean;
  startDayMessageTime?: string;
  endDaySummaryEnabled?: boolean;
  endDaySummaryTime?: string;
  notificationTimeZone?: string;
};

type Snapshot = {
  settings?: Settings;
  goals?: Goal[];
  medications?: Medication[];
  medicationLog?: Record<string, string[]>;
  workActivity?: Record<string, { totalSeconds?: number }>;
};

type InlineButton = { text: string; callback_data: string };
type Reminder = { key: string; text: string; keyboard?: InlineButton[][] };

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
const cronSecret = Deno.env.get("REMINDER_CRON_SECRET");

function localDateTime(now: Date, timeZone: string) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
  }
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? "00";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
    hour: Number(value("hour")),
    minute: Number(value("minute")),
  };
}

function localDayStartUtc(now: Date, timeZone: string): string {
  const localDate = localDateTime(now, timeZone).date;
  const guess = new Date(`${localDate}T00:00:00.000Z`);
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(guess);
  } catch {
    return `${localDate}T00:00:00.000Z`;
  }
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
  return new Date(guess.getTime() - (asUtc - guess.getTime())).toISOString();
}

function isGoalForDate(goal: Goal, date: string): boolean {
  if (goal.archived || goal.group !== "today") return false;
  if (!goal.recurring || goal.recurring === "none") {
    return (goal.scheduledFor ?? goal.deadline ?? goal.createdAt ?? date) === date;
  }
  if (goal.recurrenceEndDate && date > goal.recurrenceEndDate) return false;
  if (goal.recurrenceSkippedDates?.includes(date)) return false;
  const created = goal.createdAt ?? goal.scheduledFor ?? date;
  if (date < created) return false;
  if (goal.recurrenceSeriesId) return goal.scheduledFor === date;
  if (goal.recurring === "daily") return true;
  if (goal.recurring === "weekly") {
    const anchor = goal.scheduledFor ?? created;
    return new Date(`${anchor}T12:00:00Z`).getUTCDay() === new Date(`${date}T12:00:00Z`).getUTCDay();
  }
  return false;
}

function isGoalDone(goal: Goal, date: string): boolean {
  if (goal.recurring && goal.recurring !== "none") return Boolean(goal.recurrenceState?.[date]?.completed);
  return Boolean(goal.completed);
}

function plural(count: number, one: string, few: string, many: string): string {
  const lastTwo = count % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  const last = count % 10;
  return last === 1 ? one : last >= 2 && last <= 4 ? few : many;
}

function formatDose(medication: Medication): string {
  const count = Math.max(1, Math.floor(Number(medication.unitsPerDose) || 1));
  return `${count} ${medication.doseUnit === "drops"
    ? plural(count, "капля", "капли", "капель")
    : plural(count, "таблетка", "таблетки", "таблеток")}`;
}

function taskKeyboard(goals: Goal[], date: string): InlineButton[][] | undefined {
  const buttons = goals.slice(0, 5).flatMap(goal => {
    if (!goal.id) return [];
    const callbackData = `task|${date}|${goal.id}`;
    if (new TextEncoder().encode(callbackData).length > 64) return [];
    const title = String(goal.title ?? "Задача").trim() || "Задача";
    const shortTitle = [...title].slice(0, 36).join("");
    return [[{ text: `☑️ Отметить: ${shortTitle}`, callback_data: callbackData }]];
  });
  return buttons.length ? buttons : undefined;
}

function medicationTimesForDate(medication: Medication, date: string): string[] {
  if (medication.frequency === "daily") return Array.isArray(medication.times) ? medication.times : [];
  if (medication.frequency !== "interval" || !medication.intervalTime) return [];
  const start = medication.startDate || date;
  const days = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000);
  const interval = Math.max(1, Math.floor(Number(medication.intervalDays) || 1));
  return days >= 0 && days % interval === 0 ? [medication.intervalTime] : [];
}

function taskNames(goals: Goal[]): string {
  const names = goals.slice(0, 5).map(goal => `• ${String(goal.title ?? "Без названия").trim()}`).join("\n");
  return `${names}${goals.length > 5 ? `\n…и ещё ${goals.length - 5}` : ""}`;
}

function dueReminders(snapshot: Snapshot, now: Date): Reminder[] {
  const settings = snapshot.settings ?? {};
  if (!settings.telegramNotificationsEnabled) return [];
  const local = localDateTime(now, settings.notificationTimeZone || "UTC");
  const goals = (Array.isArray(snapshot.goals) ? snapshot.goals : []).filter(goal => isGoalForDate(goal, local.date));
  const unfinished = goals.filter(goal => !isGoalDone(goal, local.date));
  const untimedGoals = goals.filter(goal => !goal.time);
  const unfinishedUntimed = untimedGoals.filter(goal => !isGoalDone(goal, local.date));
  const activeGoals = (Array.isArray(snapshot.goals) ? snapshot.goals : []).filter(goal => !goal.archived && !goal.completed && goal.group === "longterm");
  const reminders: Reminder[] = [];

  if (settings.medicationRemindersEnabled) {
    const taken = snapshot.medicationLog?.[local.date] ?? [];
    for (const medication of Array.isArray(snapshot.medications) ? snapshot.medications : []) {
      if (!medication.id || !medication.name) continue;
      for (const time of medicationTimesForDate(medication, local.date)) {
        if (time !== local.time || taken.includes(`${medication.id}:${time}`)) continue;
        const callbackData = `med|${local.date}|${medication.id}|${time}`;
        reminders.push({
          key: `medication:${local.date}:${medication.id}:${time}`,
          text: `⏰ Время приёма\n${medication.name}\nДоза: ${formatDose(medication)} · ${time}\n\nНажмите кнопку, когда примете препарат — я отмечу приём в приложении.`,
          keyboard: new TextEncoder().encode(callbackData).length <= 64
            ? [[{ text: `💊 Принял(а) · ${formatDose(medication)}`, callback_data: callbackData }]]
            : undefined,
        });
      }
    }
  }

  const morningTime = settings.startDayMessageTime || "08:00";
  const eveningTime = settings.endDaySummaryTime || "21:00";
  if (settings.startDayMessageEnabled && local.time === morningTime) {
    const greeting = settings.userName?.trim() ? `Доброе утро, ${settings.userName.trim()}!` : "Доброе утро!";
    const tasks = goals.length
      ? `На сегодня запланировано ${goals.length} ${plural(goals.length, "задача", "задачи", "задач")}.${unfinished.length ? `\n${taskNames(unfinished)}` : "\nВсе задачи уже выполнены."}`
      : "На сегодня задач пока нет. Выберите одно или два важных дела, чтобы начать день с понятным планом.";
    reminders.push({
      key: `morning:${local.date}`,
      text: `${greeting}\n\n${tasks}\n\nДолгосрочных целей в работе: ${activeGoals.length}. Хорошего и спокойного дня!`,
      keyboard: taskKeyboard(unfinished, local.date),
    });
  }

  const tasksDueNow = settings.taskRemindersEnabled
    ? unfinished.filter(goal => goal.time === local.time)
    : [];
  if (tasksDueNow.length) {
    const count = tasksDueNow.length;
    reminders.push({
      key: `tasks-due:${local.date}:${local.time}:${tasksDueNow.map(goal => goal.id).filter(Boolean).sort().join(",")}`,
      text: `⏰ Время по плану\n${count === 1 ? "Сейчас запланирована задача:" : `Сейчас запланировано ${count} ${plural(count, "задача", "задачи", "задач")}:`}\n${taskNames(tasksDueNow)}\n\nВыдели немного времени и начни с первого шага. Если планы поменялись — перенеси задачу в приложении.`,
      keyboard: taskKeyboard(tasksDueNow, local.date),
    });
  }

  const interval = Math.min(12, Math.max(1, Math.floor(Number(settings.taskReminderIntervalHours) || 1)));
  if (settings.taskRemindersEnabled && unfinishedUntimed.length > 0 && local.minute === 0
    && local.hour % interval === 0 && local.time >= morningTime && local.time < eveningTime
    && !(settings.startDayMessageEnabled && local.time === morningTime)) {
    const completedUntimed = untimedGoals.length - unfinishedUntimed.length;
    const progress = untimedGoals.length
      ? `Из задач без времени выполнено ${completedUntimed} из ${untimedGoals.length}.`
      : "";
    const encouragement = completedUntimed === 0
      ? "Пока ни одна не сделана — это не повод себя ругать. Выбери самую простую и удели ей 5 минут."
      : `Уже выполнено ${completedUntimed} ${plural(completedUntimed, "задача", "задачи", "задач")} — отличное начало. Выбери следующую и продолжай в своём темпе.`;
    reminders.push({
      key: `tasks:${local.date}:${local.time}`,
      text: `Небольшой чек-ин 🌿\n${progress}\nОсталось ${unfinishedUntimed.length} ${plural(unfinishedUntimed.length, "задача", "задачи", "задач")} без времени:\n${taskNames(unfinishedUntimed)}\n\n${encouragement}`,
      keyboard: taskKeyboard(unfinishedUntimed, local.date),
    });
  }

  if (settings.endDaySummaryEnabled && local.time === eveningTime) {
    const completed = goals.length - unfinished.length;
    const workedSeconds = Math.max(0, Number(snapshot.workActivity?.[local.date]?.totalSeconds) || 0);
    const hours = Math.floor(workedSeconds / 3600);
    const minutes = Math.floor((workedSeconds % 3600) / 60);
    const taskSummary = goals.length
      ? `Выполнено ${completed} из ${goals.length} задач на сегодня.`
      : "Сегодня задачи не были запланированы. Завтра можно выбрать главное заранее.";
    reminders.push({
      key: `evening:${local.date}`,
      text: `Итоги дня\n${taskSummary}\nВ фокусе: ${hours} ч ${minutes} мин.\nДаже небольшой шаг сегодня имеет значение.`,
    });
  }

  return reminders;
}

type TelegramUpdate = {
  callback_query?: {
    id: string;
    data?: string;
    from?: { id: number };
    message?: {
      message_id: number;
      chat: { id: number; type?: string };
      reply_markup?: { inline_keyboard?: InlineButton[][] };
    };
  };
};

async function telegram(method: string, payload: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    throw new Error(`Telegram ${method} failed: ${response.status} ${JSON.stringify(result)}`);
  }
  return result;
}

async function deleteNotificationMessage(chatId: number, messageId: number) {
  try {
    await telegram("deleteMessage", { chat_id: chatId, message_id: messageId });
  } catch (error) {
    console.warn("Could not delete Telegram notification message", error);
    await telegram("editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [] },
    }).catch(() => undefined);
  }
}

async function replaceCallbackMessageWithNotice(chatId: number, messageId: number, text: string) {
  try {
    await telegram("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      reply_markup: { inline_keyboard: [] },
    });
  } catch (error) {
    console.warn("Could not update Telegram callback message", error);
    await deleteNotificationMessage(chatId, messageId);
  }
}

async function cleanupPreviousDayMessages(
  supabase: ReturnType<typeof createClient>,
  telegramId: number,
  now: Date,
  timeZone: string,
) {
  const local = localDateTime(now, timeZone);
  if (local.hour !== 0 || local.minute > 10) return;
  const { data: messages, error } = await supabase.from("telegram_notification_deliveries")
    .select("notification_key,telegram_message_id")
    .eq("telegram_id", telegramId)
    .lt("sent_at", localDayStartUtc(now, timeZone))
    .not("telegram_message_id", "is", null)
    .limit(100);
  if (error) {
    console.error("Could not load old Telegram messages for cleanup", error.message);
    return;
  }
  for (const message of messages ?? []) {
    const messageId = Number(message.telegram_message_id);
    try {
      await telegram("deleteMessage", { chat_id: telegramId, message_id: messageId });
      const { error: updateError } = await supabase.from("telegram_notification_deliveries")
        .update({ telegram_message_id: null })
        .eq("telegram_id", telegramId)
        .eq("notification_key", message.notification_key);
      if (updateError) console.error("Could not mark Telegram message as deleted", updateError.message);
    } catch (deleteError) {
      console.error("Could not delete previous-day Telegram message", deleteError);
    }
  }
}

async function telegramWebhookSecret(): Promise<string | undefined> {
  if (!cronSecret) return undefined;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`life-tracker-telegram-webhook:${cronSecret}`),
  );
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function ensureTelegramWebhook() {
  if (!supabaseUrl || !cronSecret) return;
  const webhookUrl = `${supabaseUrl}/functions/v1/telegram-reminders`;
  try {
    const info = await telegram("getWebhookInfo", {});
    const currentUrl = String(info.result?.url ?? "");
    if (currentUrl && currentUrl !== webhookUrl) {
      console.error("Telegram bot already has a different webhook URL; keeping its existing destination.");
      return;
    }
    await telegram("setWebhook", {
      url: webhookUrl,
      secret_token: await telegramWebhookSecret(),
      allowed_updates: ["callback_query"],
    });
  } catch (error) {
    console.error("Could not configure Telegram callback webhook", error);
  }
}

async function handleCallback(update: TelegramUpdate, supabase: ReturnType<typeof createClient>) {
  const query = update.callback_query;
  if (!query) return;
  const message = query.message;
  const chatId = message?.chat.id;
  const callbackData = query.data ?? "";
  // Telegram shows a spinner until this is acknowledged. Do it before any database work.
  await telegram("answerCallbackQuery", {
    callback_query_id: query.id,
    text: callbackData === "noop" ? "Уже отмечено ✅" : "Отмечаю…",
  }).catch(error => console.warn("Could not acknowledge Telegram callback immediately", error));
  if (callbackData === "noop") {
    if (message && chatId) await deleteNotificationMessage(chatId, message.message_id);
    return;
  }
  if (!message || !chatId || query.from?.id !== chatId || message.chat.type === "group" || message.chat.type === "supergroup") {
    return;
  }

  try {
    const [kind, date, itemId, time] = callbackData.split("|");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !itemId || (kind !== "task" && kind !== "med")) {
      await replaceCallbackMessageWithNotice(chatId, message.message_id, "Не удалось распознать действие. Откройте приложение и отметьте его там.");
      return;
    }
    const { data: user, error: userError } = await supabase.from("users").select("telegram_id,data").eq("telegram_id", chatId).maybeSingle();
    if (userError) throw userError;
    if (!user) {
      await replaceCallbackMessageWithNotice(chatId, message.message_id, "Не нашёл ваш профиль. Откройте приложение через бота.");
      return;
    }

    const snapshot = structuredClone((user.data ?? {}) as Snapshot);
    if (kind === "task") {
      const goal = (snapshot.goals ?? []).find(item => item.id === itemId);
      if (!goal || !isGoalForDate(goal, date)) {
        await replaceCallbackMessageWithNotice(chatId, message.message_id, "Эта задача уже недоступна. Проверьте её в приложении.");
        return;
      }
      if (!isGoalDone(goal, date)) {
        const timestamp = new Date().toISOString();
        if (goal.subtasks?.length) goal.subtasks = goal.subtasks.map(subtask => ({ ...subtask, done: true }));
        if (goal.recurring && goal.recurring !== "none") {
          goal.recurrenceState = {
            ...(goal.recurrenceState ?? {}),
            [date]: { ...(goal.recurrenceState?.[date] ?? {}), completed: true, missed: false, missedStreak: 0 },
          };
        } else {
          goal.completed = true;
          goal.completedAt = timestamp;
        }
        const nextTitle = goal.nextStepTitle?.trim();
        const existingContinuation = (snapshot.goals ?? []).some(item =>
          item.continuationFromId === goal.id || item.id === goal.continuationGoalId,
        );
        if (nextTitle && !existingContinuation) {
          const continuationId = crypto.randomUUID();
          const group = goal.group ?? "today";
          goal.continuationGoalId = continuationId;
          snapshot.goals = [...(snapshot.goals ?? []), {
            id: continuationId,
            title: nextTitle,
            icon: goal.icon ?? "target",
            description: "",
            createdAt: date,
            deadline: null,
            time: null,
            priority: goal.priority ?? "medium",
            group,
            scheduledFor: group === "longterm" ? null : date,
            subtasks: [],
            completed: false,
            completedAt: null,
            recurring: "none",
            archived: false,
            continuationFromId: goal.id,
            continuationFromTitle: goal.title ?? "",
          }];
        }
        const { error } = await supabase.from("users").update({ data: snapshot }).eq("telegram_id", chatId);
        if (error) throw error;
      }
    } else {
      if (!time || !/^\d{2}:\d{2}$/.test(time)) {
        await replaceCallbackMessageWithNotice(chatId, message.message_id, "Не удалось распознать время приёма. Отметьте его в приложении.");
        return;
      }
      const medication = (snapshot.medications ?? []).find(item => item.id === itemId);
      if (!medication || !medicationTimesForDate(medication, date).includes(time)) {
        await replaceCallbackMessageWithNotice(chatId, message.message_id, "Этот приём уже не запланирован. Проверьте расписание в приложении.");
        return;
      }
      const log = snapshot.medicationLog ?? {};
      const doses = log[date] ?? [];
      const doseKey = `${itemId}:${time}`;
      if (!doses.includes(doseKey)) {
        snapshot.medicationLog = { ...log, [date]: [...doses, doseKey] };
        const { error } = await supabase.from("users").update({ data: snapshot }).eq("telegram_id", chatId);
        if (error) throw error;
      }
    }

    await deleteNotificationMessage(chatId, message.message_id);
  } catch (error) {
    console.error("Could not process Telegram callback", error);
    if (chatId && message) await replaceCallbackMessageWithNotice(chatId, message.message_id, "Не удалось сохранить отметку. Попробуйте ещё раз или отметьте её в приложении.");
  }
}

Deno.serve(async request => {
  if (!supabaseUrl || !serviceRoleKey || !botToken) {
    return new Response("Server configuration is incomplete", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const callbackSecret = request.headers.get("x-telegram-bot-api-secret-token");
  const expectedWebhookSecret = await telegramWebhookSecret();
  if (request.method === "POST" && cronSecret && (callbackSecret === cronSecret || callbackSecret === expectedWebhookSecret)) {
    try {
      await handleCallback(await request.json() as TelegramUpdate, supabase);
      return Response.json({ ok: true });
    } catch (error) {
      console.error("Could not handle Telegram update", error);
      return Response.json({ ok: false }, { status: 500 });
    }
  }
  if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) {
    return new Response("Unauthorized", { status: 401 });
  }
  await ensureTelegramWebhook();
  const now = new Date();
  let checked = 0;
  let delivered = 0;
  let failed = 0;

  for (let offset = 0; ; offset += 100) {
    const { data: users, error } = await supabase.from("users").select("telegram_id,data").order("telegram_id").range(offset, offset + 99);
    if (error) {
      console.error("Could not load users for reminders", error.message);
      return Response.json({ error: "Could not load users" }, { status: 500 });
    }
    if (!users?.length) break;
    for (const user of users) {
      checked++;
      const telegramId = Number(user.telegram_id);
      if (!Number.isSafeInteger(telegramId) || telegramId <= 0) continue;
      const snapshot = (user.data ?? {}) as Snapshot;
      await cleanupPreviousDayMessages(supabase, telegramId, now, snapshot.settings?.notificationTimeZone || "UTC");
      for (const reminder of dueReminders(snapshot, now)) {
        const { error: claimError } = await supabase.from("telegram_notification_deliveries")
          .insert({ telegram_id: telegramId, notification_key: reminder.key });
        if (claimError?.code === "23505") continue;
        if (claimError) {
          failed++;
          console.error("Could not claim reminder", claimError.message);
          continue;
        }

        try {
          const sent = await telegram("sendMessage", {
            chat_id: telegramId,
            text: reminder.text,
            disable_web_page_preview: true,
            ...(reminder.keyboard ? { reply_markup: { inline_keyboard: reminder.keyboard } } : {}),
          });
          const messageId = Number(sent.result?.message_id);
          if (Number.isSafeInteger(messageId) && messageId > 0) {
            const { error: saveMessageError } = await supabase.from("telegram_notification_deliveries")
              .update({ telegram_message_id: messageId })
              .eq("telegram_id", telegramId)
              .eq("notification_key", reminder.key);
            if (saveMessageError) console.error("Could not save Telegram message ID for cleanup", saveMessageError.message);
          }
          delivered++;
        } catch (error) {
          failed++;
          console.error("Could not deliver reminder", error);
          await supabase.from("telegram_notification_deliveries")
            .delete().eq("telegram_id", telegramId).eq("notification_key", reminder.key);
        }
      }
    }
    if (users.length < 100) break;
  }

  return Response.json({ checked, delivered, failed });
});
