import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Goal = {
  id?: string;
  title?: string;
  group?: string;
  scheduledFor?: string | null;
  createdAt?: string | null;
  recurring?: string;
  recurrenceSeriesId?: string;
  recurrenceEndDate?: string | null;
  recurrenceSkippedDates?: string[];
  recurrenceState?: Record<string, { completed?: boolean; missed?: boolean; missedStreak?: number }>;
  subtasks?: { id: string; title?: string; done?: boolean }[];
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

function isGoalForDate(goal: Goal, date: string): boolean {
  if (goal.archived || goal.group !== "today") return false;
  if (!goal.recurring || goal.recurring === "none") return true;
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

  const interval = Math.min(12, Math.max(1, Math.floor(Number(settings.taskReminderIntervalHours) || 1)));
  if (settings.taskRemindersEnabled && unfinished.length > 0 && local.minute === 0
    && local.hour % interval === 0 && local.time >= morningTime && local.time < eveningTime
    && !(settings.startDayMessageEnabled && local.time === morningTime)) {
    reminders.push({
      key: `tasks:${local.date}:${local.time}`,
      text: `Небольшое напоминание 🌿\nНа сегодня осталось ${unfinished.length} ${plural(unfinished.length, "задача", "задачи", "задач")}:\n${taskNames(unfinished)}\n\nВыберите одну и двигайтесь в своём темпе.`,
      keyboard: taskKeyboard(unfinished, local.date),
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

async function handleCallback(update: TelegramUpdate, supabase: ReturnType<typeof createClient>) {
  const query = update.callback_query;
  if (!query) return;
  const message = query.message;
  const chatId = message?.chat.id;
  const callbackData = query.data ?? "";
  if (callbackData === "noop") {
    await telegram("answerCallbackQuery", { callback_query_id: query.id, text: "Уже отмечено ✅" });
    return;
  }
  if (!message || !chatId || query.from?.id !== chatId || message.chat.type === "group" || message.chat.type === "supergroup") {
    await telegram("answerCallbackQuery", { callback_query_id: query.id, text: "Эта кнопка доступна только в личном чате с ботом.", show_alert: true });
    return;
  }

  try {
    const [kind, date, itemId, time] = callbackData.split("|");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !itemId || (kind !== "task" && kind !== "med")) {
      await telegram("answerCallbackQuery", { callback_query_id: query.id, text: "Не удалось распознать действие.", show_alert: true });
      return;
    }
    const { data: user, error: userError } = await supabase.from("users").select("telegram_id,data").eq("telegram_id", chatId).maybeSingle();
    if (userError) throw userError;
    if (!user) {
      await telegram("answerCallbackQuery", { callback_query_id: query.id, text: "Не нашёл ваш профиль. Откройте приложение через бота.", show_alert: true });
      return;
    }

    const snapshot = structuredClone((user.data ?? {}) as Snapshot);
    let answer = "Готово! Изменение сохранено в приложении ✅";
    if (kind === "task") {
      const goal = (snapshot.goals ?? []).find(item => item.id === itemId);
      if (!goal || !isGoalForDate(goal, date)) {
        await telegram("answerCallbackQuery", { callback_query_id: query.id, text: "Эта задача уже недоступна." });
        return;
      }
      if (isGoalDone(goal, date)) {
        await telegram("answerCallbackQuery", { callback_query_id: query.id, text: "Задача уже выполнена ✅" });
      } else {
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
        const { error } = await supabase.from("users").update({ data: snapshot }).eq("telegram_id", chatId);
        if (error) throw error;
        await telegram("answerCallbackQuery", { callback_query_id: query.id, text: answer });
      }
    } else {
      if (!time || !/^\d{2}:\d{2}$/.test(time)) {
        await telegram("answerCallbackQuery", { callback_query_id: query.id, text: "Не удалось распознать время приёма.", show_alert: true });
        return;
      }
      const medication = (snapshot.medications ?? []).find(item => item.id === itemId);
      if (!medication || !medicationTimesForDate(medication, date).includes(time)) {
        await telegram("answerCallbackQuery", { callback_query_id: query.id, text: "Этот приём уже не запланирован." });
        return;
      }
      const log = snapshot.medicationLog ?? {};
      const doses = log[date] ?? [];
      const doseKey = `${itemId}:${time}`;
      if (doses.includes(doseKey)) {
        answer = "Приём уже отмечен ✅";
      } else {
        snapshot.medicationLog = { ...log, [date]: [...doses, doseKey] };
        const { error } = await supabase.from("users").update({ data: snapshot }).eq("telegram_id", chatId);
        if (error) throw error;
      }
      await telegram("answerCallbackQuery", { callback_query_id: query.id, text: answer });
    }

    const updatedKeyboard = (message.reply_markup?.inline_keyboard ?? []).map(row => row.map(button =>
      button.callback_data === callbackData
        ? { text: kind === "med" ? "✅ Приём отмечен" : "✅ Выполнено", callback_data: "noop" }
        : button,
    ));
    if (updatedKeyboard.some(row => row.some(button => button.callback_data === "noop"))) {
      await telegram("editMessageReplyMarkup", {
        chat_id: chatId,
        message_id: message.message_id,
        reply_markup: { inline_keyboard: updatedKeyboard },
      });
    }
  } catch (error) {
    console.error("Could not process Telegram callback", error);
    await telegram("answerCallbackQuery", {
      callback_query_id: query.id,
      text: "Не удалось сохранить. Попробуйте ещё раз или отметьте в приложении.",
      show_alert: true,
    }).catch(() => undefined);
  }
}

Deno.serve(async request => {
  if (!supabaseUrl || !serviceRoleKey || !botToken) {
    return new Response("Server configuration is incomplete", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  if (request.method === "POST" && cronSecret && request.headers.get("x-telegram-bot-api-secret-token") === cronSecret) {
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
      for (const reminder of dueReminders((user.data ?? {}) as Snapshot, now)) {
        const { error: claimError } = await supabase.from("telegram_notification_deliveries")
          .insert({ telegram_id: telegramId, notification_key: reminder.key });
        if (claimError?.code === "23505") continue;
        if (claimError) {
          failed++;
          console.error("Could not claim reminder", claimError.message);
          continue;
        }

        try {
          await telegram("sendMessage", {
            chat_id: telegramId,
            text: reminder.text,
            disable_web_page_preview: true,
            ...(reminder.keyboard ? { reply_markup: { inline_keyboard: reminder.keyboard } } : {}),
          });
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
