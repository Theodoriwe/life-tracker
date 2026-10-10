import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Goal = {
  id?: string;
  title?: string;
  group?: string;
  scheduledFor?: string | null;
  createdAt?: string | null;
  recurring?: string;
  recurrenceSeriesId?: string;
  recurrenceState?: Record<string, { completed?: boolean }>;
  completed?: boolean;
  archived?: boolean;
};

type Medication = {
  id?: string;
  name?: string;
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

type Reminder = { key: string; text: string };

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
        const dose = Math.max(1, Math.floor(Number(medication.unitsPerDose) || 1));
        reminders.push({
          key: `medication:${local.date}:${medication.id}:${time}`,
          text: `Пора принять «${medication.name}» — ${dose} шт. (${time}).\nПосле приёма отметьте таблетку в приложении.`,
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
      text: `${greeting}\n${tasks}\nДолгосрочных целей в работе: ${activeGoals.length}.`,
    });
  }

  const interval = Math.min(12, Math.max(1, Math.floor(Number(settings.taskReminderIntervalHours) || 1)));
  if (settings.taskRemindersEnabled && unfinished.length > 0 && local.minute === 0
    && local.hour % interval === 0 && local.time >= morningTime && local.time < eveningTime
    && !(settings.startDayMessageEnabled && local.time === morningTime)) {
    reminders.push({
      key: `tasks:${local.date}:${local.time}`,
      text: `На сегодня осталось ${unfinished.length} ${plural(unfinished.length, "задача", "задачи", "задач")}:\n${taskNames(unfinished)}\nНачните с одной — так будет легче двигаться дальше.`,
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

Deno.serve(async request => {
  if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!supabaseUrl || !serviceRoleKey || !botToken) {
    return new Response("Server configuration is incomplete", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
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
          const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: telegramId, text: reminder.text, disable_web_page_preview: true }),
          });
          if (!response.ok) throw new Error(`Telegram API returned ${response.status}`);
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
