import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { AreaChart, Area, Bar, BarChart, CartesianGrid, Cell, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { ArrowUpRight, BarChart3, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, Flame, Heart, Keyboard, MoreHorizontal, Pencil, Pill as PillIcon, Plus, Sparkles, Target, Trash2, TrendingUp, Undo2, Utensils, X } from "lucide-react";
import { Slider } from "./components/ui/slider";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "./components/ui/chart";
import { supabase } from "../lib/supabase";
import { HourlyActivityChart } from "./components/figma/HourlyActivityChart";

// ═══════════════════════════════════════════════════
// GLOBAL DEBUG LOGGER
// ═══════════════════════════════════════════════════
function addLog(msg: string) {
  console.log(msg);
}

// ═══════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════

type AppTab = "home" | "work" | "goals" | "nutrition" | "habits";
type Priority = "high" | "medium" | "low";
type GoalGroup = "all" | "today" | "week" | "longterm";
type MealType = "breakfast" | "lunch" | "dinner" | "snack";
type RecurringType = "none" | "daily" | "weekly";

interface Settings {
  userName: string;
  workGoalHours: number;
  calorieGoal: number;
  proteinGoal: number;
  fatGoal: number;
  carbsGoal: number;
  waterGoal: number;
  medicationsEnabled: boolean;
}

interface Medication {
  id: string;
  name: string;
  unitsPerDose: number;
  frequency: "daily" | "interval";
  times: string[];
  intervalDays: number;
  intervalTime: string;
  startDate: string;
}

type MedicationDraft = Omit<Medication, "id">;

interface WorkSession {
  id: string;
  start: string;
  end: string | null;
}

interface SubTask {
  id: string;
  title: string;
  done: boolean;
}

interface GoalRecurrenceState {
  completed: boolean;
  missed: boolean;
  missedStreak: number;
}

interface Goal {
  id: string;
  title: string;
  description?: string;
  createdAt?: string;
  deadline: string | null;
  priority: Priority;
  group: GoalGroup;
  scheduledFor: string | null;
  subtasks: SubTask[];
  completed: boolean;
  completedAt: string | null;
  recurring: RecurringType;
  archived: boolean;
  archivedAt?: string | null;
  archivedSource?: "manual" | "deleted" | null;
  recurrenceState?: Record<string, GoalRecurrenceState>;
  recurrenceSeriesId?: string;
  recurrencePattern?: RecurringType;
}

interface FoodItem {
  id: string;
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  portion: number;
}

interface MyMenuItem {
  id: string;
  name: string;
  type: MealType;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  tags: string[];
}

interface JournalEntry {
  id: string;
  timestamp: string;
  score: number;
  symptoms: string[];
  note: string;
}

interface Relapse {
  id: string;
  timestamp: string;
}

interface Habit {
  id: string;
  name: string;
  icon: string;
  dailyCost: number;
  relapses: Relapse[];
  notes: string;
  startedAt?: string | null;
  milestonesAchieved?: string[];
}

interface DailyDiary {
  breakfast: FoodItem[];
  lunch: FoodItem[];
  dinner: FoodItem[];
  snack: FoodItem[];
}

interface AppData {
  settings: Settings;
 workActivity: Record<string, { totalSeconds: number; hours: Record<string, number> }>;
  goals: Goal[];
  foodDiary: Record<string, DailyDiary>;
  myMenu: MyMenuItem[];
  water: Record<string, number>;
  journalEntries: JournalEntry[];
  habits: Habit[];
  wellbeing: Record<string, number>;
  medications: Medication[];
  medicationLog: Record<string, string[]>;
}

// ═══════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════

const DEFAULT_SETTINGS: Settings = {
  userName: "",
  workGoalHours: 8,
  calorieGoal: 2000,
  proteinGoal: 150,
  fatGoal: 67,
  carbsGoal: 250,
  waterGoal: 8,
  medicationsEnabled: false,
};

const EMPTY_DIARY: DailyDiary = { breakfast: [], lunch: [], dinner: [], snack: [] };

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Завтрак",
  lunch: "Обед",
  dinner: "Ужин",
  snack: "Перекус",
};

const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

const SYMPTOM_TAGS = [
  "Вздутие", "Тяжесть", "Изжога", "Тошнота",
  "Высокая энергия", "Низкая энергия", "Головная боль", "Туман в голове",
];

const PRIORITY_COLORS: Record<Priority, string> = {
  high: "#549AF2",
  medium: "#d0ef4c",
  low: "#131826",
};

const PRIORITY_LABELS: Record<Priority, string> = {
  high: "Высокий",
  medium: "Средний",
  low: "Низкий",
};

const PRIORITY_ORDER: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const GROUP_LABELS: Record<GoalGroup, string> = {
  all: "Все",
  today: "Сегодня",
  week: "На этой неделе",
  longterm: "Долгосрочные",
};

const GOAL_SECTIONS: Exclude<GoalGroup, "all">[] = ["today", "week", "longterm"];

const HABIT_ICON_KEYS = ["smoke", "phone", "drink", "sugar", "coffee", "game", "shop", "none"];
const HABIT_ICON_LABELS: Record<string, string> = {
  smoke: "Курение",
  phone: "Телефон",
  drink: "Алкоголь",
  sugar: "Сладкое",
  coffee: "Кофе",
  game: "Игры",
  shop: "Покупки",
  none: "Другое",
};

function getGoalGroupLabel(group: GoalGroup, selectedDate: string, todayKey: string): string {
  if (group === "today") return selectedDate === todayKey ? "Сегодня" : "В этот день";
  return GROUP_LABELS[group];
}

function getGoalCountWord(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "целей";
  if (last === 1) return "цель";
  if (last >= 2 && last <= 4) return "цели";
  return "целей";
}

function getGoalDateValue(goal: Goal, fallbackDate: string): string {
  return goal.scheduledFor ?? goal.deadline ?? goal.createdAt ?? fallbackDate;
}

function isGoalOverdue(goal: Goal, selectedDate: string): boolean {
  if (goal.completed || goal.group !== "today" || goal.recurring === "daily" || goal.recurring === "weekly") return false;
  const goalDate = getGoalDateValue(goal, selectedDate);
  return !!goalDate && goalDate < selectedDate;
}

function isExpiredArchivedGoal(goal: Goal): boolean {
  if (!goal.archived || goal.archivedSource !== "deleted") return false;
  if (!goal.archivedAt) return false;
  return Date.now() - new Date(goal.archivedAt).getTime() >= 3 * 24 * 60 * 60 * 1000;
}

function getPreviousDateKey(dateKey: string): string {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() - 1);
  return getDateKey(date);
}

function isGoalRecurringVisibleForDate(goal: Goal, dateKey: string): boolean {
  if (goal.recurring === "none") return false;

  const createdKey = goal.createdAt ?? goal.scheduledFor ?? dateKey;
  if (dateKey < createdKey) return false;

  // Recurring goals created from the editor are materialized as dated occurrences.
  // Only the matching occurrence belongs on the selected day.
  if (goal.recurrenceSeriesId) return goal.scheduledFor === dateKey;

  if (goal.recurring === "daily") return true;

  const anchorDate = goal.scheduledFor ?? createdKey;
  const current = new Date(`${dateKey}T12:00:00`);
  const anchor = new Date(`${anchorDate}T12:00:00`);
  return current.getDay() === anchor.getDay();
}

function getGoalRecurrenceState(goal: Goal, dateKey: string): GoalRecurrenceState {
  if (goal.recurring === "none") {
    return { completed: Boolean(goal.completed), missed: false, missedStreak: 0 };
  }

  const existing = goal.recurrenceState?.[dateKey];
  if (existing) return existing;

  const createdKey = goal.createdAt ?? goal.scheduledFor ?? dateKey;
  if (dateKey < createdKey) {
    return { completed: false, missed: false, missedStreak: 0 };
  }

  if (goal.recurring === "daily") {
    const previousDate = getPreviousDateKey(dateKey);
    if (previousDate < createdKey) {
      return { completed: false, missed: false, missedStreak: 0 };
    }

    const previousState = goal.recurrenceState?.[previousDate];
    const missed = !(previousState?.completed ?? false);
    const missedStreak = previousState?.completed ? 0 : (previousState?.missedStreak ?? 0) + 1;
    return { completed: false, missed, missedStreak };
  }

  if (goal.recurring === "weekly") {
    if (!isGoalRecurringVisibleForDate(goal, dateKey)) {
      return { completed: false, missed: false, missedStreak: 0 };
    }

    const previousWeekDate = addDays(new Date(`${dateKey}T12:00:00`), -7);
    const previousWeekKey = getDateKey(previousWeekDate);
    const previousState = goal.recurrenceState?.[previousWeekKey];
    const missed = !(previousState?.completed ?? false);
    const missedStreak = previousState?.completed ? 0 : (previousState?.missedStreak ?? 0) + 1;
    return { completed: false, missed, missedStreak };
  }

  return { completed: false, missed: false, missedStreak: 0 };
}

function isGoalCompletedForDate(goal: Goal, dateKey: string): boolean {
  return getGoalRecurrenceState(goal, dateKey).completed;
}

// ═══════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function buildRecurringGoalSeries(baseGoal: Goal): Goal[] {
  if (baseGoal.recurring === "none") return [baseGoal];

  const startDate = baseGoal.scheduledFor ?? baseGoal.createdAt ?? getDateKey();
  const seriesId = uid();
  const count = baseGoal.recurring === "daily" ? 365 : 104;
  const step = baseGoal.recurring === "daily" ? 1 : 7;

  return Array.from({ length: count }, (_, index) => {
    const occurrenceDate = getDateKey(addDays(new Date(`${startDate}T12:00:00`), index * step));
    return {
      ...baseGoal,
      id: `${seriesId}-${occurrenceDate}`,
      scheduledFor: occurrenceDate,
      completed: false,
      completedAt: null,
      recurrenceState: undefined,
      recurrenceSeriesId: seriesId,
      recurrencePattern: baseGoal.recurring,
    };
  });
}

function hexToRgba(hex: string, alpha = 1) {
  const h = hex.replace('#', '');
  const bigint = parseInt(h.length === 3 ? h.split('').map(c=>c+c).join('') : h, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getDateKey(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;  // ✅ ПРАВИЛЬНО — использует локальное время
}

function getNextDateKey(dateKey: string): string {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return getDateKey(date);
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Доброе утро";
  if (h < 17) return "Добрый день";
  if (h < 21) return "Добрый вечер";
  return "Доброй ночи";
}

function formatDate(d: Date = new Date()): string {
  const days = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
  const months = ["января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const day = days[d.getDay()];
  return `${day.charAt(0).toUpperCase() + day.slice(1)}, ${d.getDate()} ${months[d.getMonth()]}`;
}

function createMedicationDraft(): MedicationDraft {
  return {
    name: "",
    unitsPerDose: 1,
    frequency: "daily",
    times: ["09:00"],
    intervalDays: 3,
    intervalTime: "09:00",
    startDate: getDateKey(),
  };
}

function formatMedicationDose(amount: number): string {
  const value = Math.max(1, Math.floor(amount));
  const lastTwo = value % 100;
  const last = value % 10;
  const noun = lastTwo >= 11 && lastTwo <= 14 ? "таблеток" : last === 1 ? "таблетка" : last >= 2 && last <= 4 ? "таблетки" : "таблеток";
  return `${value} ${noun}`;
}

function formatDaysInterval(days: number): string {
  const value = Math.max(1, Math.floor(days));
  const lastTwo = value % 100;
  const last = value % 10;
  const noun = lastTwo >= 11 && lastTwo <= 14 ? "дней" : last === 1 ? "день" : last >= 2 && last <= 4 ? "дня" : "дней";
  return `${value} ${noun}`;
}

function getMedicationTimesForDate(medication: Medication, dateKey: string): string[] {
  if (medication.frequency === "daily") return medication.times;
  const startKey = medication.startDate || dateKey;
  const dayOffset = Math.round((new Date(`${dateKey}T12:00:00`).getTime() - new Date(`${startKey}T12:00:00`).getTime()) / 86400000);
  return dayOffset >= 0 && dayOffset % Math.max(1, medication.intervalDays) === 0 ? [medication.intervalTime] : [];
}

function getNextMedicationDateKey(medication: Medication, fromDateKey: string): string {
  if (medication.frequency === "daily") return fromDateKey;
  const startKey = medication.startDate || fromDateKey;
  const dayOffset = Math.round((new Date(`${fromDateKey}T12:00:00`).getTime() - new Date(`${startKey}T12:00:00`).getTime()) / 86400000);
  if (dayOffset < 0) return startKey;
  const interval = Math.max(1, medication.intervalDays);
  const daysUntilNext = (interval - (dayOffset % interval)) % interval;
  return getDateKey(addDays(new Date(`${fromDateKey}T12:00:00`), daysUntilNext));
}

function getMedicationDoseKey(medicationId: string, time: string): string {
  return `${medicationId}:${time}`;
}

function describeMedicationSchedule(medication: Medication): string {
  return medication.frequency === "daily"
    ? `Каждый день · ${medication.times.join(" · ")}`
    : `Раз в ${formatDaysInterval(medication.intervalDays)} · ${medication.intervalTime}`;
}

function sessionMinutes(s: WorkSession): number {
  const start = new Date(s.start).getTime();
  const end = s.end ? new Date(s.end).getTime() : Date.now();
  return Math.floor((end - start) / 60000);
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}м`;
  if (m === 0) return `${h}ч`;
  return `${h}ч ${m}м`;
}

function formatTimerLong(ms: number): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d} дн`);
  if (h > 0) parts.push(`${h} ч`);
  if (m > 0 || (d === 0 && h === 0)) parts.push(`${m} мин`);
  parts.push(`${s} сек`);
  return parts.join(" ");
}

function formatHabitDuration(ms: number): string {
  const totalMinutes = Math.floor(Math.max(0, ms) / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return hours > 0 ? `${days} дн ${hours} ч` : `${days} дн`;
  if (hours > 0) return minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`;
  return `${minutes} мин`;
}

function toDatetimeLocalValue(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getHabitStartTime(habit: Habit, fallbackNow = Date.now()): number {
  const relapseTimes = habit.relapses
    .map(r => new Date(r.timestamp).getTime())
    .filter(timestamp => Number.isFinite(timestamp));

  if (relapseTimes.length > 0) {
    return relapseTimes.reduce((latest, timestamp) => Math.max(latest, timestamp), -Infinity);
  }

  if (habit.startedAt) {
    const startedAt = new Date(habit.startedAt).getTime();
    if (Number.isFinite(startedAt)) return startedAt;
  }

  return fallbackNow;
}

function last7Days(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return getDateKey(d);
  });
}

function getDateWindow(dateKey: string, days = 7): string[] {
  const base = new Date(`${dateKey}T12:00:00`);
  return Array.from({ length: days }, (_, i) => getDateKey(addDays(base, i - days + 1)));
}

function getDemoWorkActivity(dateKey: string): { totalSeconds: number; hours: Record<string, number> } {
  const weekday = new Date(`${dateKey}T12:00:00`).getDay();
  const hourlyPatterns: Record<number, number[]> = {
    0: [0.2, 0.4, 0.5, 0.3, 0.4, 0.3],
    1: [0.4, 0.7, 0.8, 0.7, 0.7, 0.6, 0.8, 0.5, 0.6],
    2: [0.6, 0.7, 0.5, 0.8, 0.6, 0.7, 0.6],
    3: [0.8, 0.9, 0.7, 0.9, 0.8, 0.8, 0.7, 0.6, 0.5],
    4: [0.5, 0.6, 0.7, 0.5, 0.8, 0.7, 0.6],
    5: [0.7, 0.6, 0.8, 0.7, 0.6, 0.8, 0.7, 0.6],
    6: [0.3, 0.4, 0.4, 0.5, 0.3, 0.4],
  };
  const hours = Object.fromEntries(
    hourlyPatterns[weekday].map((duration, index) => [String(9 + index), Math.round(duration * 3600)]),
  );

  return {
    totalSeconds: Object.values(hours).reduce((total, seconds) => total + seconds, 0),
    hours,
  };
}

function getWorkActivityForDisplay(
  activityByDate: AppData["workActivity"],
  dateKey: string,
  useDemo: boolean,
) {
  const savedActivity = activityByDate?.[dateKey];
  if (savedActivity?.totalSeconds) return savedActivity;
  if (useDemo) return getDemoWorkActivity(dateKey);
  return savedActivity ?? { totalSeconds: 0, hours: {} };
}

function isWorkActivityDemoEnabled(): boolean {
  return import.meta.env.DEV || new URLSearchParams(window.location.search).get("demo") === "1";
}

function getDateRange(startKey: string, endKey: string): string[] {
  const start = new Date(`${startKey}T12:00:00`);
  const end = new Date(`${endKey}T12:00:00`);
  const result: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    result.push(getDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function shortDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return ["вс", "пн", "вт", "ср", "чт", "пт", "сб"][d.getDay()];
}

function calcGoalProgress(g: Goal): number {
  if (g.subtasks.length === 0) return g.completed ? 100 : 0;
  return Math.round((g.subtasks.filter(s => s.done).length / g.subtasks.length) * 100);
}

function getWeekBounds(dateKey: string): { start: string; end: string } {
  const date = new Date(`${dateKey}T12:00:00`);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(date);
  start.setDate(date.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start: getDateKey(start), end: getDateKey(end) };
}

function isSameWeek(dateKey: string, otherKey: string): boolean {
  const a = getWeekBounds(dateKey);
  const b = getWeekBounds(otherKey);
  return a.start <= b.end && b.start <= a.end;
}

function getDateContextLabel(dateKey: string, todayKey: string): string {
  return dateKey === todayKey ? "сегодня" : "в этот день";
}

function formatGoalDate(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString("ru-RU");
}

function formatGoalDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const HABIT_MILESTONES = [
  { id: "7d", label: "7 дней", durationMs: 7 * 24 * 60 * 60 * 1000 },
  { id: "14d", label: "14 дней", durationMs: 14 * 24 * 60 * 60 * 1000 },
  { id: "21d", label: "21 день", durationMs: 21 * 24 * 60 * 60 * 1000 },
  { id: "1m", label: "1 месяц", durationMs: 30 * 24 * 60 * 60 * 1000 },
  { id: "2m", label: "2 месяца", durationMs: 60 * 24 * 60 * 60 * 1000 },
  { id: "3m", label: "3 месяца", durationMs: 90 * 24 * 60 * 60 * 1000 },
  { id: "4m", label: "4 месяца", durationMs: 120 * 24 * 60 * 60 * 1000 },
] as const;

function getNextHabitMilestone(durationMs: number) {
  return HABIT_MILESTONES.find(def => durationMs < def.durationMs) ?? HABIT_MILESTONES[HABIT_MILESTONES.length - 1];
}

function getBestStreak(habit: Habit, now = Date.now()): number {
  const startTime = habit.startedAt ? new Date(habit.startedAt).getTime() : null;
  const relapseTimes = [...habit.relapses]
    .map(r => new Date(r.timestamp).getTime())
    .filter(value => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (relapseTimes.length === 0) {
    if (!startTime || !Number.isFinite(startTime)) return 0;
    return Math.max(0, now - startTime);
  }

  let best = 0;
  let prev = startTime ?? relapseTimes[0];
  if (prev === null || !Number.isFinite(prev)) {
    prev = relapseTimes[0];
  }

  for (const timestamp of relapseTimes) {
    const gap = timestamp - prev;
    if (gap > best) best = gap;
    prev = timestamp;
  }

  const current = now - prev;
  return Math.max(best, current);
}

// ═══════════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════════

const STORAGE_KEY = "lifepwa_v1";
const SAVE_DEBOUNCE_MS = 1000;

function getTelegramUserId(): number | null {
  const tg = (window as any).Telegram?.WebApp;
  if (!tg) return null;

  return (tg.initDataUnsafe?.user?.id as number) ?? null;
}

async function resolveTelegramUserId(maxAttempts = 8, delayMs = 200): Promise<number | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const id = getTelegramUserId();
    if (id) return id;
    await new Promise(resolve => window.setTimeout(resolve, delayMs));
  }
  return null;
}

async function supabaseLoadData(telegramId: number): Promise<AppData | null> {
  if (!supabase) return null;
  addLog("🔍 Загрузка данных пользователя");
  try {
    const { data: row, error } = await supabase
      .from("users")
      .select("data")
      .eq("telegram_id", telegramId)
      .maybeSingle();

    if (error) {
      addLog(`❌ Ошибка загрузки: ${error.message}`);
      throw error;
    }
    addLog(`✅ Загружено: ${row ? "есть данные" : "пусто"}`);
    return row?.data ?? null;
  } catch (e) {
    addLog(`💥 Исключение: ${e}`);
    throw e;
  }
}

async function supabaseUpsertData(telegramId: number, appData: AppData): Promise<boolean> {
  if (!supabase) return false;
  addLog("💾 Сохранение данных пользователя");
  try {
    // 1. Сначала загружаем актуальные данные из Supabase
    const { data: row, error: loadError } = await supabase
      .from("users")
      .select("data")
      .eq("telegram_id", telegramId)
      .maybeSingle();

    let finalData = appData;

    // 2. Если в Supabase есть данные — мержим workActivity
    if (!loadError && row?.data) {
      const remote = row.data as any;
      const remoteWA = remote.workActivity;
      const localWA = appData.workActivity;

      if (remoteWA && Object.keys(remoteWA).length > 0) {
        // Берём за основу локальные данные
        const mergedWA: Record<string, any> = { ...(localWA ?? {}) };

        // Для каждого дня из Supabase проверяем, не больше ли там секунд
        for (const [day, remoteDay] of Object.entries(remoteWA)) {
          const localDay = mergedWA[day];
          const remoteTotal = (remoteDay as any).totalSeconds ?? 0;
          const localTotal = localDay?.totalSeconds ?? 0;

          if (!localDay || remoteTotal > localTotal) {
            // В Supabase больше данных — берём оттуда
            mergedWA[day] = remoteDay;
            addLog(`🔄 Мерж ${day}: ${localTotal}с → ${remoteTotal}с (из Supabase)`);
          } else {
            // Локальные данные новее — оставляем их
            addLog(`🔄 Мерж ${day}: оставляем локальные ${localTotal}с`);
          }
        }

        finalData = { ...appData, workActivity: mergedWA };
      }
    }

    // 3. Сохраняем смердженные данные
    const { error } = await supabase
      .from("users")
      .upsert(
        { telegram_id: telegramId, data: finalData },
        { onConflict: "telegram_id" }
      );

    if (error) {
      addLog(`❌ Ошибка сохранения: ${error.message}`);
      return false;
    }
    addLog(`✅ Сохранено успешно`);
    return true;
  } catch (e) {
    addLog(`💥 Исключение: ${e}`);
    return false;
  }
}
function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);

      return {
        settings: { ...DEFAULT_SETTINGS, ...saved.settings },
        workActivity: saved.workActivity ?? {},
        goals: saved.goals ?? [],
        foodDiary: saved.foodDiary ?? {},
        myMenu: saved.myMenu ?? [],
        water: saved.water ?? {},
        journalEntries: saved.journalEntries ?? [],
        habits: saved.habits ?? [],
        wellbeing: saved.wellbeing ?? {},
        medications: saved.medications ?? [],
        medicationLog: saved.medicationLog ?? {},
      };
    }
  } catch {}

  return {
    settings: { ...DEFAULT_SETTINGS },
    workActivity: {},
    goals: [],
    foodDiary: {},
    myMenu: [],
    water: {},
    journalEntries: [],
    habits: [],
    wellbeing: {},
    medications: [],
    medicationLog: {},
  };
}

function saveData(data: AppData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

// ═══════════════════════════════════════════════════
// SVG ICONS
// ═══════════════════════════════════════════════════

const sw = (active?: boolean) => active ? "2" : "1.5";

const IcoHome = ({ active }: { active?: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw(active)} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
    <polyline points="9,22 9,12 15,12 15,22"/>
  </svg>
);
const IcoWork = ({ active }: { active?: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw(active)} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12,6 12,12 16,14"/>
  </svg>
);
const IcoTarget = ({ active }: { active?: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw(active)} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <circle cx="12" cy="12" r="6"/>
    <circle cx="12" cy="12" r="2"/>
  </svg>
);
const IcoLeaf = ({ active }: { active?: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw(active)} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c0-5.5-2-10-10-10 5.5 0 10 2 10 10"/>
    <path d="M2 12c0 5.5 4.5 10 10 10"/>
  </svg>
);
const IcoChain = ({ active }: { active?: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw(active)} strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
  </svg>
);
const IcoSettings = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
  </svg>
);
const IcoPlus = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const IcoCheck = ({ size = 16, className, strokeWidth = 2.5 }: { size?: number; className?: string; strokeWidth?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const IcoChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);
const IcoChevronDown = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);
const IcoClose = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const IcoBack = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);
const IcoFire = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8.5 14.5A2.5 2.5 0 0011 17c1.5 0 2.5-.5 3.5-1.5S16 12.5 16 10.5c0-3-2-6-4-8-1 2-2 3-4 4-1 .5-2 1.5-2 3s.5 3 2 5z"/>
  </svg>
);
const IcoDrop = ({ filled }: { filled?: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/>
  </svg>
);
const IcoTrash = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14H6L5 6"/>
    <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
  </svg>
);
const IcoSearch = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);
const IcoArchive = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="21 8 21 21 3 21 3 8"/>
    <rect x="1" y="3" width="22" height="5"/>
    <line x1="10" y1="12" x2="14" y2="12"/>
  </svg>
);
const IcoUndo = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 14 4 9l5-5"/>
    <path d="M4 9h8a5 5 0 1 1 0 10h-2"/>
  </svg>
);
const IcoAlert = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

const HabitIconSvg: Record<string, React.ReactNode> = {
  smoke: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="2" y1="15" x2="22" y2="15"/><line x1="2" y1="19" x2="22" y2="19"/><line x1="20" y1="11" x2="20" y2="15"/><path d="M17 8c0-2 2-4 2-4s-3 1-3 5v3"/></svg>,
  phone: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>,
  drink: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 2H7L2 12h20L17 2z"/><path d="M7 12v8a2 2 0 002 2h6a2 2 0 002-2v-8"/></svg>,
  sugar: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>,
  coffee: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>,
  game: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><circle cx="15" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="17" cy="13" r="1" fill="currentColor" stroke="none"/></svg>,
  shop: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>,
  none: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>,
};

// ═══════════════════════════════════════════════════
// UI PRIMITIVES
// ═══════════════════════════════════════════════════

function ProgressRing({
  value, max, size = 80, stroke = 6, color = "#549AF2", trackColor = "#EBEBEA", children,
}: {
  value: number; max: number; size?: number; stroke?: number; color?: string; trackColor?: string; children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(value / Math.max(max, 1), 1);
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} className="absolute inset-0">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${pct * circ} ${circ}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.4s ease" }}
        />
      </svg>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

function BottomSheet({
  open, onClose, title, children,
}: {
  open: boolean; onClose: () => void; title?: string; children: React.ReactNode;
}) {
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className="relative bg-white rounded-t-2xl flex flex-col max-h-[92vh]"
        style={{ boxShadow: "0 -4px 32px rgba(0,0,0,0.12)" }}
      >
        <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
          <div className="w-9 h-1 rounded-full bg-[#E0E0DE]" />
        </div>
        {title && (
          <div className="flex items-center justify-between px-5 pb-3 border-b border-black/5 flex-shrink-0">
            <span className="text-[15px] font-semibold text-[#1A1A2E]">{title}</span>
            <button type="button" aria-label="Закрыть окно" onClick={onClose} className="p-1.5 rounded-xl text-[#8A8A99] hover:text-[#1A1A2E] active:scale-95 transition-all">
              <IcoClose />
            </button>
          </div>
        )}
        <div className="overflow-y-auto flex-1 overscroll-contain" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  text, action, onAction,
}: {
  text: string; action?: string; onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
      <div className="w-12 h-12 rounded-2xl bg-[#F0F0EE] flex items-center justify-center mb-4">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8A8A99" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="3"/>
          <line x1="9" y1="12" x2="15" y2="12"/>
        </svg>
      </div>
      <p className="text-sm text-[#8A8A99] mb-5 leading-relaxed">{text}</p>
      {action && (
        <button
          onClick={onAction}
          className="px-5 py-2.5 bg-[#1A1A2E] text-white text-sm font-medium rounded-xl active:scale-95 transition-all"
        >
          {action}
        </button>
      )}
    </div>
  );
}

function ProgressBar({ value, max, color = "#1A1A2E", height = 4 }: { value: number; max: number; color?: string; height?: number }) {
  const pct = Math.min(value / Math.max(max, 1), 1) * 100;
  return (
    <div className="w-full rounded-full bg-[#EBEBEA] overflow-hidden" style={{ height }}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function SegmentedGauge({ value, max }: { value: number; max: number }) {
  const segments = 17;
  const progress = Math.max(0, Math.min(value / Math.max(max, 1), 1));
  const filledSegments = Math.round(progress * segments);

  return (
    <svg
      viewBox="0 0 220 136"
      className="home-task-gauge w-[132px] shrink-0 overflow-visible"
      role="img"
      aria-label={`${Math.round(progress * 100)}% задач выполнено`}
    >
      {Array.from({ length: segments }, (_, index) => {
        const angle = Math.PI - (index * Math.PI) / (segments - 1);
        const x = 110 + 78 * Math.cos(angle);
        const y = 112 - 78 * Math.sin(angle);
        const rotation = 90 - (angle * 180) / Math.PI;
        return (
          <rect
            key={index}
            className="focus-gauge-segment"
            x="-7"
            y="-5"
            width="14"
            height="10"
            rx="5"
            transform={`translate(${x} ${y}) rotate(${rotation})`}
            fill={index < filledSegments ? "#549AF2" : "#E9EEF5"}
          />
        );
      })}
      <text x="110" y="91" textAnchor="middle" className="focus-gauge-value">
        {Math.round(progress * 100)}%
      </text>
      <text x="110" y="110" textAnchor="middle" className="focus-gauge-caption">
        выполнено
      </text>
    </svg>
  );
}

function Card({ children, className = "", onClick, style }: {
  children: React.ReactNode; className?: string; onClick?: () => void; style?: React.CSSProperties;
}) {
  return (
    <div
      className={`app-card bg-[#F7F7F5] rounded-2xl ${onClick ? "active:scale-[0.98] transition-transform cursor-pointer" : ""} ${className}`}
      style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.04)", ...style }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

function DashboardPanel({ title, icon, action, className = "", children }: {
  title: string; icon?: React.ReactNode; action?: React.ReactNode; className?: string; children: React.ReactNode;
}) {
  return (
    <section className={`dashboard-panel ${className}`}>
      <header className="dashboard-panel-header">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon && <span className="dashboard-panel-icon">{icon}</span>}
          <h2 className="truncate">{title}</h2>
        </div>
        {action}
      </header>
      <div className="dashboard-panel-content">{children}</div>
    </section>
  );
}

function DashboardMetric({ label, value, detail, icon, tone = "blue" }: {
  label: string; value: React.ReactNode; detail?: React.ReactNode; icon: React.ReactNode; tone?: "blue" | "green" | "orange" | "violet";
}) {
  return (
    <div className="dashboard-metric">
      <div className={`dashboard-metric-icon tone-${tone}`}>{icon}</div>
      <div className="dashboard-metric-copy min-w-0">
        <p className="dashboard-metric-label">{label}</p>
        <p className="dashboard-metric-value">{value}</p>
        {detail && <p className="dashboard-metric-detail">{detail}</p>}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold text-[#8A8A99] uppercase tracking-wider mb-2">{children}</p>
  );
}

function Pill({
  active, onClick, children, color,
}: {
  active?: boolean; onClick?: () => void; children: React.ReactNode; color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-xl text-[13px] font-medium transition-all active:scale-95 ${
        active
          ? "text-white"
          : "text-[#8A8A99] bg-[#F0F0EE]"
      }`}
      style={active ? { background: color ?? "#1A1A2E" } : undefined}
    >
      {children}
    </button>
  );
}

function ScoreTag({ score }: { score: number }) {
  const color = score >= 8 ? "#2D7D46" : score >= 5 ? "#C9921A" : "#D94040";
  const bg = score >= 8 ? "#E8F5EE" : score >= 5 ? "#FFF4E0" : "#FDE8E8";
  return (
    <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl text-sm font-semibold" style={{ color, background: bg }}>
      {score}
    </span>
  );
}

// ═══════════════════════════════════════════════════
// HOME TAB
// ═══════════════════════════════════════════════════

function HomeTab({
  data, setData, onOpenSettings, onNavigate,
}: {
  data: AppData;
  setData: (fn: (p: AppData) => AppData) => void;
  onOpenSettings: () => void;
  onNavigate: (tab: AppTab) => void;
}) {
  const todayKey = getDateKey();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const hasRecordedWorkActivity = Object.values(data.workActivity ?? {}).some(activity => activity.totalSeconds > 0);
  const showDemoActivity = !hasRecordedWorkActivity && isWorkActivityDemoEnabled();
  const workedMinutes = Math.floor(getWorkActivityForDisplay(data.workActivity, todayKey, showDemoActivity).totalSeconds / 60);
  const goalMinutes = data.settings.workGoalHours * 60;

  const todayDiary = data.foodDiary[todayKey] ?? EMPTY_DIARY;
  const caloriesEaten = [...todayDiary.breakfast, ...todayDiary.lunch, ...todayDiary.dinner, ...todayDiary.snack]
    .reduce((acc, f) => acc + Math.round(f.calories * f.portion / 100), 0);

  const goalsToday = data.goals.filter(g =>
    !g.archived && g.group === "today" &&
    (g.recurring === "none" || isGoalRecurringVisibleForDate(g, todayKey))
  );
  const completedGoalsToday = goalsToday.filter(g => isGoalCompletedForDate(g, todayKey)).length;
  const weekActivity = getDateWindow(todayKey, 7).map(date => {
    const totalSeconds = getWorkActivityForDisplay(data.workActivity, date, showDemoActivity).totalSeconds;
    return {
      day: shortDay(date),
      date,
      hours: Number((totalSeconds / 3600).toFixed(1)),
    };
  });
  const weeklyHours = weekActivity.reduce((total, day) => total + day.hours, 0);
  const focusedDays = weekActivity.filter(day => day.hours > 0).length;
  const allFoodsToday = [...todayDiary.breakfast, ...todayDiary.lunch, ...todayDiary.dinner, ...todayDiary.snack];
  const macros = {
    protein: allFoodsToday.reduce((total, food) => total + Math.round(food.protein * food.portion / 100), 0),
    fat: allFoodsToday.reduce((total, food) => total + Math.round(food.fat * food.portion / 100), 0),
    carbs: allFoodsToday.reduce((total, food) => total + Math.round(food.carbs * food.portion / 100), 0),
  };
  const savedByHabits = data.habits.reduce((total, habit) => {
    const lastRelapse = habit.relapses.length
      ? Math.max(...habit.relapses.map(relapse => new Date(relapse.timestamp).getTime()))
      : null;
    const startedAt = lastRelapse ?? (habit.startedAt ? new Date(habit.startedAt).getTime() : now);
    return total + Math.round(Math.max(0, now - startedAt) / 86400000 * habit.dailyCost);
  }, 0);

  const handleCompleteGoal = (id: string) => {
    setData(prev => ({
      ...prev,
      goals: prev.goals.map(g => {
        if (g.id !== id) return g;
        if (g.recurring === "none") return { ...g, completed: true, completedAt: new Date().toISOString() };
        return {
          ...g,
          recurrenceState: {
            ...g.recurrenceState,
            [todayKey]: { ...getGoalRecurrenceState(g, todayKey), completed: true, missed: false, missedStreak: 0 },
          },
        };
      }),
    }));
  };

  const handleMedicationDose = (medicationId: string, time: string) => {
    const doseKey = getMedicationDoseKey(medicationId, time);
    setData(prev => {
      const current = prev.medicationLog?.[todayKey] ?? [];
      const next = current.includes(doseKey) ? current.filter(key => key !== doseKey) : [...current, doseKey];
      return { ...prev, medicationLog: { ...prev.medicationLog, [todayKey]: next } };
    });
  };

  const mealSummary = [
    { label: "Завтрак", foods: todayDiary.breakfast },
    { label: "Обед", foods: todayDiary.lunch },
    { label: "Ужин", foods: todayDiary.dinner },
    { label: "Перекус", foods: todayDiary.snack },
  ].filter(meal => meal.foods.length > 0).map(meal => ({
    label: meal.label,
    count: meal.foods.length,
    calories: meal.foods.reduce((total, food) => total + Math.round(food.calories * food.portion / 100), 0),
  }));
  const medicationLogForToday = data.medicationLog?.[todayKey] ?? [];
  const medicationsForToday = (data.medications ?? []).map(medication => ({
    medication,
    times: getMedicationTimesForDate(medication, todayKey),
    nextDateKey: getNextMedicationDateKey(medication, todayKey),
  }));
  const scheduledMedicationCount = medicationsForToday.reduce((total, item) => total + item.times.length, 0);
  const takenMedicationCount = medicationsForToday.reduce((total, item) => total + item.times.filter(time => medicationLogForToday.includes(getMedicationDoseKey(item.medication.id, time))).length, 0);

  return (
    <div className="app-page home-dashboard px-4 pt-14 pb-6">
      <div className="home-header flex items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-medium text-[#717988]">{formatDate()}</p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.04em] text-[#171923] leading-tight">{getGreeting()}{data.settings.userName ? `, ${data.settings.userName}` : ""}</h1>
          <p className="mt-1 text-[13px] text-[#717988]">Короткая сводка твоего прогресса</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="home-date-chip"><CalendarDays size={15} />Сегодня</span>
          <button onClick={onOpenSettings} aria-label="Открыть настройки" className="home-settings-button"><IcoSettings /></button>
        </div>
      </div>

      <div className="home-banner">
        <div className="home-banner-copy">
          <span className="home-live-dot" />
          <div>
            <p className="home-banner-title">{showDemoActivity ? "Демо активности включено" : "Твой день в фокусе"}</p>
            <p className="home-banner-subtitle">
              {goalsToday.length === 0 ? "Добавь первую задачу, чтобы спланировать день" : `${goalsToday.length - completedGoalsToday} задач осталось · ${completedGoalsToday} уже выполнено`}
            </p>
          </div>
        </div>
        <span className="home-banner-date">{formatDate()}</span>
      </div>

      <DashboardPanel
        title="Фокус за неделю"
        icon={<TrendingUp size={16} />}
        className="home-weekly home-focus-panel"
        action={<span className="dashboard-period-chip">Последние 7 дней</span>}
      >
        <div className="dashboard-chart-heading">
          <div>
            <p className="dashboard-chart-total">{formatDuration(Math.round(weeklyHours * 60))}</p>
            <p className="dashboard-chart-caption">суммарное время работы</p>
          </div>
          {showDemoActivity && <span className="dashboard-demo-label">Тестовые данные</span>}
        </div>
        <div className="home-line-chart" aria-label="График рабочего времени за последние семь дней">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={weekActivity.map(day => ({ ...day, goal: data.settings.workGoalHours }))} margin={{ top: 12, right: 12, left: 2, bottom: 0 }}>
              <defs>
                <linearGradient id="homeFocusFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#80b9ff" stopOpacity={0.36} />
                  <stop offset="100%" stopColor="#80b9ff" stopOpacity={0.015} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,.13)" strokeDasharray="4 5" />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={9} tick={{ fontSize: 11, fill: "#c8d8ec" }} />
              <YAxis tickLine={false} axisLine={false} tickMargin={6} width={36} tick={{ fontSize: 10, fill: "#b2c4dc" }} tickFormatter={value => `${value}ч`} domain={[0, "dataMax + 1"]} />
              <Tooltip
                labelFormatter={(_, payload) => payload?.[0]?.payload?.date ? formatDate(new Date(`${payload[0].payload.date}T12:00:00`)) : ""}
                formatter={(value: number, name: string) => [`${value} ч`, name === "В работе" ? "В работе" : "Цель"]}
                cursor={{ stroke: "rgba(255,255,255,.4)", strokeDasharray: "4 4" }}
                contentStyle={{ borderRadius: 12, border: "1px solid rgba(255,255,255,.2)", background: "#142642", color: "#fff", boxShadow: "0 12px 30px rgba(8,22,42,.3)", fontSize: 12 }}
              />
              <Line dataKey="goal" name="Цель" type="linear" stroke="rgba(255,255,255,.48)" strokeWidth={1.5} strokeDasharray="4 5" dot={false} activeDot={false} isAnimationActive animationDuration={650} />
              <Area dataKey="hours" name="В работе" type="monotone" stroke="#a9d2ff" strokeWidth={2.5} fill="url(#homeFocusFill)" dot={false} activeDot={{ r: 4, fill: "#fff", stroke: "#549AF2", strokeWidth: 3 }} isAnimationActive animationBegin={100} animationDuration={850} animationEasing="ease-out" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="dashboard-chart-legend">
          <span><i className="legend-line legend-line-blue" />Фактическое время</span>
          <span><i className="legend-line legend-line-muted" />Дневная цель · {data.settings.workGoalHours} ч</span>
          <span className="ml-auto">Активных дней: <b>{focusedDays}</b></span>
        </div>
      </DashboardPanel>

      <DashboardPanel title="Сводка недели" icon={<Target size={16} />} className="home-assets">
        <div className="weekly-summary">
          <div className="weekly-summary-hero">
            <div className="weekly-summary-heading">
              <span className="weekly-summary-icon"><Clock3 size={17} /></span>
              <span>В фокусе за 7 дней</span>
              <b>{focusedDays}/7 дней</b>
            </div>
            <strong>{weeklyHours.toFixed(1)} <small>ч</small></strong>
            <div className="weekly-summary-track"><i style={{ width: `${Math.min(100, weeklyHours / Math.max(data.settings.workGoalHours * 7, 1) * 100)}%` }} /></div>
            <p>{weeklyHours.toFixed(1)} из {data.settings.workGoalHours * 7} ч недельной цели</p>
          </div>
          <div className="weekly-summary-list">
            <div className="weekly-summary-row"><span className="weekly-row-icon weekly-row-green"><Flame size={16} /></span><span>Привычки</span><b>{data.habits.length}</b></div>
            <div className="weekly-summary-row"><span className="weekly-row-icon weekly-row-blue"><CalendarDays size={16} /></span><span>Активные дни</span><b>{focusedDays} <small>/ 7</small></b></div>
            <div className="weekly-summary-row"><span className="weekly-row-icon weekly-row-orange"><Sparkles size={16} /></span><span>Сэкономлено</span><b>{savedByHabits.toLocaleString("ru-RU")} ₽</b></div>
          </div>
        </div>
      </DashboardPanel>

      <div className="home-kpi-strip">
        <DashboardMetric label="Работа сегодня" value={formatDuration(workedMinutes)} detail={`из ${data.settings.workGoalHours} ч · ${Math.min(100, Math.round(workedMinutes / Math.max(goalMinutes, 1) * 100))}% цели`} icon={<Clock3 size={16} />} />
        <DashboardMetric label="Задачи на сегодня" value={`${completedGoalsToday} / ${goalsToday.length}`} detail={goalsToday.length ? "выполнено" : "пока нет задач"} icon={<Check size={16} />} tone="green" />
        <DashboardMetric label="Калории" value={`${caloriesEaten.toLocaleString("ru-RU")} ккал`} detail={`из ${data.settings.calorieGoal.toLocaleString("ru-RU")} ккал`} icon={<Utensils size={16} />} tone="orange" />
      </div>

      {data.settings.medicationsEnabled && (
        <DashboardPanel
          title="Таблетки на сегодня"
          icon={<PillIcon size={17} />}
          className="home-medications"
          action={<span className="medication-count-chip">{scheduledMedicationCount > 0 ? `${takenMedicationCount} из ${scheduledMedicationCount} приёмов` : "Сегодня без приёмов"}</span>}
        >
          {medicationsForToday.length === 0 ? (
            <div className="medication-empty-state">
              <span className="medication-empty-icon"><PillIcon size={20} /></span>
              <div><b>Добавь препарат в расписание</b><small>Укажи время и частоту приёма в настройках</small></div>
              <button onClick={onOpenSettings}>Настроить <ArrowUpRight size={15} /></button>
            </div>
          ) : (
            <div className="medication-cards-grid">
              {medicationsForToday.map(({ medication, times, nextDateKey }) => (
                <article className="medication-card" key={medication.id}>
                  <header className="medication-card-header">
                    <span className="medication-card-icon"><PillIcon size={17} /></span>
                    <div className="medication-card-title"><b>{medication.name}</b><small>{formatMedicationDose(medication.unitsPerDose)} за приём</small></div>
                    <span className="medication-schedule-label">{medication.frequency === "daily" ? `${times.length} ${times.length === 1 ? "раз" : "раза"} сегодня` : `Раз в ${formatDaysInterval(medication.intervalDays)}`}</span>
                  </header>
                  {times.length > 0 ? (
                    <div className="medication-dose-list">
                      {times.map(time => {
                        const taken = medicationLogForToday.includes(getMedicationDoseKey(medication.id, time));
                        return (
                          <button key={time} className={`medication-dose-row ${taken ? "is-taken" : ""}`} onClick={() => handleMedicationDose(medication.id, time)} aria-pressed={taken} aria-label={`${taken ? "Отменить отметку" : "Отметить приём"}: ${medication.name}, ${time}`}>
                            <span className="medication-dose-capsule" aria-hidden="true"><svg viewBox="0 0 34 20"><rect x="1" y="1" width="32" height="18" rx="9" /><path d="M17 1v18" /></svg>{taken && <Check size={12} />}</span>
                            <span className="medication-dose-copy"><b>{time}</b><small>{formatMedicationDose(medication.unitsPerDose)}</small></span>
                            <span className="medication-dose-status">{taken ? "Принято" : "Отметить"}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="medication-next-dose">Следующий приём <b>{new Date(`${nextDateKey}T12:00:00`).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" })} · {medication.intervalTime}</b></p>
                  )}
                </article>
              ))}
            </div>
          )}
        </DashboardPanel>
      )}

      <DashboardPanel title="Задачи на сегодня" icon={<Check size={16} />} className="home-goals" action={<span className="dashboard-count-chip">{completedGoalsToday}/{goalsToday.length}</span>}>
        {goalsToday.length === 0 ? (
          <div className="dashboard-empty">
            <span className="dashboard-empty-icon"><Target size={20} /></span>
            <div className="dashboard-empty-copy"><p>План на день свободен</p><span>Добавь задачу — она появится здесь</span></div>
            <button className="dashboard-empty-action" onClick={() => onNavigate("goals")}>Добавить задачу <ArrowUpRight size={15} /></button>
          </div>
        ) : (
          <div className="dashboard-goal-list">
            {goalsToday.slice(0, 5).map(goal => {
              const completed = isGoalCompletedForDate(goal, todayKey);
              return (
                <div key={goal.id} className={`dashboard-goal-row ${completed ? "is-complete" : ""}`}>
                  <button className="dashboard-goal-check" onClick={() => !completed && handleCompleteGoal(goal.id)} aria-label={completed ? "Задача выполнена" : `Отметить выполненной: ${goal.title}`} disabled={completed}>{completed && <Check size={13} />}</button>
                  <div className="dashboard-goal-copy">
                    <p>{goal.title}</p>
                    <div className="dashboard-goal-meta">
                      <span className="dashboard-priority-tag"><i style={{ background: PRIORITY_COLORS[goal.priority] }} />{PRIORITY_LABELS[goal.priority]} приоритет</span>
                      {goal.subtasks.length > 0 && <span>{goal.subtasks.filter(task => task.done).length} из {goal.subtasks.length} подзадач</span>}
                    </div>
                    {goal.subtasks.length > 0 && <div className="dashboard-goal-progress-track"><i style={{ width: `${calcGoalProgress(goal)}%` }} /></div>}
                  </div>
                  {goal.subtasks.length > 0 && <span className="dashboard-goal-progress">{calcGoalProgress(goal)}%</span>}
                </div>
              );
            })}
          </div>
        )}
      </DashboardPanel>

      <DashboardPanel title="Привычки" icon={<Flame size={16} />} className="home-habits">
        {data.habits.length === 0 ? (
          <div className="dashboard-empty">
            <span className="dashboard-empty-icon"><Flame size={20} /></span>
            <div className="dashboard-empty-copy"><p>Начни новую серию</p><span>Отмечай прогресс и следи за привычкой</span></div>
            <button className="dashboard-empty-action" onClick={() => onNavigate("habits")}>К привычкам <ArrowUpRight size={15} /></button>
          </div>
        ) : (
          <div className="dashboard-habit-list">
            {data.habits.slice(0, 4).map(habit => {
              const lastRelapse = habit.relapses.length ? Math.max(...habit.relapses.map(relapse => new Date(relapse.timestamp).getTime())) : null;
              const elapsed = lastRelapse ? now - lastRelapse : habit.startedAt ? now - new Date(habit.startedAt).getTime() : null;
              const elapsedHours = elapsed !== null ? Math.floor(elapsed / 3600000) : 0;
              const elapsedDays = Math.floor(elapsedHours / 24);
              const streakLabel = elapsed !== null ? (elapsedDays > 0 ? `${elapsedDays} дн` : `${elapsedHours} ч`) : "Новая привычка";
              return (
                <div key={habit.id} className="dashboard-habit-row">
                  <span className="dashboard-habit-icon">{HabitIconSvg[habit.icon] ?? HabitIconSvg.none}</span>
                  <div className="dashboard-habit-copy"><p>{habit.name}</p><small>{elapsed !== null ? "Серия без срыва" : "Начни сегодня"}</small></div>
                  <span className="dashboard-habit-streak"><Flame size={14} />{streakLabel}</span>
                </div>
              );
            })}
          </div>
        )}
      </DashboardPanel>

      <DashboardPanel title="Питание сегодня" icon={<Utensils size={16} />} className="home-nutrition" action={<button className="dashboard-panel-link" onClick={() => onNavigate("nutrition")}>Открыть дневник <ArrowUpRight size={15} /></button>}>
        <div className="dashboard-nutrition-layout">
          <div className="dashboard-nutrition-main">
            <div className="dashboard-calorie-ring" style={{ "--calorie-progress": `${Math.min(100, Math.round(caloriesEaten / Math.max(data.settings.calorieGoal, 1) * 100))}%` } as React.CSSProperties}>
              <div><b>{caloriesEaten.toLocaleString("ru-RU")}</b><small>ккал</small></div>
            </div>
            <div className="dashboard-calorie-copy">
              <span>Съедено за сегодня</span>
              <b>из {data.settings.calorieGoal.toLocaleString("ru-RU")} ккал</b>
              <div className="dashboard-calorie-track"><i style={{ width: `${Math.min(100, caloriesEaten / Math.max(data.settings.calorieGoal, 1) * 100)}%` }} /></div>
              <small>{Math.max(0, data.settings.calorieGoal - caloriesEaten).toLocaleString("ru-RU")} ккал до цели</small>
            </div>
          </div>
          <div className="dashboard-macro-list">
            {[
              { label: "Белки", value: macros.protein, max: data.settings.proteinGoal, color: "#549AF2" },
              { label: "Жиры", value: macros.fat, max: data.settings.fatGoal, color: "#ed9a50" },
              { label: "Углеводы", value: macros.carbs, max: data.settings.carbsGoal, color: "#38aa7d" },
            ].map(item => (
              <div key={item.label} className="dashboard-macro-row"><span>{item.label}</span><div className="dashboard-macro-track"><i style={{ width: `${Math.min(100, item.value / Math.max(item.max, 1) * 100)}%`, background: item.color }} /></div><b>{item.value}<small> г</small></b></div>
            ))}
          </div>
          <div className="dashboard-meals-panel">
            <p>Приёмы пищи</p>
            {mealSummary.length === 0 ? (
              <div className="dashboard-meals-empty"><Utensils size={18} /><span>Пока нет записей</span><small>Добавь продукты в дневник</small></div>
            ) : (
              <div className="dashboard-meals-list">{mealSummary.map(meal => <div key={meal.label} className="dashboard-meal-row"><span><b>{meal.label}</b><small>{meal.count} {meal.count === 1 ? "продукт" : meal.count < 5 ? "продукта" : "продуктов"}</small></span><strong>{meal.calories.toLocaleString("ru-RU")} <small>ккал</small></strong></div>)}</div>
            )}
          </div>
        </div>
      </DashboardPanel>
    </div>
  );
}

function GoalQuickItem({ goal, onComplete }: { goal: Goal; onComplete: (id: string) => void }) {
  const [filling, setFilling] = useState(false);
  const [fillPct, setFillPct] = useState(0);
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fillStartRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  const startPress = useCallback(() => {
    lpTimer.current = setTimeout(() => {
      setFilling(true);
      fillStartRef.current = Date.now();
      const animate = () => {
        const pct = Math.min((Date.now() - fillStartRef.current) / 2000 * 100, 100);
        setFillPct(pct);
        if (pct < 100) {
          rafRef.current = requestAnimationFrame(animate);
        } else {
          onComplete(goal.id);
          setFilling(false);
          setFillPct(0);
        }
      };
      rafRef.current = requestAnimationFrame(animate);
    }, 600);
  }, [goal.id, onComplete]);

  const cancelPress = useCallback(() => {
    if (lpTimer.current) clearTimeout(lpTimer.current);
    cancelAnimationFrame(rafRef.current);
    setFilling(false);
    setFillPct(0);
  }, []);

  return (
    <div
      className="relative rounded-xl overflow-hidden bg-white"
      style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
    >
      {filling && (
        <div
          className="absolute inset-y-0 left-0 bg-[#E8F5EE] rounded-xl transition-none"
          style={{ width: `${fillPct}%` }}
        />
      )}
      <div className="relative flex items-center gap-3 px-3 py-2.5">
        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: PRIORITY_COLORS[goal.priority] }} />
        <p className="text-[13px] text-[#1A1A2E] flex-1">{goal.title}</p>
        <span className="text-[11px] text-[#8A8A99]">{calcGoalProgress(goal)}%</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// WORK TAB — обновлённая версия
// Заменить старый WorkTab в App.tsx на этот код
// ═══════════════════════════════════════════════════
//
// Изменения в типах AppData:
// Было:   workSessions: Record<string, WorkSession[]>
// Стало:  workActivity: Record<string, { totalSeconds: number; hours: Record<string, number> }>
//
// Также обновить HomeTab — заменить расчёт workedMinutes:
// Было:
//   const todaySessions = data.workSessions[todayKey] ?? [];
//   const workedMinutes = todaySessions.reduce((acc, s) => acc + sessionMinutes(s), 0);
// Стало:
//   const workedMinutes = Math.floor((data.workActivity?.[todayKey]?.totalSeconds ?? 0) / 60);
// ═══════════════════════════════════════════════════

const workWeeklyChartConfig = {
  hours: { label: "Фокус", color: "#549AF2" },
} satisfies ChartConfig;

const workStatsChartConfig = {
  hours: { label: "Фокус", color: "#549AF2" },
} satisfies ChartConfig;

function WorkTab({ data, setData }: { data: AppData; setData: (fn: (p: AppData) => AppData) => void }) {
  const [view, setView] = useState<"today" | "stats">("today");
  const [showGoalSheet, setShowGoalSheet] = useState(false);
  const [goalInput, setGoalInput] = useState(String(data.settings.workGoalHours));
  const [selectedDate, setSelectedDate] = useState(() => getDateKey());
  const [periodStart, setPeriodStart] = useState(() => getDateKey());
  const [periodEnd, setPeriodEnd] = useState(() => getDateKey());
  const reduceMotion = useReducedMotion();

  const todayKey = getDateKey();
  useEffect(() => {
    const today = getDateKey();
    setSelectedDate(today);
    setPeriodStart(today);
    setPeriodEnd(today);
  }, []);

  const handleDateChange = (value: string) => {
    if (!value) return;
    const [year, month, day] = value.split("-").map(Number);
    setSelectedDate(getDateKey(new Date(year, month - 1, day)));
  };

  const handleRangeStartChange = (value: string) => {
    if (!value) return;
    const [year, month, day] = value.split("-").map(Number);
    const nextStart = getDateKey(new Date(year, month - 1, day));
    const nextEnd = new Date(`${periodEnd}T12:00:00`) < new Date(`${nextStart}T12:00:00`) ? nextStart : periodEnd;
    setPeriodStart(nextStart);
    setPeriodEnd(nextEnd);
  };

  const handleRangeEndChange = (value: string) => {
    if (!value) return;
    const [year, month, day] = value.split("-").map(Number);
    const nextEnd = getDateKey(new Date(year, month - 1, day));
    const nextStart = new Date(`${periodStart}T12:00:00`) > new Date(`${nextEnd}T12:00:00`) ? nextEnd : periodStart;
    setPeriodStart(nextStart);
    setPeriodEnd(nextEnd);
  };

  const shiftSelectedDate = (days: number) => {
    const base = new Date(`${selectedDate}T12:00:00`);
    setSelectedDate(getDateKey(addDays(base, days)));
  };
  const hasRecordedWorkActivity = Object.values(data.workActivity ?? {}).some(activity => activity.totalSeconds > 0);
  const showDemoActivity = !hasRecordedWorkActivity && isWorkActivityDemoEnabled();
  const selectedActivity = getWorkActivityForDisplay(data.workActivity, selectedDate, showDemoActivity);
  const workedSeconds = selectedActivity.totalSeconds ?? 0;
  const workedMinutes = Math.floor(workedSeconds / 60);
  const goalSeconds = data.settings.workGoalHours * 3600;
  const goalHours = data.settings.workGoalHours;

  const selectedHours: Record<string, number> = selectedActivity.hours ?? {};
  const peakHourEntry = Object.entries(selectedHours).sort((a, b) => b[1] - a[1])[0];
  const selectedDayLabel = selectedDate === todayKey ? "Сегодня" : formatDate(new Date(`${selectedDate}T12:00:00`));
  const progressPercent = Math.round((workedSeconds / Math.max(goalSeconds, 1)) * 100);

  const saveGoal = () => {
    const h = parseFloat(goalInput);
    if (!isNaN(h) && h > 0) {
      setData(prev => ({ ...prev, settings: { ...prev.settings, workGoalHours: h } }));
    }
    setShowGoalSheet(false);
  };

  const days = getDateWindow(selectedDate, 7);
  const chartDataDays = days.map(d => {
    const act = getWorkActivityForDisplay(data.workActivity, d, showDemoActivity);
    return {
      key: d,
      day: shortDay(d),
      label: `${shortDay(d)} ${d.slice(5)}`,
      hours: parseFloat((act.totalSeconds / 3600).toFixed(1)),
      goal: goalHours,
      isSelected: d === selectedDate,
      fill: d === selectedDate ? "#347DCE" : act.totalSeconds > 0 ? "#9BC5F8" : "#E8EEF6",
    };
  });

  const rangeDays = getDateRange(periodStart, periodEnd);
  const periodChartData = rangeDays.map(d => {
    const act = getWorkActivityForDisplay(data.workActivity, d, showDemoActivity);
    return {
      key: d,
      label: d.slice(5).replace("-", "."),
      day: shortDay(d),
      hours: parseFloat((act.totalSeconds / 3600).toFixed(1)),
    };
  });
  const periodChartMax = Math.max(goalHours, Math.ceil(Math.max(...periodChartData.map(day => day.hours), 0)));

  const totalPeriodHours = periodChartData.reduce((acc, d) => acc + d.hours, 0);
  const averagePeriodHours = periodChartData.length > 0 ? parseFloat((totalPeriodHours / periodChartData.length).toFixed(1)) : 0;
  const bestPeriodDay = periodChartData.reduce((best, d) => d.hours > best.hours ? d : best, periodChartData[0] ?? { key: "", hours: 0, day: "", label: "—" });
  const weekAvg = parseFloat((chartDataDays.reduce((acc, d) => acc + d.hours, 0) / chartDataDays.length).toFixed(1));

  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const secs = getWorkActivityForDisplay(data.workActivity, days[i], showDemoActivity).totalSeconds;
    if (secs >= goalSeconds) streak++;
    else break;
  }

  const selectedDateHeading = selectedDate === todayKey
    ? "Сегодня"
    : new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${selectedDate}T12:00:00`));
  const safeProgressPercent = Math.min(progressPercent, 100);
  const hoursUntilGoal = Math.max(goalSeconds - workedSeconds, 0);
  const goalHint = workedSeconds >= goalSeconds
    ? "Дневная цель выполнена — отличный темп"
    : `До цели осталось ${Math.floor(hoursUntilGoal / 3600)} ч ${Math.floor((hoursUntilGoal % 3600) / 60)} мин`;

  return (
    <div className="app-page work-page pt-14 pb-6">
      <header className="work-page-header">
        <div className="work-heading-copy">
          <div className="work-overline"><span />МОЯ ПРОДУКТИВНОСТЬ</div>
          <div className="work-title-row">
            <h1>Работа</h1>
            {showDemoActivity && <span className="work-demo-badge"><Sparkles size={12} />Демо-данные</span>}
          </div>
          <p>Время, которое ты вкладываешь в важное</p>
        </div>

        <div className="work-header-controls">
          <div className="work-view-switch" role="tablist" aria-label="Раздел работы">
            {(["today", "stats"] as const).map(v => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={view === v ? "is-active" : ""}
              >
                {view === v && <motion.span layoutId="work-view-active" className="work-view-indicator" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                {v === "today" ? <><CalendarDays size={15} />День</> : <><BarChart3 size={15} />Аналитика</>}
              </button>
            ))}
          </div>
          <div className="work-date-control">
            <button type="button" className="work-icon-button" onClick={() => shiftSelectedDate(-1)} aria-label="Предыдущий день">
              <ChevronLeft size={18} />
            </button>
            <label className="work-date-select">
              <CalendarDays size={16} />
              <span>{selectedDateHeading}</span>
              <input type="date" value={selectedDate} max={todayKey} onChange={e => handleDateChange(e.target.value)} aria-label="Выбрать дату активности" />
            </label>
            <button type="button" className="work-icon-button" onClick={() => shiftSelectedDate(1)} disabled={selectedDate >= todayKey} aria-label="Следующий день">
              <ChevronRight size={18} />
            </button>
            {selectedDate !== todayKey && <button type="button" className="work-today-button" onClick={() => setSelectedDate(todayKey)}>Сегодня</button>}
          </div>
        </div>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view}
          className="work-view-content"
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
          transition={{ duration: reduceMotion ? 0 : 0.22, ease: "easeOut" }}
        >
          {view === "today" ? (
            <div className="work-today-grid">
              <Card className="work-focus-card">
                <div className="work-focus-topline">
                  <span className="work-focus-icon"><Clock3 size={17} /></span>
                  <span className="work-focus-kicker">ФОКУС · {selectedDateHeading.toLocaleUpperCase("ru-RU")}</span>
                  <button type="button" className="work-goal-edit" onClick={() => { setGoalInput(String(data.settings.workGoalHours)); setShowGoalSheet(true); }} aria-label="Изменить дневную цель">
                    <Target size={14} /><span>Цель</span><b>{goalHours} ч</b>
                  </button>
                </div>

                <div className="work-focus-main">
                  <div>
                    <p className="work-focus-label">Отработано</p>
                    <p className="work-focus-value">
                      {Math.floor(workedMinutes / 60)}<small>ч</small> {String(workedMinutes % 60).padStart(2, "0")}<small>м</small>
                    </p>
                    <p className="work-focus-goal">{goalHint}</p>
                  </div>
                  <button type="button" className="work-focus-ring-button" onClick={() => { setGoalInput(String(data.settings.workGoalHours)); setShowGoalSheet(true); }} aria-label={`Прогресс ${progressPercent} процентов. Изменить дневную цель`}>
                    <ProgressRing value={workedSeconds} max={goalSeconds} size={88} stroke={6} color="#B9D8FF" trackColor="rgba(255,255,255,.18)">
                      <span className="work-focus-percent">{safeProgressPercent}<small>%</small></span>
                    </ProgressRing>
                  </button>
                </div>

                <div className="work-focus-progress-track"><motion.span initial={false} animate={{ width: `${safeProgressPercent}%` }} transition={{ duration: reduceMotion ? 0 : 0.7, ease: "easeOut" }} /></div>
                <div className="work-focus-footer">
                  <span>{workedSeconds >= goalSeconds ? "Цель достигнута" : "Прогресс к дневной цели"}</span>
                  <b>{progressPercent}%</b>
                </div>
                {peakHourEntry && <div className="work-focus-peak"><Flame size={14} /> Самый активный час <b>{peakHourEntry[0]}:00</b></div>}
              </Card>

              <HourlyActivityChart hours={selectedHours} selectedDayLabel={selectedDayLabel} />

              <Card className="work-week-card dashboard-card">
                <div className="work-week-heading">
                  <div>
                    <p className="work-overline">ПОСЛЕДНИЕ 7 ДНЕЙ</p>
                    <h2>Неделя в фокусе</h2>
                  </div>
                  <div className="work-week-summary"><span>в среднем</span><b>{weekAvg.toFixed(1)} ч <small>/ день</small></b></div>
                </div>
                <ChartContainer config={workWeeklyChartConfig} className="work-week-chart">
                  <BarChart data={chartDataDays} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} barCategoryGap="34%">
                    <CartesianGrid vertical={false} stroke="#E9EEF5" strokeDasharray="3 5" />
                    <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={10} tick={{ fontSize: 11, fill: "#8491A3" }} />
                    <YAxis width={40} tickCount={4} tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 10, fill: "#9AA5B4" }} tickFormatter={value => `${value}ч`} />
                    <ReferenceLine y={goalHours} stroke="#549AF2" strokeDasharray="4 5" strokeWidth={1.5} />
                    <ChartTooltip
                      cursor={{ fill: "rgba(84,154,242,.07)" }}
                      content={<ChartTooltipContent labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ""} formatter={value => <span className="font-mono font-semibold tabular-nums text-[#26364D]">{Number(value).toFixed(1)} ч</span>} />}
                    />
                    <Bar dataKey="hours" name="В фокусе" radius={[7, 7, 3, 3]} maxBarSize={34} animationDuration={750} animationEasing="ease-out">
                      {chartDataDays.map(day => <Cell key={day.key} fill={day.fill} />)}
                    </Bar>
                  </BarChart>
                </ChartContainer>
                <div className="work-week-legend"><span><i />Фокус по дням</span><span><i className="is-goal" />Цель — {goalHours} ч</span></div>
              </Card>
            </div>
          ) : (
            <div className="work-stats-grid">
              <Card className="work-period dashboard-card">
                <div className="work-period-copy">
                  <span className="work-period-icon"><CalendarDays size={17} /></span>
                  <div><p className="work-overline">АНАЛИТИКА</p><h2>Выбери период</h2></div>
                </div>
                <div className="work-period-fields">
                  <label><span>С</span><input type="date" value={periodStart} max={todayKey} onChange={e => handleRangeStartChange(e.target.value)} aria-label="Начало периода" /></label>
                  <span className="work-period-dash">—</span>
                  <label><span>По</span><input type="date" value={periodEnd} max={todayKey} onChange={e => handleRangeEndChange(e.target.value)} aria-label="Конец периода" /></label>
                  <span className="work-period-count">{periodChartData.length} {periodChartData.length === 1 ? "день" : "дней"}</span>
                </div>
              </Card>

              <Card className="work-chart dashboard-card">
                <div className="work-chart-heading">
                  <div><p className="work-overline">ТВОЯ ДИНАМИКА</p><h2>Фокус по дням</h2></div>
                  <span className="work-chart-total">{totalPeriodHours.toFixed(1)} <small>ч за период</small></span>
                </div>
                <ChartContainer config={workStatsChartConfig} className="work-period-chart">
                  <AreaChart data={periodChartData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="workStatsFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#549AF2" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#549AF2" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#E9EEF5" strokeDasharray="3 5" />
                    <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={24} tick={{ fontSize: 10, fill: "#8491A3" }} axisLine={false} tickLine={false} tickMargin={10} />
                    <YAxis width={42} domain={[0, periodChartMax]} tickCount={4} tick={{ fontSize: 10, fill: "#9AA5B4" }} axisLine={false} tickLine={false} tickMargin={8} tickFormatter={value => `${value}ч`} />
                    <ReferenceLine y={goalHours} stroke="#549AF2" strokeDasharray="4 5" strokeWidth={1.5} />
                    <ChartTooltip
                      cursor={{ stroke: "#549AF2", strokeDasharray: "4 4", strokeWidth: 1 }}
                      content={<ChartTooltipContent labelFormatter={(_, payload) => { const key = payload?.[0]?.payload?.key as string | undefined; return key ? `${shortDay(key)}, ${key.slice(8)}.${key.slice(5, 7)}` : ""; }} formatter={value => <span className="font-mono font-semibold tabular-nums text-[#26364D]">{Number(value).toFixed(1)} ч</span>} />}
                    />
                    <Area type="monotone" dataKey="hours" name="В фокусе" stroke="#549AF2" strokeWidth={2.5} fill="url(#workStatsFill)" dot={false} activeDot={{ r: 5, fill: "#549AF2", stroke: "white", strokeWidth: 3 }} animationDuration={850} />
                  </AreaChart>
                </ChartContainer>
                <div className="work-chart-footnote"><span />Дневная цель — {goalHours} ч</div>
              </Card>

              <div className="work-stats-aside">
                <div className="work-metrics">
                  <Card className="work-metric-card dashboard-card">
                    <span className="work-metric-icon"><Clock3 size={16} /></span>
                    <p>Всего в фокусе</p>
                    <strong>{totalPeriodHours.toFixed(1)}<small>ч</small></strong>
                  </Card>
                  <Card className="work-metric-card dashboard-card">
                    <span className="work-metric-icon"><TrendingUp size={16} /></span>
                    <p>В среднем за день</p>
                    <strong>{averagePeriodHours.toFixed(1)}<small>ч</small></strong>
                  </Card>
                  <Card className="work-metric-card dashboard-card">
                    <span className="work-metric-icon"><Sparkles size={16} /></span>
                    <p>Лучший день</p>
                    <strong>{bestPeriodDay?.hours ?? 0}<small>ч</small></strong>
                    <em>{bestPeriodDay?.key ? `${shortDay(bestPeriodDay.key)}, ${bestPeriodDay.key.slice(8)}.${bestPeriodDay.key.slice(5, 7)}` : "Пока нет данных"}</em>
                  </Card>
                </div>
                <Card className="work-streak dashboard-card">
                  <div className="work-streak-icon"><Flame size={19} /></div>
                  <div><p className="work-overline">ТВОЙ РИТМ</p><strong>{streak} {streak === 1 ? "день" : streak < 5 ? "дня" : "дней"} подряд</strong><span>с выполненной дневной целью</span></div>
                </Card>
              </div>

              <Card className="work-days dashboard-card">
                <div className="work-days-heading"><div><p className="work-overline">РАЗБИВКА</p><h2>Каждый день</h2></div><span>{periodChartData.length} {periodChartData.length === 1 ? "день" : "дней"}</span></div>
                <div className="work-day-list">
                  {periodChartData.map(item => (
                    <div key={item.key} className="work-day-row">
                      <div className="work-day-copy"><b>{item.day}</b><span>{item.label}</span></div>
                      <div className="work-day-meter"><i style={{ width: `${Math.min((item.hours / Math.max(goalHours, 1)) * 100, 100)}%` }} /></div>
                      <strong>{item.hours.toFixed(1)}<small>ч</small></strong>
                    </div>
                  ))}
                </div>
              </Card>

            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <BottomSheet open={showGoalSheet} onClose={() => setShowGoalSheet(false)} title="Дневная цель">
        <div className="px-5 py-4">
          <p className="text-sm text-[#8A8A99] mb-4">Сколько часов планируешь работать в день?</p>
          <div className="flex items-center gap-3 mb-6">
            <input
              type="number"
              value={goalInput}
              onChange={e => setGoalInput(e.target.value)}
              className="flex-1 bg-[#F0F0EE] rounded-xl px-4 py-3 text-[#1A1A2E] text-lg font-medium outline-none"
              min={1} max={24} step={0.5}
            />
            <span className="text-[#8A8A99]">часов</span>
          </div>
          <button
            onClick={saveGoal}
            className="w-full py-3 bg-[#1A1A2E] text-white rounded-xl font-medium active:scale-95 transition-all"
          >
            Сохранить
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// GOALS TAB
// ═══════════════════════════════════════════════════

function GoalsTab({ data, setData }: { data: AppData; setData: (fn: (p: AppData) => AppData) => void }) {
  const [group, setGroup] = useState<GoalGroup>("all");
  const [selectedDate, setSelectedDate] = useState(getDateKey());
  const [showArchive, setShowArchive] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [selectedGoalDetailsId, setSelectedGoalDetailsId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const dateStripRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{ dragging: boolean; startX: number; startScrollLeft: number }>({
    dragging: false,
    startX: 0,
    startScrollLeft: 0,
  });

  const todayKey = getDateKey();

  useEffect(() => {
    setSelectedDate(todayKey);
  }, [todayKey]);

  useEffect(() => {
    const rollForwardGoals = () => {
      setData(prev => ({
        ...prev,
        goals: prev.goals.map(g => {
          if (g.completed || g.archived) return g;

          if (g.group === "today") {
            if (g.recurring === "daily" || g.recurring === "weekly") return g;
            const currentDate = g.scheduledFor ?? g.deadline ?? g.createdAt ?? todayKey;
            if (currentDate < todayKey) {
              return { ...g, scheduledFor: todayKey };
            }
            return g;
          }

          if (g.group === "week") {
            const weeklyAnchor = g.scheduledFor ?? g.createdAt ?? todayKey;
            const currentWeek = getWeekBounds(todayKey);
            const goalWeek = getWeekBounds(weeklyAnchor);
            if (goalWeek.end < currentWeek.start) {
              return { ...g, scheduledFor: todayKey };
            }
          }

          return g;
        }),
      }));
    };

    rollForwardGoals();

    const intervalId = window.setInterval(rollForwardGoals, 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [todayKey, setData]);

  const newGoal = (): Partial<Goal> => ({
    title: "", description: "", deadline: null, priority: "medium", group: group === "all" ? "today" : group, scheduledFor: selectedDate, subtasks: [], recurring: "none",
  });
  const [draft, setDraft] = useState<Partial<Goal>>(newGoal());
  const [newSubtask, setNewSubtask] = useState("");
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const datePickerRef = useRef<HTMLInputElement | null>(null);

  const changeSelectedDate = (days: number) => {
    const date = new Date(`${selectedDate}T12:00:00`);
    date.setDate(date.getDate() + days);
    setSelectedDate(getDateKey(date));
  };

  const goToToday = () => setSelectedDate(todayKey);

  const openDatePicker = () => {
    window.setTimeout(() => {
      if (datePickerRef.current) {
        if (typeof datePickerRef.current.showPicker === "function") {
          datePickerRef.current.showPicker();
        } else {
          datePickerRef.current.focus();
          datePickerRef.current.click();
        }
      }
    }, 0);
  };

  const handleDatePickerChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    if (value) {
      setSelectedDate(value);
    }
  };

  const matchesSelectedDate = (goal: Goal) => {
    if (goal.group === "longterm") return true;
    if (goal.group === "week") {
      const anchorKey = goal.scheduledFor ?? goal.createdAt ?? selectedDate;
      const { start, end } = getWeekBounds(anchorKey);
      return selectedDate >= start && selectedDate <= end;
    }
    if (goal.group === "today") {
      if (goal.recurring === "daily" || goal.recurring === "weekly") {
        return goal.scheduledFor === selectedDate;
      }

      if (goal.completed) {
        if (goal.recurrenceState?.[selectedDate]?.completed) return true;
        const completedTimestamp = goal.completedAt ? new Date(goal.completedAt) : null;
        const completedDate = completedTimestamp && !Number.isNaN(completedTimestamp.getTime())
          ? getDateKey(completedTimestamp)
          : getGoalDateValue(goal, selectedDate);
        return completedDate === selectedDate;
      }

      const goalDate = getGoalDateValue(goal, selectedDate);
      return goalDate === selectedDate;
    }
    if (goal.scheduledFor) return goal.scheduledFor === selectedDate;
    if (goal.deadline) return goal.deadline === selectedDate;
    return selectedDate === todayKey;
  };

  const isOverdueWeekGoal = (goal: Goal) => {
    if (goal.group !== "week" || goal.completed) return false;
    const createdKey = goal.createdAt ?? goal.scheduledFor ?? selectedDate;
    const { end } = getWeekBounds(createdKey);
    return selectedDate > end;
  };

  const visibleGoals = data.goals.filter(g => !g.archived && matchesSelectedDate(g));
  const activeGoals = group === "all" ? visibleGoals : visibleGoals.filter(g => g.group === group);
  const archivedGoals = data.goals.filter(g => g.archived && !isExpiredArchivedGoal(g));
  const sortGoalsForDisplay = (goals: Goal[]) => [...goals].sort((a, b) => {
    const aCompleted = isGoalCompletedForDate(a, selectedDate);
    const bCompleted = isGoalCompletedForDate(b, selectedDate);
    if (aCompleted !== bCompleted) return Number(aCompleted) - Number(bCompleted);
    if (!aCompleted && !bCompleted) {
      const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
    }
    return a.title.localeCompare(b.title);
  });
  const sections = group === "all"
    ? GOAL_SECTIONS.map(section => ({
        key: section,
        todos: sortGoalsForDisplay(visibleGoals.filter(g => g.group === section && !isGoalCompletedForDate(g, selectedDate))),
        dones: sortGoalsForDisplay(visibleGoals.filter(g => g.group === section && isGoalCompletedForDate(g, selectedDate))),
      }))
    : [{
        key: group as Exclude<GoalGroup, "all">,
        todos: sortGoalsForDisplay(activeGoals.filter(g => !isGoalCompletedForDate(g, selectedDate))),
        dones: sortGoalsForDisplay(activeGoals.filter(g => isGoalCompletedForDate(g, selectedDate))),
      }];
  const visibleSections = sections.filter(section => section.todos.length > 0 || section.dones.length > 0);
  const visibleActiveSections = visibleSections.filter(section => section.todos.length > 0);
  const completedGoals = visibleSections.flatMap(section => section.dones).sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  const totalVisibleGoals = visibleSections.reduce((total, section) => total + section.todos.length + section.dones.length, 0);
  const completedVisibleGoals = visibleSections.reduce((total, section) => total + section.dones.length, 0);
  const remainingVisibleGoals = totalVisibleGoals - completedVisibleGoals;
  const overdueVisibleGoals = visibleGoals.filter(goal => !isGoalCompletedForDate(goal, selectedDate) && isGoalOverdue(goal, selectedDate)).length;
  const goalCompletionPercent = totalVisibleGoals ? Math.round(completedVisibleGoals / totalVisibleGoals * 100) : 0;

  const pruneExpiredArchivedGoals = useCallback(() => {
    setData(prev => ({
      ...prev,
      goals: prev.goals.filter(g => !(g.archived && g.archivedSource === "deleted" && isExpiredArchivedGoal(g))),
    }));
  }, [setData]);

  useEffect(() => {
    pruneExpiredArchivedGoals();
    const intervalId = window.setInterval(pruneExpiredArchivedGoals, 60 * 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [pruneExpiredArchivedGoals]);

  const handleComplete = (id: string) => {
    setData(prev => ({
      ...prev,
      goals: prev.goals.map(g => {
        if (g.id !== id) return g;

        return {
          ...g,
          completed: true,
          completedAt: new Date().toISOString(),
          subtasks: g.subtasks.map(s => ({ ...s, done: true })),
          recurrenceState: {
            ...(g.recurrenceState ?? {}),
            [selectedDate]: {
              completed: true,
              missed: false,
              missedStreak: 0,
            },
          },
        };
      }),
    }));
  };

  const handleCompleteFromEditor = () => {
    if (!editingGoalId) return;
    handleComplete(editingGoalId);
    closeGoalEditor();
  };

  const handleUncomplete = (id: string) => {
    setData(prev => ({
      ...prev,
      goals: prev.goals.map(g => {
        if (g.id !== id) return g;

        return {
          ...g,
          completed: false,
          completedAt: null,
          subtasks: g.subtasks.map(s => ({ ...s, done: false })),
          recurrenceState: {
            ...(g.recurrenceState ?? {}),
            [selectedDate]: {
              completed: false,
              missed: false,
              missedStreak: 0,
            },
          },
        };
      }),
    }));
  };

  const handleDelete = (id: string, mode: "single" | "series" = "single") => {
    setData(prev => ({
      ...prev,
      goals: prev.goals.filter(g => {
        if (g.id !== id) {
          if (mode === "series" && g.recurring !== "none" && g.recurrenceSeriesId && g.recurrenceSeriesId === prev.goals.find(item => item.id === id)?.recurrenceSeriesId && g.scheduledFor && g.scheduledFor >= (prev.goals.find(item => item.id === id)?.scheduledFor ?? selectedDate)) {
            return false;
          }
          return true;
        }

        if (mode === "series" && g.recurring !== "none" && g.recurrenceSeriesId) {
          return false;
        }

        return false;
      }),
    }));
  };

  const handleArchive = (id: string) => {
    setData(prev => ({
      ...prev,
      goals: prev.goals.map(g => g.id === id ? { ...g, archived: true, archivedAt: null, archivedSource: "manual" } : g),
    }));
  };

  const handleToggleSubtask = (goalId: string, subId: string) => {
    setData(prev => ({
      ...prev,
      goals: prev.goals.map(g => {
        if (g.id !== goalId) return g;
        const updatedSubtasks = g.subtasks.map(s => s.id === subId ? { ...s, done: !s.done } : s);
        const allDone = updatedSubtasks.length > 0 && updatedSubtasks.every(s => s.done);
        return {
          ...g,
          subtasks: updatedSubtasks,
          completed: allDone ? true : updatedSubtasks.length > 0 ? false : g.completed,
          completedAt: allDone ? new Date().toISOString() : updatedSubtasks.length > 0 ? null : g.completedAt,
          recurrenceState: {
            ...(g.recurrenceState ?? {}),
            [selectedDate]: {
              completed: allDone,
              missed: false,
              missedStreak: 0,
            },
          },
        };
      }),
    }));
  };

  const openGoalEditor = (goal?: Goal) => {
    if (goal) {
      setEditingGoalId(goal.id);
      setDraft({
        ...goal,
        description: goal.description ?? "",
        deadline: goal.deadline ?? null,
        scheduledFor: goal.scheduledFor ?? selectedDate,
        subtasks: [...goal.subtasks],
      });
    } else {
      setEditingGoalId(null);
      setDraft(newGoal());
    }
    setShowAddSheet(true);
  };

  const closeGoalEditor = () => {
    setShowAddSheet(false);
    setEditingGoalId(null);
    setDraft(newGoal());
    setNewSubtask("");
  };

  const openGoalDetails = (goal: Goal) => {
    setSelectedGoalDetailsId(goal.id);
  };

  const closeGoalDetails = () => {
    setSelectedGoalDetailsId(null);
  };

  const selectedGoalDetails = data.goals.find(g => g.id === selectedGoalDetailsId) ?? null;

  const handleSaveGoal = () => {
    if (!draft.title?.trim()) return;
    if (editingGoalId) {
      setData(prev => ({
        ...prev,
        goals: prev.goals.map(g =>
          g.id === editingGoalId
            ? {
                ...g,
                title: draft.title?.trim() ?? g.title,
                description: draft.description?.trim() ?? "",
                deadline: draft.deadline ?? null,
                priority: draft.priority ?? g.priority,
                group: draft.group ?? g.group,
                scheduledFor: draft.scheduledFor ?? g.scheduledFor ?? selectedDate,
                subtasks: draft.subtasks ?? g.subtasks,
                recurring: draft.recurring ?? g.recurring,
              }
            : g
        ),
      }));
    } else {
      const baseGoal: Goal = {
        id: uid(),
        title: draft.title.trim(),
        description: draft.description?.trim() ?? "",
        createdAt: getDateKey(),
        deadline: draft.deadline ?? null,
        priority: draft.priority ?? "medium",
        group: draft.group ?? (group === "all" ? "today" : group),
        scheduledFor: draft.scheduledFor ?? selectedDate,
        subtasks: draft.subtasks ?? [],
        completed: false,
        completedAt: null,
        recurring: draft.recurring ?? "none",
        archived: false,
      };

      const goalsToAdd = (draft.recurring ?? "none") === "daily" || (draft.recurring ?? "none") === "weekly"
        ? buildRecurringGoalSeries(baseGoal)
        : [baseGoal];

      setData(prev => ({ ...prev, goals: [...prev.goals, ...goalsToAdd] }));
    }
    closeGoalEditor();
  };

  const addDraftSubtask = () => {
    if (!newSubtask.trim()) return;
    setDraft(d => ({ ...d, subtasks: [...(d.subtasks ?? []), { id: uid(), title: newSubtask.trim(), done: false }] }));
    setNewSubtask("");
  };

  const dateItems = Array.from({ length: 14 }, (_, index) => {
    const day = addDays(new Date(`${selectedDate}T12:00:00`), index - 6);
    const key = getDateKey(day);
    return {
      key,
      label: key === todayKey ? "Сегодня" : `${day.getDate()} ${["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"][day.getMonth()]}`,
      short: ["вс", "пн", "вт", "ср", "чт", "пт", "сб"][day.getDay()],
    };
  });

  const selectedIndex = dateItems.findIndex(item => item.key === selectedDate);

  const handleDateStripWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!dateStripRef.current) return;
    const delta = event.deltaY || event.deltaX;
    if (Math.abs(delta) > 0) {
      event.preventDefault();
      dateStripRef.current.scrollLeft += delta;
    }
  };

  const handleDateStripMouseMoveGlobal = useCallback((event: MouseEvent) => {
    if (!dragStateRef.current.dragging || !dateStripRef.current) return;
    event.preventDefault();
    const deltaX = event.clientX - dragStateRef.current.startX;
    dateStripRef.current.scrollLeft = dragStateRef.current.startScrollLeft - deltaX;
  }, []);

  const handleDateStripMouseUpGlobal = useCallback(() => {
    dragStateRef.current.dragging = false;
    window.removeEventListener("mousemove", handleDateStripMouseMoveGlobal);
    window.removeEventListener("mouseup", handleDateStripMouseUpGlobal);
  }, [handleDateStripMouseMoveGlobal]);

  const handleDateStripMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!dateStripRef.current) return;
    dragStateRef.current = {
      dragging: true,
      startX: event.clientX,
      startScrollLeft: dateStripRef.current.scrollLeft,
    };
    window.addEventListener("mousemove", handleDateStripMouseMoveGlobal);
    window.addEventListener("mouseup", handleDateStripMouseUpGlobal);
  };

  useEffect(() => {
    if (!dateStripRef.current || selectedIndex < 0) return;
    const target = dateStripRef.current.children[selectedIndex] as HTMLElement | undefined;
    if (!target) return;
    const container = dateStripRef.current;
    const targetLeft = target.offsetLeft;
    const targetRight = targetLeft + target.offsetWidth;
    const containerLeft = container.scrollLeft;
    const containerRight = containerLeft + container.clientWidth;

    if (targetLeft < containerLeft || targetRight > containerRight) {
      container.scrollTo({ left: Math.max(0, targetLeft - 24), behavior: "auto" });
    }
  }, [selectedIndex]);

  useEffect(() => {
    if (!showAddSheet) return;
    const timer = window.setTimeout(() => {
      titleInputRef.current?.focus();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [showAddSheet]);

  return (
    <div className="app-page goals-page pt-14 pb-6">
      <header className="goals-header">
        <div className="goals-heading-copy">
          <p className="goals-eyebrow"><span />ПЛАНИРОВАНИЕ</p>
          <h1>Цели</h1>
          <p>Планируй важное на день и двигайся к большим результатам.</p>
        </div>
        <div className="goals-header-actions">
          <button type="button" className="goals-archive-button" onClick={() => setShowArchive(true)}><IcoArchive />Архив</button>
          <button type="button" className="goals-create-button" onClick={() => openGoalEditor()}><IcoPlus />Новая цель</button>
        </div>
      </header>

      <div className="goals-content">
        <section className="goals-overview" aria-label="Прогресс по целям">
          <div className="goals-overview-copy">
            <span className="goals-overview-icon"><Target size={18} /></span>
            <div>
              <p>{selectedDate === todayKey ? "ТВОЙ ПЛАН НА СЕГОДНЯ" : `ПЛАН · ${formatGoalDate(selectedDate).toLocaleUpperCase("ru-RU")}`}</p>
              <h2>{totalVisibleGoals === 0 ? "Освободи место для важного" : remainingVisibleGoals === 0 ? "План выполнен" : "Двигайся в своём темпе"}</h2>
              <span>{totalVisibleGoals === 0 ? "Добавь цель — и мы поможем превратить её в понятные шаги." : `${completedVisibleGoals} из ${totalVisibleGoals} ${totalVisibleGoals === 1 ? "цели" : "целей"} выполнено`}</span>
            </div>
          </div>
          <div className="goals-overview-count"><strong>{completedVisibleGoals}<small>/{totalVisibleGoals}</small></strong><span>выполнено</span></div>
          <div className="goals-overview-track"><i style={{ width: `${goalCompletionPercent}%` }} /></div>
          <div className="goals-overview-foot"><span>{remainingVisibleGoals ? `Осталось: ${remainingVisibleGoals}` : totalVisibleGoals ? "Все цели закрыты" : "Начни с одной цели"}</span>{overdueVisibleGoals > 0 && <b>{overdueVisibleGoals} просрочено</b>}</div>
        </section>

        <section className="goals-date-panel" aria-label="Выбор даты">
          <div className="goals-date-heading">
            <div className="goals-date-current">
              <span className="goals-date-icon"><CalendarDays size={17} /></span>
              <span><small>ВЫБРАННАЯ ДАТА</small><b>{selectedDate === todayKey ? `Сегодня · ${formatGoalDate(todayKey)}` : formatGoalDate(selectedDate)}</b></span>
            </div>
            <div className="goals-date-actions">
              {selectedDate !== todayKey && <button type="button" className="goals-today-button" onClick={goToToday}>Сегодня</button>}
              <button type="button" className="goals-date-nav" aria-label="Предыдущий день" onClick={() => changeSelectedDate(-1)}><ChevronLeft size={17} /></button>
              <button type="button" className="goals-date-nav" aria-label="Следующий день" onClick={() => changeSelectedDate(1)}><ChevronRight size={17} /></button>
              <button type="button" className="goals-date-picker-button" onClick={openDatePicker}>Выбрать дату</button>
            </div>
          </div>
          <input ref={datePickerRef} type="date" value={selectedDate} onChange={handleDatePickerChange} className="goals-date-input" aria-label="Выбрать дату целей" />
          <div ref={dateStripRef} className="goals-date-strip hide-scrollbar" onWheel={handleDateStripWheel} onMouseDown={handleDateStripMouseDown}>
            {dateItems.map(item => (
              <button key={item.key} type="button" role="tab" aria-selected={selectedDate === item.key} onClick={() => setSelectedDate(item.key)} className={`goals-date-chip ${selectedDate === item.key ? "is-selected" : ""}`}>
                <small>{item.short}</small><b>{item.label}</b>
              </button>
            ))}
          </div>
        </section>

        <div className="goals-filter-row">
          <div className="goals-filters" role="tablist" aria-label="Фильтр целей">
            {(["all", "today", "week", "longterm"] as GoalGroup[]).map(value => (
              <button key={value} type="button" role="tab" aria-selected={group === value} onClick={() => setGroup(value)} className={`goals-filter ${group === value ? "is-selected" : ""}`}>
                {getGoalGroupLabel(value, selectedDate, todayKey)}
              </button>
            ))}
          </div>
          <span className="goals-filter-count">{totalVisibleGoals} {getGoalCountWord(totalVisibleGoals)}</span>
        </div>

        {totalVisibleGoals === 0 ? (
          <div className="goals-empty-state">
            <span className="goals-empty-icon"><Target size={22} /></span>
            <div><h2>{group === "all" ? "Пока нет целей на эту дату" : `Здесь пока нет целей: ${getGoalGroupLabel(group, selectedDate, todayKey).toLocaleLowerCase("ru-RU")}`}</h2><p>Создай цель, добавь пару шагов и отмечай прогресс по мере выполнения.</p></div>
            <button type="button" onClick={() => openGoalEditor()}><Plus size={17} />Добавить цель</button>
          </div>
        ) : (
          <div className="goals-sections">
            {visibleActiveSections.map(section => (
              <section className="goal-group-section" key={section.key}>
                <div className="goal-group-heading">
                  <div><span className="goal-group-dot" /><h2>{getGoalGroupLabel(section.key, selectedDate, todayKey)}</h2><span>{section.todos.length}</span></div>
                  <p>{`${section.todos.length} ${getGoalCountWord(section.todos.length)} в работе`}</p>
                </div>
                <div className="goal-card-grid">
                  <AnimatePresence mode="popLayout">
                    {section.todos.map(goal => (
                      <motion.div key={goal.id} layout initial={{ opacity: 0, y: 12, scale: .99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: .98 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}>
                        <GoalCard goal={goal} expanded={expandedId === goal.id} overdue={isOverdueWeekGoal(goal) || isGoalOverdue(goal, selectedDate)} isCompleted={false} onToggleExpand={() => setExpandedId(expandedId === goal.id ? null : goal.id)} onEdit={() => openGoalEditor(goal)} onViewGoal={openGoalDetails} onToggleComplete={handleComplete} onDelete={handleDelete} onArchive={handleArchive} onToggleSubtask={handleToggleSubtask} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </section>
            ))}
            {totalVisibleGoals > 0 && (
              <section className="goal-group-section goals-completed-list" aria-label="Выполненные цели">
                <div className="goal-group-heading goal-completed-heading">
                  <div><span className="goal-group-dot" /><h2>Выполненные</h2><span>{completedGoals.length}</span></div>
                  <p>{completedGoals.length ? "Можно открыть или вернуть" : "Готовые цели будут здесь"}</p>
                </div>
                {completedGoals.length > 0 ? (
                  <div className="goal-card-grid goal-card-grid-completed">
                    <AnimatePresence mode="popLayout">
                      {completedGoals.map(goal => (
                        <motion.div key={goal.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}>
                          <GoalCard goal={goal} expanded={false} overdue={false} isCompleted onToggleExpand={() => {}} onEdit={() => openGoalEditor(goal)} onViewGoal={openGoalDetails} onToggleComplete={handleUncomplete} onDelete={handleDelete} onArchive={handleArchive} onToggleSubtask={handleToggleSubtask} />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                ) : <p className="goal-completed-empty">Отмеченные цели останутся здесь — их можно будет открыть или вернуть.</p>}
              </section>
            )}
          </div>
        )}
      </div>

      <button type="button" onClick={() => openGoalEditor()} className="goals-fab" aria-label="Добавить цель"><Plus size={22} /><span>Новая цель</span></button>

      {/* Goal editor sheet */}
      <BottomSheet open={showAddSheet} onClose={closeGoalEditor} title={editingGoalId ? "Редактировать цель" : "Новая цель"}>
        <div className="goals-editor-content px-5 py-4 space-y-4">
          <div>
            <label className="text-[12px] text-[#8A8A99] font-medium block mb-1.5">Название</label>
            <input
              ref={titleInputRef}
              className="w-full bg-[#F0F0EE] rounded-xl px-4 py-3 text-[#1A1A2E] text-[15px] outline-none placeholder:text-[#C0C0C0]"
              placeholder="Чего вы хотите достичь?"
              value={draft.title ?? ""}
              onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] text-[#8A8A99] font-medium block">Описание <span>(необязательно)</span></label>
            <textarea
              className="w-full bg-[#F0F0EE] rounded-xl px-4 py-3 text-[#1A1A2E] text-[14px] outline-none placeholder:text-[#C0C0C0] min-h-[84px] resize-none"
              placeholder="Добавьте детали или заметки"
              value={draft.description ?? ""}
              onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] text-[#8A8A99] font-medium block mb-1.5">Дедлайн</label>
              <input
                type="date"
                className="w-full bg-[#F0F0EE] rounded-xl px-3 py-2.5 text-[#1A1A2E] text-[13px] outline-none"
                value={draft.deadline ?? ""}
                onChange={e => setDraft(d => ({ ...d, deadline: e.target.value || null }))}
              />
            </div>
            <div>
              <label className="text-[12px] text-[#8A8A99] font-medium block mb-1.5">Группа</label>
              <select
                className="w-full bg-[#F0F0EE] rounded-xl px-3 py-2.5 text-[#1A1A2E] text-[13px] outline-none"
                value={draft.group ?? (group === "all" ? "today" : group)}
                onChange={e => setDraft(d => ({ ...d, group: e.target.value as GoalGroup }))}
              >
                {GOAL_SECTIONS.map(g => (
                  <option key={g} value={g}>{GROUP_LABELS[g]}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[12px] text-[#8A8A99] font-medium block mb-1.5">Приоритет</label>
            <div className="flex gap-2">
              {(["high", "medium", "low"] as Priority[]).map(p => (
                <button
                  key={p}
                  onClick={() => setDraft(d => ({ ...d, priority: p }))}
                  className={`flex-1 py-2 rounded-xl text-[12px] font-medium transition-all active:scale-95 border ${
                    draft.priority === p ? "border-transparent text-white" : "border-[#E8E8E6] text-[#8A8A99]"
                  }`}
                  style={draft.priority === p ? { background: `${PRIORITY_COLORS[p]}15`, color: PRIORITY_COLORS[p], borderColor: PRIORITY_COLORS[p] } : undefined}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: PRIORITY_COLORS[p] }} />
                    {PRIORITY_LABELS[p]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[12px] text-[#8A8A99] font-medium block mb-1.5">Повторение</label>
            <div className="goals-repeat-options flex gap-2">
              {(["none", "daily", "weekly"] as RecurringType[]).map(r => (
                <Pill key={r} active={draft.recurring === r} onClick={() => setDraft(d => ({ ...d, recurring: r }))}>
                  {r === "none" ? "Нет" : r === "daily" ? "Ежедневно" : "Еженедельно"}
                </Pill>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[12px] text-[#8A8A99] font-medium block mb-1.5">Подзадачи</label>
            <div className="space-y-2 mb-2">
              {(draft.subtasks ?? []).map(s => (
                <div key={s.id} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#C0C0C0] flex-shrink-0" />
                  <span className="text-[13px] text-[#1A1A2E] flex-1">{s.title}</span>
                  <button
                    onClick={() => setDraft(d => ({ ...d, subtasks: (d.subtasks ?? []).filter(x => x.id !== s.id) }))}
                    className="text-[#C0C0C0] p-1"
                  >
                    <IcoClose />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 bg-[#F0F0EE] rounded-xl px-3 py-2.5 text-[#1A1A2E] text-[13px] outline-none placeholder:text-[#C0C0C0]"
                placeholder="Добавить подзадачу"
                value={newSubtask}
                onChange={e => setNewSubtask(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addDraftSubtask(); }}
              />
              <button onClick={addDraftSubtask} className="w-10 h-10 rounded-xl bg-[#F0F0EE] flex items-center justify-center active:scale-95 transition-all">
                <IcoPlus />
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            {editingGoalId && (
              <button
                onClick={handleCompleteFromEditor}
                className="flex-1 py-3 rounded-xl bg-[#E8F5EE] text-[#2D7D46] font-medium active:scale-95 transition-all"
              >
                Выполнено
              </button>
            )}
            <button
              onClick={handleSaveGoal}
              disabled={!draft.title?.trim()}
              className={`py-3 rounded-xl font-medium active:scale-95 transition-all disabled:opacity-40 ${editingGoalId ? "flex-1" : "w-full"} bg-[#1A1A2E] text-white`}
            >
              {editingGoalId ? "Сохранить" : "Добавить"}
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* Completed goal details sheet */}
      <BottomSheet open={!!selectedGoalDetails} onClose={closeGoalDetails} title={selectedGoalDetails?.title ?? "Цель"}>
        {selectedGoalDetails && (
          <div className="px-5 py-4 space-y-4">
            <div className="rounded-2xl bg-[#F7F7F5] p-3.5 space-y-2">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[#8A8A99]">Описание</p>
              <p className="text-[13px] text-[#1A1A2E] leading-relaxed">
                {selectedGoalDetails.description?.trim() ? selectedGoalDetails.description : "Без описания"}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-[#F7F7F5] p-3">
                <p className="text-[11px] uppercase tracking-[0.24em] text-[#8A8A99]">Создана</p>
                <p className="text-[13px] font-medium text-[#1A1A2E] mt-1">{formatGoalDateTime(selectedGoalDetails.createdAt)}</p>
              </div>
              <div className="rounded-2xl bg-[#F7F7F5] p-3">
                <p className="text-[11px] uppercase tracking-[0.24em] text-[#8A8A99]">Завершена</p>
                <p className="text-[13px] font-medium text-[#1A1A2E] mt-1">{formatGoalDateTime(selectedGoalDetails.completedAt)}</p>
              </div>
            </div>

            {(selectedGoalDetails.priority !== "medium" || selectedGoalDetails.group !== "today" || selectedGoalDetails.recurring !== "none") && (
              <div className="rounded-2xl bg-[#F7F7F5] p-3.5">
                <p className="text-[11px] uppercase tracking-[0.24em] text-[#8A8A99] mb-2">Метки</p>
                <div className="flex flex-wrap gap-2">
                  {selectedGoalDetails.priority !== "medium" && (
                    <span className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: `${PRIORITY_COLORS[selectedGoalDetails.priority]}15`, color: PRIORITY_COLORS[selectedGoalDetails.priority] }}>
                      {PRIORITY_LABELS[selectedGoalDetails.priority]}
                    </span>
                  )}
                  {selectedGoalDetails.group !== "today" && (
                    <span className="rounded-full px-2.5 py-1 text-[11px] font-medium bg-[#F0F0EE] text-[#8A8A99]">
                      {GROUP_LABELS[selectedGoalDetails.group]}
                    </span>
                  )}
                  {selectedGoalDetails.recurring !== "none" && (
                    <span className="rounded-full px-2.5 py-1 text-[11px] font-medium bg-[#F0F0EE] text-[#8A8A99]">
                      {selectedGoalDetails.recurring === "daily" ? "Каждый день" : "Каждую неделю"}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="rounded-2xl bg-[#F7F7F5] p-3.5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] uppercase tracking-[0.24em] text-[#8A8A99]">Подзадачи</p>
                <span className="text-[11px] text-[#8A8A99]">{selectedGoalDetails.subtasks.filter(s => s.done).length}/{selectedGoalDetails.subtasks.length}</span>
              </div>
              {selectedGoalDetails.subtasks.length > 0 ? (
                <div className="space-y-2">
                  {selectedGoalDetails.subtasks.map(s => (
                    <div key={s.id} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2">
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${s.done ? "border-[#2D7D46] bg-[#E8F5EE]" : "border-[#D0D0D0] bg-white"}`}>
                        {s.done && <IcoCheck size={10} strokeWidth={2.4} className="text-[#2D7D46]" />}
                      </div>
                      <span className={`text-[13px] ${s.done ? "text-[#2D7D46] line-through" : "text-[#1A1A2E]"}`}>{s.title}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-[#8A8A99]">Подзадач нет</p>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { handleUncomplete(selectedGoalDetails.id); closeGoalDetails(); }}
                className="flex-1 py-3 rounded-xl bg-[#E8F5EE] text-[#2D7D46] font-medium active:scale-95 transition-all"
              >
                Вернуть
              </button>
              <button
                onClick={() => { handleDelete(selectedGoalDetails.id); closeGoalDetails(); }}
                className="flex-1 py-3 rounded-xl bg-[#FDE8E8] text-[#D94040] font-medium active:scale-95 transition-all"
              >
                Удалить
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* Archive sheet */}
      <BottomSheet open={showArchive} onClose={() => setShowArchive(false)} title="Архив">
        <div className="px-5 py-4">
          {archivedGoals.length === 0 ? (
            <EmptyState text="Архив пуст" />
          ) : (
            <div className="space-y-2">
              {archivedGoals.map(g => (
                <div key={g.id} className="flex items-center gap-3 py-2 border-b border-[#F0F0EE]">
                  <p className="text-[13px] text-[#8A8A99] flex-1">{g.title}</p>
                  {g.completedAt && (
                    <span className="text-[11px] text-[#C0C0C0]">
                      {new Date(g.completedAt).toLocaleDateString("ru")}
                    </span>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => setData(prev => ({ ...prev, goals: prev.goals.map(goal => goal.id === g.id ? { ...goal, archived: false, archivedAt: null, archivedSource: null } : goal) }))} className="px-2 py-1 rounded-lg bg-[#E8F5EE] text-[#2D7D46] text-[11px]">Вернуть</button>
                    <button onClick={() => handleDelete(g.id)} className="px-2 py-1 rounded-lg bg-[#FDE8E8] text-[#D94040] text-[11px]">Удалить</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}

function SubtaskSwipe({
  goalId,
  subtask,
  accentColor,
  onToggleSubtask,
}: {
  goalId: string;
  subtask: SubTask;
  accentColor: string;
  onToggleSubtask: (goalId: string, subId: string) => void;
}) {
  const [sliderValue, setSliderValue] = useState<number[]>([0]);
  const [isSliding, setIsSliding] = useState(false);
  const sliderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintTimer = useRef<number | null>(null);
  const animationRef = useRef<number | null>(null);

  const animateSliderReset = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    const startTime = Date.now();
    const duration = 300;
    const startValue = sliderValue[0];

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const currentValue = startValue + (0 - startValue) * easeProgress;

      setSliderValue([Math.round(currentValue)]);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  };

  const handleSliderChange = (value: number[]) => {
    setSliderValue(value);

    if (value[0] === 100) {
      // complete
      setIsSliding(false);
      if (hintTimer.current) {
        window.clearTimeout(hintTimer.current);
        hintTimer.current = null;
      }
      onToggleSubtask(goalId, subtask.id);
      animateSliderReset();
    }
  };

  const handleSliderPointerUp = () => {
    // show hint with delay if not completed
    if (sliderValue[0] < 100 && sliderValue[0] > 0) {
      sliderTimer.current = window.setTimeout(() => {
        animateSliderReset();
      }, 200);
      // re-show hint after short delay
      if (hintTimer.current) window.clearTimeout(hintTimer.current);
      hintTimer.current = window.setTimeout(() => {
        setIsSliding(false);
        hintTimer.current = null;
      }, 600);
    } else {
      setIsSliding(false);
    }
  };

  const handleSliderPointerDown = () => {
    if (hintTimer.current) {
      window.clearTimeout(hintTimer.current);
      hintTimer.current = null;
    }
    setIsSliding(true);
    if (sliderTimer.current) {
      clearTimeout(sliderTimer.current);
      sliderTimer.current = null;
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  };

  useEffect(() => {
    return () => {
      if (sliderTimer.current) {
        clearTimeout(sliderTimer.current);
      }
      if (hintTimer.current) {
        window.clearTimeout(hintTimer.current);
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <div className="mt-2 relative" onClick={e => e.stopPropagation()}>
      <Slider
        value={sliderValue}
        onValueChange={handleSliderChange}
        onPointerDown={handleSliderPointerDown}
        onPointerUp={handleSliderPointerUp}
        onTouchEnd={handleSliderPointerUp}
        min={0}
        max={100}
        step={1}
        className="w-full cursor-grab active:cursor-grabbing"
        style={{
          "--slider-range-color": accentColor,
          height: "24px",
          "--slider-track-height": "36px",
          "--slider-thumb-size": "36px",
        } as React.CSSProperties}
        hint={(
          <span
            className="pointer-events-none text-[10px] transition-opacity duration-400 ease-in-out"
            style={{ opacity: isSliding ? 0 : 1, color: '#8A8A99' }}
          >
            Свайпните для завершения
          </span>
        )}
      />
      
    </div>
  );
}

function LegacyGoalCard({
  goal, expanded, overdue, isCompleted, onToggleExpand, onEdit, onViewGoal, onToggleComplete, onComplete, onDelete, onArchive, onToggleSubtask,
}: {
  goal: Goal;
  expanded: boolean;
  overdue?: boolean;
  isCompleted: boolean;
  onToggleExpand: () => void;
  onEdit: (goal: Goal) => void;
  onViewGoal: (goal: Goal) => void;
  onToggleComplete: (id: string) => void;
  onComplete: (id: string) => void;
  onDelete: (id: string, mode?: "single" | "series") => void;
  onArchive: (id: string) => void;
  onToggleSubtask: (goalId: string, subId: string) => void;
}) {
  const [sliderValue, setSliderValue] = useState<number[]>([0]);
  const [completePulse, setCompletePulse] = useState(false);
  const [isSliding, setIsSliding] = useState(false);
  const [deleteMenuOpen, setDeleteMenuOpen] = useState(false);
  const hintTimer = useRef<number | null>(null);
  const sliderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completeTimer = useRef<number | null>(null);
  const animationRef = useRef<number | null>(null);

  const progress = calcGoalProgress(goal);
  const sliderColor = PRIORITY_COLORS.high;
  const accentColor = overdue ? "#D94040" : sliderColor;
  // Force slider color to gel-pen blue for swipe/complete visuals

  const handleSliderChange = (value: number[]) => {
    setSliderValue(value);

    if (value[0] === 100) {
      setIsSliding(false);
      setCompletePulse(true);
      if (completeTimer.current) {
        window.clearTimeout(completeTimer.current);
      }
      completeTimer.current = window.setTimeout(() => {
        setCompletePulse(false);
      }, 600);
      onComplete(goal.id);
      // Animate back to 0
      animateSliderReset();
    }
  };

  const animateSliderReset = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    
    const startTime = Date.now();
    const duration = 400; // 400ms плавная анимация
    const startValue = sliderValue[0];
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease-out cubic для красивой анимации
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const currentValue = startValue + (0 - startValue) * easeProgress;
      
      setSliderValue([Math.round(currentValue)]);
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };
    
    animationRef.current = requestAnimationFrame(animate);
  };

  const handleSliderPointerUp = () => {
    // show hint with delay if not completed
    if (hintTimer.current) {
      window.clearTimeout(hintTimer.current);
    }
    if (sliderValue[0] < 100 && sliderValue[0] > 0) {
      hintTimer.current = window.setTimeout(() => {
        setIsSliding(false);
        hintTimer.current = null;
      }, 600);
    } else {
      setIsSliding(false);
    }
    // Reset slider if not at 100% with animation
    if (sliderValue[0] < 100 && sliderValue[0] > 0) {
      sliderTimer.current = window.setTimeout(() => {
        animateSliderReset();
      }, 200);
    }
  };

  const handleSliderPointerDown = () => {
    if (hintTimer.current) {
      window.clearTimeout(hintTimer.current);
      hintTimer.current = null;
    }
    setIsSliding(true);
    if (sliderTimer.current) {
      clearTimeout(sliderTimer.current);
      sliderTimer.current = null;
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  };

  useEffect(() => {
    return () => {
      if (sliderTimer.current) {
        clearTimeout(sliderTimer.current);
      }
      if (completeTimer.current) {
        window.clearTimeout(completeTimer.current);
      }
      if (hintTimer.current) {
        window.clearTimeout(hintTimer.current);
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <div
      className={`relative rounded-2xl overflow-hidden notebook-grid border ${isCompleted ? "completed-task-card text-white" : "text-[#1A1A2E]"}`}
      style={{
        backgroundColor: isCompleted ? "#549AF2" : overdue ? "#FFF4F4" : "#F7F7F5",
        boxShadow: isCompleted
          ? (overdue ? "0 2px 10px rgba(217,64,64,0.08)" : "0 2px 8px rgba(0,0,0,0.04)")
          : `${overdue ? "0 2px 10px rgba(217,64,64,0.08)" : "0 2px 8px rgba(0,0,0,0.04)"}, inset 0 0 0 1px #549AF2`,
        borderColor: isCompleted ? "#549AF2" : overdue ? "rgba(217, 64, 64, 0.18)" : "#E5E7EB",
        transform: isCompleted ? "scale(1.03)" : undefined,
        paddingBottom: isCompleted ? 6 : undefined,
      }}
    >
      {isCompleted && (
        <div className="absolute right-3 bottom-3 pointer-events-none">
          <span className="text-[12px] font-semibold uppercase tracking-[0.24em] text-white leading-none">
            Выполнено
          </span>
        </div>
      )}
      <div className="relative z-10">
        <div className="px-4 py-3.5 cursor-pointer" onClick={() => (isCompleted ? onViewGoal(goal) : onEdit(goal))}>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="inline-flex items-center gap-3 rounded-full px-3 py-1 task-badge min-w-0 max-w-full" style={{ backgroundColor: isCompleted ? "rgba(255,255,255,0.18)" : "#549AF2" }}>
                    <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${isCompleted ? "border-white bg-white/15" : "border-white bg-white"}`}>
                      {isCompleted ? <IcoCheck size={15} strokeWidth={3.2} className="text-white opacity-95" /> : null}
                    </div>
                    <p className={`flex-1 min-w-0 truncate text-[14px] font-medium leading-snug transition-all ${isCompleted ? "text-white" : "text-white"}`}>{goal.title}</p>
                  </div>
                  {goal.description?.trim() && (
                    <div className={`mt-2 rounded-2xl border px-2.5 py-2 ${isCompleted ? "border-white/20 bg-white/10" : "border-[#E8E8E6] bg-[#FBFBFA]"}`}>
                      <div className={`mb-1 flex items-center gap-2 ${isCompleted ? "text-white/80" : "text-[#8A8A99]"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${isCompleted ? "bg-white/80" : "bg-[#549AF2]"}`} />
                        <span className="text-[10px] font-semibold uppercase tracking-[0.2em]">Описание</span>
                      </div>
                      <p className={`text-[12px] leading-relaxed break-words ${isCompleted ? "!text-white" : "text-[#4B5563]"}`}>{goal.description}</p>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    {!isCompleted && (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] shadow-sm"
                        style={{
                          backgroundColor: `${accentColor}14`,
                          color: accentColor,
                          borderColor: `${accentColor}30`,
                          boxShadow: `0 1px 2px ${accentColor}12`,
                        }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: accentColor }} />
                        {overdue ? "Просрочено" : PRIORITY_LABELS[goal.priority]}
                      </span>
                    )}
                    {goal.deadline && (
                      <span className={`text-[11px] ${isCompleted ? "text-white/80" : "text-[#8A8A99]"}`}>
                        до {new Date(goal.deadline).toLocaleDateString("ru", { day: "numeric", month: "short" })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isCompleted && (
                    <button
                      onPointerDown={e => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); onToggleComplete(goal.id); }}
                      className={`p-1.5 rounded-lg active:scale-95 transition-all ${isCompleted ? "bg-white/15 text-white" : "text-[#8A8A99] bg-[#F0F0EE]"}`}
                      title="Вернуть задачу"
                    >
                      <IcoUndo />
                    </button>
                  )}
                  <button
                    onPointerDown={e => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onArchive(goal.id); }}
                    className={`p-1.5 rounded-lg active:scale-95 transition-all ${isCompleted ? "bg-white/15 text-white" : "text-[#8A8A99] bg-[#F0F0EE]"}`}
                  >
                    <IcoArchive />
                  </button>
                  {goal.recurring === "daily" || goal.recurring === "weekly" ? (
                    <div className="relative">
                      <button
                        onPointerDown={e => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); setDeleteMenuOpen(v => !v); }}
                        className={`p-1.5 rounded-lg active:scale-95 transition-all ${isCompleted ? "bg-white/15 text-white" : "text-[#D94040] bg-[#FDE8E8]"}`}
                      >
                        <IcoTrash />
                      </button>
                      {deleteMenuOpen && (
                        <div className="absolute right-0 top-10 z-[999] w-40 rounded-xl border border-[#E5E7EB] bg-white p-1.5 shadow-2xl">
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteMenuOpen(false); onDelete(goal.id, "single"); }}
                            className="w-full rounded-lg px-2 py-2 text-left text-[12px] text-[#1A1A2E] hover:bg-[#F7F7F5]"
                          >
                            Только эту
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteMenuOpen(false); onDelete(goal.id, "series"); }}
                            className="w-full rounded-lg px-2 py-2 text-left text-[12px] text-[#1A1A2E] hover:bg-[#F7F7F5]"
                          >
                            Все последующие
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      onPointerDown={e => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); onDelete(goal.id); }}
                      className={`p-1.5 rounded-lg active:scale-95 transition-all ${isCompleted ? "bg-white/15 text-white" : "text-[#D94040] bg-[#FDE8E8]"}`}
                    >
                      <IcoTrash />
                    </button>
                  )}
                </div>
              </div>
              {goal.subtasks.length > 0 && (
                <div className="mt-2.5">
                  <ProgressBar value={progress} max={100} height={3} color={isCompleted ? "#fff" : undefined} />
                  <p className={`text-[11px] mt-1 ${isCompleted ? "text-white/80" : "text-[#8A8A99]"}`}>{goal.subtasks.filter(s => s.done).length} из {goal.subtasks.length}</p>
                  <div className="mt-2 space-y-2">
                    {goal.subtasks.map(s => (
                      <div
                        key={s.id}
                        className={`rounded-2xl border p-3 shadow-sm ${isCompleted ? "border-white/20" : "border-white/60"}`}
                        style={{
                          background: isCompleted ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.28)",
                          backdropFilter: "blur(14px)",
                          WebkitBackdropFilter: "blur(14px)",
                          boxShadow: isCompleted
                            ? "inset 0 0 0 1px rgba(255,255,255,0.16), inset 0 1px 0 rgba(255,255,255,0.16)"
                            : "inset 0 0 0 1px #549AF2, inset 0 1px 0 rgba(255,255,255,0.38)",
                        }}
                      >
                        <button
                          onPointerDown={e => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); onToggleSubtask(goal.id, s.id); }}
                          className="relative w-full text-center active:scale-[0.99] transition-all"
                        >
                          <div className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border flex items-center justify-center ${s.done ? (isCompleted ? "border-white" : "border-[#1A1A2E]") : (isCompleted ? "border-white/60" : "border-[#D0D0D0]")}`}>
                            {s.done && <IcoCheck size={10} strokeWidth={2.4} className={isCompleted ? "text-white opacity-95" : "text-[#1A1A2E]"} />}
                          </div>
                          <span className={`block w-full truncate text-[13px] ${isCompleted ? "!text-white" : "text-[#1A1A2E]"} ${s.done ? "line-through opacity-80" : ""}`}>{s.title}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-4 pb-3 pt-1" onClick={e => e.stopPropagation()}>
          <div
            className={`mb-1.5 relative overflow-hidden transition-[max-height,opacity] duration-300 ${isCompleted ? "max-h-0 opacity-0" : "max-h-32 opacity-100"}`}
            style={{
              transform: completePulse ? "scale(1.01)" : "scale(1)",
            }}
          >
            <div
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                background: completePulse ? hexToRgba(sliderColor, 0.06) : "transparent",
                transition: "background 220ms ease",
              }}
            />
            <Slider
              value={sliderValue}
              onValueChange={handleSliderChange}
              onPointerDown={handleSliderPointerDown}
              onPointerUp={handleSliderPointerUp}
              onTouchEnd={handleSliderPointerUp}
              min={0}
              max={100}
              step={1}
              className="w-full cursor-grab active:cursor-grabbing"
              allowTrackClick={false}
              style={{
                "--slider-range-color": sliderColor,
              } as React.CSSProperties}
              hint={(
                <span
                  className="pointer-events-none text-[11px] shimmer-letters transition-opacity duration-400 ease-in-out"
                  style={{ opacity: isSliding ? 0 : 1 }}
                >
                  {renderShimmerText("Свайпните для завершения")}
                </span>
              )}
            />
            {completePulse && (
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-full h-8 w-8 grid place-items-center text-white shadow-lg animate-pulse"
                style={{ background: sliderColor, boxShadow: `0 0 0 10px ${hexToRgba(sliderColor, 0.12)}` }}>
                <IcoCheck size={14} className="text-white" />
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function GoalCard({
  goal, expanded, overdue, isCompleted, onToggleExpand, onEdit, onViewGoal, onToggleComplete, onDelete, onArchive, onToggleSubtask,
}: {
  goal: Goal;
  expanded: boolean;
  overdue?: boolean;
  isCompleted: boolean;
  onToggleExpand: () => void;
  onEdit: (goal: Goal) => void;
  onViewGoal: (goal: Goal) => void;
  onToggleComplete: (id: string) => void;
  onDelete: (id: string, mode?: "single" | "series") => void;
  onArchive: (id: string) => void;
  onToggleSubtask: (goalId: string, subId: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const completedSubtasks = goal.subtasks.filter(subtask => subtask.done).length;
  const progress = goal.subtasks.length ? Math.round(completedSubtasks / goal.subtasks.length * 100) : 0;
  const priorityColor = overdue ? "#D76969" : PRIORITY_COLORS[goal.priority];
  const dueLabel = goal.deadline ? formatGoalDate(goal.deadline) : null;
  const completedTimestamp = goal.completedAt ? new Date(goal.completedAt) : null;
  const completedDateLabel = completedTimestamp && !Number.isNaN(completedTimestamp.getTime()) ? formatGoalDate(getDateKey(completedTimestamp)) : null;
  const recurrenceLabel = goal.recurring === "daily" ? "Каждый день" : goal.recurring === "weekly" ? "Каждую неделю" : null;
  const hasDetails = Boolean(goal.description?.trim() || goal.subtasks.length > 0);

  return (
    <article className={`goal-card ${isCompleted ? "is-completed" : ""} ${overdue ? "is-overdue" : ""}`}>
      <div className="goal-card-main">
        <button
          type="button"
          className={`goal-complete-button ${isCompleted ? "is-checked" : ""}`}
          aria-label={isCompleted ? `Вернуть цель: ${goal.title}` : `Завершить цель: ${goal.title}`}
          onClick={() => onToggleComplete(goal.id)}
        >
          <span className="goal-complete-indicator">{isCompleted && <Check size={12} strokeWidth={2.8} />}</span>
          <span className="goal-complete-label">{isCompleted ? "Вернуть" : "Выполнить"}</span>
        </button>

        <div className="goal-card-body">
          <div className="goal-card-title-row">
            <button type="button" className="goal-card-title-button" aria-expanded={expanded} onClick={() => isCompleted ? onViewGoal(goal) : onToggleExpand()}>
              <span className={`goal-card-title ${isCompleted ? "is-crossed" : ""}`}>{goal.title}</span>
              {(hasDetails || isCompleted) && <ChevronDown size={15} className={`goal-card-disclosure ${expanded ? "is-open" : ""}`} />}
            </button>
            <div className="goal-card-actions">
              {!isCompleted && <button type="button" className="goal-action-button goal-edit-action" aria-label={`Редактировать цель: ${goal.title}`} onClick={() => onEdit(goal)}><Pencil size={14} /><span>Изменить</span></button>}
              <button type="button" className="goal-action-button goal-more-action" aria-label={`Ещё действия с целью: ${goal.title}`} title="Ещё действия" aria-expanded={menuOpen} onClick={() => { setMenuOpen(value => !value); setDeleteConfirm(false); }}><MoreHorizontal size={17} /></button>
              {menuOpen && (
                <div className="goal-card-menu" role="menu">
                  {!isCompleted && <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onEdit(goal); }}><Pencil size={14} />Редактировать</button>}
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onArchive(goal.id); }}><IcoArchive />Переместить в архив</button>
                  <button type="button" role="menuitem" className="is-danger" onClick={() => { setMenuOpen(false); setDeleteConfirm(true); }}><Trash2 size={14} />Удалить цель</button>
                </div>
              )}
            </div>
          </div>

          <div className="goal-card-meta">
            <span className={`goal-status-chip ${isCompleted ? "is-completed" : overdue ? "is-overdue" : ""}`}>
              <i />{isCompleted ? "Выполнена" : overdue ? "Просрочена" : "В работе"}
            </span>
            <span className="goal-priority-chip" style={{ "--goal-priority": priorityColor } as React.CSSProperties}><i />{PRIORITY_LABELS[goal.priority]} приоритет</span>
            <span className="goal-group-chip">{GROUP_LABELS[goal.group]}</span>
            {dueLabel && <span className={`goal-meta-detail ${overdue && !isCompleted ? "is-overdue" : ""}`}><CalendarDays size={13} />До {dueLabel}</span>}
            {recurrenceLabel && <span className="goal-meta-detail"><Clock3 size={13} />{recurrenceLabel}</span>}
            {isCompleted && completedDateLabel && <span className="goal-meta-detail goal-completed-date"><Check size={13} />{completedDateLabel}</span>}
          </div>
        </div>
      </div>

      {goal.subtasks.length > 0 && (
        <div className="goal-card-progress">
          <div className="goal-progress-heading"><span>Шаги к цели</span><b>{completedSubtasks} из {goal.subtasks.length}</b></div>
          <div className="goal-progress-track"><i style={{ width: `${progress}%` }} /></div>
        </div>
      )}

      {expanded && !isCompleted && (
        <div className="goal-card-details">
          {goal.description?.trim() && <p className="goal-description">{goal.description}</p>}
          {goal.subtasks.length > 0 ? (
            <div className="goal-subtask-list">
              {goal.subtasks.map(subtask => (
                <button key={subtask.id} type="button" className={`goal-subtask-row ${subtask.done ? "is-done" : ""}`} aria-pressed={subtask.done} aria-label={`${subtask.done ? "Снять отметку" : "Отметить"}: ${subtask.title}`} onClick={() => onToggleSubtask(goal.id, subtask.id)}>
                  <span className="goal-subtask-check">{subtask.done && <Check size={13} strokeWidth={2.8} />}</span><span>{subtask.title}</span>
                </button>
              ))}
            </div>
          ) : <p className="goal-no-subtasks">Разбей цель на небольшие шаги, чтобы проще было начать.</p>}
          {!hasDetails && <button type="button" className="goal-inline-edit" onClick={() => onEdit(goal)}>Добавить описание или шаги <Pencil size={13} /></button>}
        </div>
      )}

      {deleteConfirm && (
        <div className="goal-delete-confirm" role="group" aria-label={`Подтверждение удаления: ${goal.title}`}>
          <div><b>Удалить цель?</b><span>Это действие нельзя отменить.</span></div>
          <button type="button" className="goal-cancel-delete" onClick={() => setDeleteConfirm(false)}>Отмена</button>
          {goal.recurring !== "none" && goal.recurrenceSeriesId ? (
            <>
              <button type="button" className="goal-confirm-delete" onClick={() => onDelete(goal.id, "single")}>Только эту</button>
              <button type="button" className="goal-confirm-delete is-series" onClick={() => onDelete(goal.id, "series")}>Все последующие</button>
            </>
          ) : <button type="button" className="goal-confirm-delete" onClick={() => onDelete(goal.id)}>Удалить</button>}
        </div>
      )}
    </article>
  );
}

// ═══════════════════════════════════════════════════
// NUTRITION TAB
// ═══════════════════════════════════════════════════

function NutritionTab({ data, setData }: { data: AppData; setData: (fn: (p: AppData) => AppData) => void }) {
  const [subTab, setSubTab] = useState<"diary" | "journal">("diary");
  const todayKey = getDateKey();
  const todayDiary = data.foodDiary[todayKey] ?? EMPTY_DIARY;
  const todayWater = data.water[todayKey] ?? 0;

  const allFoods = [...todayDiary.breakfast, ...todayDiary.lunch, ...todayDiary.dinner, ...todayDiary.snack];
  const totals = {
    kcal: allFoods.reduce((a, f) => a + Math.round(f.calories * f.portion / 100), 0),
    protein: allFoods.reduce((a, f) => a + Math.round(f.protein * f.portion / 100), 0),
    fat: allFoods.reduce((a, f) => a + Math.round(f.fat * f.portion / 100), 0),
    carbs: allFoods.reduce((a, f) => a + Math.round(f.carbs * f.portion / 100), 0),
  };

  const setWater = (n: number) => {
    setData(prev => ({ ...prev, water: { ...prev.water, [todayKey]: n } }));
  };

  const addFoodToDiary = (meal: MealType, item: FoodItem) => {
    setData(prev => {
      const diary = prev.foodDiary[todayKey] ?? { ...EMPTY_DIARY };
      return {
        ...prev,
        foodDiary: {
          ...prev.foodDiary,
          [todayKey]: { ...diary, [meal]: [...diary[meal], item] },
        },
      };
    });
  };

  const removeFoodFromDiary = (meal: MealType, id: string) => {
    setData(prev => {
      const diary = prev.foodDiary[todayKey] ?? { ...EMPTY_DIARY };
      return {
        ...prev,
        foodDiary: {
          ...prev.foodDiary,
          [todayKey]: { ...diary, [meal]: diary[meal].filter(f => f.id !== id) },
        },
      };
    });
  };

  return (
    <div className="app-page pt-14 pb-6">
      {/* Header */}
      <div className="px-4 mb-4">
        <h1 className="text-xl font-semibold text-[#1A1A2E] mb-4">Питание и дневник</h1>
        <div className="flex bg-[#F0F0EE] rounded-xl p-0.5">
          {([["diary", "Питание"], ["journal", "Дневник"]] as [string, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSubTab(id as "diary" | "journal")}
              className={`flex-1 py-2 rounded-[10px] text-[13px] font-medium transition-all ${subTab === id ? "bg-white text-[#1A1A2E] shadow-sm" : "text-[#8A8A99]"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {subTab === "diary" && (
        <DiarySubTab
          todayDiary={todayDiary}
          todayWater={todayWater}
          totals={totals}
          settings={data.settings}
          myMenu={data.myMenu}
          setData={setData}
          addFood={addFoodToDiary}
          removeFood={removeFoodFromDiary}
          setWater={setWater}
        />
      )}
      {subTab === "journal" && (
        <JournalSubTab
          data={data}
          setData={setData}
        />
      )}
    </div>
  );
}

function DiarySubTab({
  todayDiary, todayWater, totals, settings, myMenu, setData, addFood, removeFood, setWater,
}: {
  todayDiary: DailyDiary;
  todayWater: number;
  totals: { kcal: number; protein: number; fat: number; carbs: number };
  settings: Settings;
  myMenu: MyMenuItem[];
  setData: (fn: (p: AppData) => AppData) => void;
  addFood: (meal: MealType, item: FoodItem) => void;
  removeFood: (meal: MealType, id: string) => void;
  setWater: (n: number) => void;
}) {
  const [searchSheet, setSearchSheet] = useState<MealType | null>(null);
  const [showMyMenuSheet, setShowMyMenuSheet] = useState(false);
  const [addMenuSheet, setAddMenuSheet] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Omit<FoodItem, "id" | "portion">[]>([]);
  const [searching, setSearching] = useState(false);
  const [portion, setPortion] = useState("100");
  const [selectedResult, setSelectedResult] = useState<Omit<FoodItem, "id" | "portion"> | null>(null);
  const [menuDraft, setMenuDraft] = useState<Partial<MyMenuItem>>({ type: "breakfast", tags: [] });
  const [searchError, setSearchError] = useState("");

  const doSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError("");
    try {
      const res = await fetch(
        `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(searchQuery)}&json=1&page_size=10&fields=product_name,nutriments&search_simple=1`
      );
      const json = await res.json();
      const products: Array<{ product_name?: string; nutriments?: Record<string, number> }> = json.products ?? [];
      const results = products
        .filter(p => p.product_name)
        .map(p => ({
          name: p.product_name ?? "",
          calories: Math.round(p.nutriments?.["energy-kcal_100g"] ?? 0),
          protein: Math.round(p.nutriments?.proteins_100g ?? 0),
          fat: Math.round(p.nutriments?.fat_100g ?? 0),
          carbs: Math.round(p.nutriments?.carbohydrates_100g ?? 0),
        }));
      setSearchResults(results);
      if (results.length === 0) setSearchError("Ничего не найдено");
    } catch {
      setSearchError("Ошибка поиска. Проверьте подключение.");
    }
    setSearching(false);
  };

  const addFromSearch = () => {
    if (!selectedResult || !searchSheet) return;
    const p = parseFloat(portion);
    if (isNaN(p) || p <= 0) return;
    addFood(searchSheet, { ...selectedResult, id: uid(), portion: p });
    setSearchSheet(null);
    setSearchQuery("");
    setSearchResults([]);
    setSelectedResult(null);
    setPortion("100");
  };

  const saveMenuItem = () => {
    if (!menuDraft.name?.trim() || !menuDraft.calories) return;
    const item: MyMenuItem = {
      id: uid(),
      name: menuDraft.name.trim(),
      type: menuDraft.type ?? "breakfast",
      calories: menuDraft.calories ?? 0,
      protein: menuDraft.protein ?? 0,
      fat: menuDraft.fat ?? 0,
      carbs: menuDraft.carbs ?? 0,
      tags: menuDraft.tags ?? [],
    };
    setData(prev => ({ ...prev, myMenu: [...prev.myMenu, item] }));
    setMenuDraft({ type: "breakfast", tags: [] });
    setAddMenuSheet(false);
  };

  const addFromMenu = (item: MyMenuItem, meal: MealType) => {
    addFood(meal, {
      id: uid(),
      name: item.name,
      calories: item.calories,
      protein: item.protein,
      fat: item.fat,
      carbs: item.carbs,
      portion: 100,
    });
  };

  return (
    <div className="px-4 space-y-4">
      {/* Macros summary */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <SectionLabel>Сегодня</SectionLabel>
          <span className="text-[13px] font-semibold text-[#1A1A2E]">{totals.kcal} / {settings.calorieGoal} ккал</span>
        </div>
        <ProgressBar value={totals.kcal} max={settings.calorieGoal} />
        <div className="grid grid-cols-3 gap-2 mt-3">
          {[
            { label: "Б", val: totals.protein, goal: settings.proteinGoal, color: "#4A90E2" },
            { label: "Ж", val: totals.fat, goal: settings.fatGoal, color: "#E2944A" },
            { label: "У", val: totals.carbs, goal: settings.carbsGoal, color: "#4AE2A0" },
          ].map(m => (
            <div key={m.label} className="bg-white rounded-xl p-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] text-[#8A8A99]">{m.label}</span>
                <span className="text-[11px] font-medium text-[#1A1A2E]">{m.val}г</span>
              </div>
              <ProgressBar value={m.val} max={m.goal} color={m.color} height={3} />
            </div>
          ))}
        </div>
      </Card>

      {/* Water */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <SectionLabel>Вода</SectionLabel>
          <span className="text-[12px] text-[#8A8A99]">{todayWater} / {settings.waterGoal} стаканов</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {Array.from({ length: settings.waterGoal }, (_, i) => (
            <button
              key={i}
              onClick={() => setWater(i < todayWater ? i : i + 1)}
              className={`transition-all active:scale-90 ${i < todayWater ? "text-[#4A90E2]" : "text-[#C0C0C0]"}`}
            >
              <IcoDrop filled={i < todayWater} />
            </button>
          ))}
        </div>
      </Card>

      {/* My menu quick access */}
      {myMenu.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <SectionLabel>Моё меню</SectionLabel>
            <button onClick={() => setShowMyMenuSheet(true)} className="text-[12px] text-[#1A1A2E] font-medium">
              Все блюда
            </button>
          </div>
        </div>
      )}

      {/* Meal sections */}
      {MEAL_ORDER.map(meal => {
        const items = todayDiary[meal];
        return (
          <div key={meal}>
            <div className="flex items-center justify-between mb-2">
              <SectionLabel>{MEAL_LABELS[meal]}</SectionLabel>
              <div className="flex gap-2">
                {myMenu.filter(m => m.type === meal).slice(0, 2).map(m => (
                  <button
                    key={m.id}
                    onClick={() => addFromMenu(m, meal)}
                    className="text-[11px] px-2 py-1 bg-[#F0F0EE] rounded-lg text-[#1A1A2E] active:scale-95 transition-all"
                  >
                    {m.name}
                  </button>
                ))}
                <button
                  onClick={() => { setSearchSheet(meal); setSearchQuery(""); setSearchResults([]); setSelectedResult(null); }}
                  className="w-7 h-7 rounded-lg bg-[#F0F0EE] flex items-center justify-center text-[#1A1A2E] active:scale-95 transition-all"
                >
                  <IcoPlus size={14} />
                </button>
              </div>
            </div>
            {items.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {items.map(f => (
                  <div key={f.id} className="flex items-center gap-3 px-3 py-2.5 bg-[#F7F7F5] rounded-xl">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-[#1A1A2E] truncate">{f.name}</p>
                      <p className="text-[11px] text-[#8A8A99]">{f.portion}г · {Math.round(f.calories * f.portion / 100)} ккал</p>
                    </div>
                    <button onClick={() => removeFood(meal, f.id)} className="text-[#C0C0C0] p-1 active:scale-95 transition-all">
                      <IcoClose />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <button
        onClick={() => setAddMenuSheet(true)}
        className="w-full py-3 border border-dashed border-[#D0D0D0] rounded-xl text-[13px] text-[#8A8A99] flex items-center justify-center gap-2 active:scale-[0.99] transition-all"
      >
        <IcoPlus size={16} />
        Добавить блюдо в моё меню
      </button>

      {/* Food search sheet */}
      <BottomSheet open={!!searchSheet} onClose={() => setSearchSheet(null)} title={`Добавить — ${searchSheet ? MEAL_LABELS[searchSheet] : ""}`}>
        <div className="px-5 py-4">
          <div className="flex gap-2 mb-4">
            <div className="flex-1 bg-[#F0F0EE] rounded-xl flex items-center gap-2 px-3">
              <IcoSearch />
              <input
                className="flex-1 py-2.5 bg-transparent text-[#1A1A2E] text-[14px] outline-none placeholder:text-[#C0C0C0]"
                placeholder="Поиск продукта…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") doSearch(); }}
              />
            </div>
            <button
              onClick={doSearch}
              className="px-4 py-2.5 bg-[#1A1A2E] text-white rounded-xl text-[13px] font-medium active:scale-95 transition-all"
            >
              {searching ? "…" : "Найти"}
            </button>
          </div>

          {searchError && <p className="text-sm text-[#D94040] mb-3">{searchError}</p>}

          {searchResults.length > 0 && !selectedResult && (
            <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
              {searchResults.map((r, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedResult(r)}
                  className="w-full text-left px-3 py-3 bg-[#F7F7F5] rounded-xl active:scale-[0.99] transition-all"
                >
                  <p className="text-[13px] text-[#1A1A2E] font-medium mb-0.5">{r.name}</p>
                  <p className="text-[11px] text-[#8A8A99]">{r.calories} ккал · Б{r.protein} Ж{r.fat} У{r.carbs} (на 100г)</p>
                </button>
              ))}
            </div>
          )}

          {selectedResult && (
            <div className="bg-[#F7F7F5] rounded-xl p-4 mb-4">
              <div className="flex items-start justify-between mb-3">
                <p className="text-[14px] font-medium text-[#1A1A2E]">{selectedResult.name}</p>
                <button onClick={() => setSelectedResult(null)} className="text-[#C0C0C0] p-1">
                  <IcoClose />
                </button>
              </div>
              <p className="text-[12px] text-[#8A8A99] mb-3">
                {selectedResult.calories} ккал · Б{selectedResult.protein} Ж{selectedResult.fat} У{selectedResult.carbs} (100г)
              </p>
              <label className="text-[12px] text-[#8A8A99] block mb-1.5">Порция (г)</label>
              <input
                type="number"
                className="w-full bg-white rounded-xl px-4 py-2.5 text-[#1A1A2E] text-[14px] outline-none border border-[#E8E8E6]"
                value={portion}
                onChange={e => setPortion(e.target.value)}
              />
              <p className="text-[12px] text-[#8A8A99] mt-2">
                = {Math.round(selectedResult.calories * parseFloat(portion || "0") / 100)} ккал
              </p>
              <button onClick={addFromSearch} className="w-full mt-3 py-3 bg-[#1A1A2E] text-white rounded-xl font-medium active:scale-95 transition-all">
                Добавить
              </button>
            </div>
          )}

          {/* My menu shortcuts */}
          {myMenu.filter(m => m.type === searchSheet).length > 0 && !selectedResult && (
            <>
              <SectionLabel>Из моего меню</SectionLabel>
              <div className="space-y-2">
                {myMenu.filter(m => m.type === searchSheet).map(item => (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (searchSheet) addFromMenu(item, searchSheet);
                      setSearchSheet(null);
                    }}
                    className="w-full text-left px-3 py-3 bg-[#F7F7F5] rounded-xl active:scale-[0.99] transition-all"
                  >
                    <p className="text-[13px] text-[#1A1A2E] font-medium mb-0.5">{item.name}</p>
                    <p className="text-[11px] text-[#8A8A99]">{item.calories} ккал · Б{item.protein} Ж{item.fat} У{item.carbs}</p>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </BottomSheet>

      {/* Add menu item sheet */}
      <BottomSheet open={addMenuSheet} onClose={() => setAddMenuSheet(false)} title="Новое блюдо">
        <div className="px-5 py-4 space-y-3">
          <input
            className="w-full bg-[#F0F0EE] rounded-xl px-4 py-3 text-[#1A1A2E] text-[14px] outline-none placeholder:text-[#C0C0C0]"
            placeholder="Название блюда"
            value={menuDraft.name ?? ""}
            onChange={e => setMenuDraft(d => ({ ...d, name: e.target.value }))}
          />
          <select
            className="w-full bg-[#F0F0EE] rounded-xl px-4 py-3 text-[#1A1A2E] text-[14px] outline-none"
            value={menuDraft.type ?? "breakfast"}
            onChange={e => setMenuDraft(d => ({ ...d, type: e.target.value as MealType }))}
          >
            {MEAL_ORDER.map(m => <option key={m} value={m}>{MEAL_LABELS[m]}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: "calories", label: "Ккал (на 100г)" },
              { key: "protein", label: "Белки (г)" },
              { key: "fat", label: "Жиры (г)" },
              { key: "carbs", label: "Углеводы (г)" },
            ].map(f => (
              <div key={f.key}>
                <label className="text-[11px] text-[#8A8A99] block mb-1">{f.label}</label>
                <input
                  type="number"
                  className="w-full bg-[#F0F0EE] rounded-xl px-3 py-2.5 text-[#1A1A2E] text-[14px] outline-none"
                  value={(menuDraft as Record<string, number | string | undefined>)[f.key] ?? ""}
                  onChange={e => setMenuDraft(d => ({ ...d, [f.key]: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            ))}
          </div>
          <button onClick={saveMenuItem} className="w-full py-3 bg-[#1A1A2E] text-white rounded-xl font-medium active:scale-95 transition-all">
            Сохранить
          </button>
        </div>
      </BottomSheet>

      {/* My menu sheet */}
      <BottomSheet open={showMyMenuSheet} onClose={() => setShowMyMenuSheet(false)} title="Моё меню">
        <div className="px-5 py-4">
          {myMenu.length === 0 ? (
            <EmptyState text="Добавьте любимые блюда для быстрого доступа" />
          ) : (
            <div className="space-y-3">
              {MEAL_ORDER.map(meal => {
                const items = myMenu.filter(m => m.type === meal);
                if (items.length === 0) return null;
                return (
                  <div key={meal}>
                    <SectionLabel>{MEAL_LABELS[meal]}</SectionLabel>
                    <div className="space-y-2">
                      {items.map(item => (
                        <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 bg-[#F7F7F5] rounded-xl">
                          <div className="flex-1">
                            <p className="text-[13px] font-medium text-[#1A1A2E]">{item.name}</p>
                            <p className="text-[11px] text-[#8A8A99]">{item.calories} ккал · Б{item.protein} Ж{item.fat} У{item.carbs}</p>
                          </div>
                          <button
                            onClick={() => setData(prev => ({ ...prev, myMenu: prev.myMenu.filter(m => m.id !== item.id) }))}
                            className="text-[#C0C0C0] p-1 active:scale-95 transition-all"
                          >
                            <IcoTrash />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}

function JournalSubTab({
  data, setData,
}: {
  data: AppData;
  setData: (fn: (p: AppData) => AppData) => void;
}) {
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [draft, setDraft] = useState<Partial<JournalEntry>>({ score: 7, symptoms: [], note: "", timestamp: new Date().toISOString() });

  const entries = [...data.journalEntries].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Simple insights: find ingredients that appear before low-score entries
  const suspects = (() => {
    const lowEntries = entries.filter(e => e.score <= 5);
    if (lowEntries.length < 2) return [];
    const counts: Record<string, number> = {};
    for (const entry of lowEntries) {
      const t = new Date(entry.timestamp).getTime();
      const allFoods = Object.values(data.foodDiary).flatMap(d =>
        [...d.breakfast, ...d.lunch, ...d.dinner, ...d.snack]
      );
      for (const food of allFoods) {
        const foodTime = t - 7200000; // 2h before
        if (foodTime > 0) counts[food.name] = (counts[food.name] ?? 0) + 1;
      }
    }
    return Object.entries(counts).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3);
  })();

  const saveEntry = () => {
    const entry: JournalEntry = {
      id: uid(),
      timestamp: draft.timestamp ?? new Date().toISOString(),
      score: draft.score ?? 7,
      symptoms: draft.symptoms ?? [],
      note: draft.note ?? "",
    };
    setData(prev => ({ ...prev, journalEntries: [...prev.journalEntries, entry] }));
    setDraft({ score: 7, symptoms: [], note: "", timestamp: new Date().toISOString() });
    setShowAddSheet(false);
  };

  const toggleSymptom = (s: string) => {
    setDraft(d => ({
      ...d,
      symptoms: (d.symptoms ?? []).includes(s)
        ? (d.symptoms ?? []).filter(x => x !== s)
        : [...(d.symptoms ?? []), s],
    }));
  };

  // Group entries by date
  const grouped = entries.reduce<Record<string, JournalEntry[]>>((acc, e) => {
    const d = getDateKey(new Date(e.timestamp));
    acc[d] = [...(acc[d] ?? []), e];
    return acc;
  }, {});

  return (
    <div className="px-4 space-y-4">
      {/* Insights */}
      {suspects.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="text-[#C9921A]"><IcoAlert /></div>
            <SectionLabel>Инсайты</SectionLabel>
          </div>
          <p className="text-[12px] text-[#8A8A99] mb-2">Возможные реакции на продукты:</p>
          {suspects.map(([name, count]) => (
            <div key={name} className="flex items-center justify-between py-1.5 border-b border-[#F0F0EE] last:border-none">
              <p className="text-[13px] text-[#1A1A2E]">{name}</p>
              <span className="text-[11px] text-[#C9921A] bg-[#FFF4E0] px-2 py-0.5 rounded-lg">{count} раз</span>
            </div>
          ))}
        </Card>
      )}

      {/* Add button */}
      <button
        onClick={() => { setDraft({ score: 7, symptoms: [], note: "", timestamp: new Date().toISOString() }); setShowAddSheet(true); }}
        className="w-full py-3.5 bg-[#1A1A2E] text-white rounded-2xl font-medium flex items-center justify-center gap-2 active:scale-[0.99] transition-all"
      >
        <IcoPlus />
        Добавить запись
      </button>

      {/* Entries */}
      {Object.keys(grouped).length === 0 ? (
        <EmptyState text="Записей пока нет. Отслеживайте самочувствие и его связь с питанием." />
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([date, dayEntries]) => (
            <div key={date}>
              <SectionLabel>{new Date(date + "T12:00:00").toLocaleDateString("ru", { weekday: "long", day: "numeric", month: "long" })}</SectionLabel>
              <div className="space-y-2">
                {dayEntries.map(e => (
                  <Card key={e.id} className="p-3.5">
                    <div className="flex items-start gap-3">
                      <ScoreTag score={e.score} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] text-[#8A8A99] mb-1">
                          {new Date(e.timestamp).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                        {e.symptoms.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-1.5">
                            {e.symptoms.map(s => (
                              <span key={s} className="text-[11px] px-2 py-0.5 rounded-lg bg-[#F0F0EE] text-[#8A8A99]">{s}</span>
                            ))}
                          </div>
                        )}
                        {e.note && <p className="text-[13px] text-[#1A1A2E]">{e.note}</p>}
                      </div>
                      <button
                        onClick={() => setData(prev => ({ ...prev, journalEntries: prev.journalEntries.filter(x => x.id !== e.id) }))}
                        className="text-[#C0C0C0] p-1 active:scale-95 transition-all"
                      >
                        <IcoClose />
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add entry sheet */}
      <BottomSheet open={showAddSheet} onClose={() => setShowAddSheet(false)} title="Новая запись">
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-[12px] text-[#8A8A99] block mb-1.5">Время</label>
            <input
              type="datetime-local"
              className="w-full bg-[#F0F0EE] rounded-xl px-4 py-2.5 text-[#1A1A2E] text-[13px] outline-none"
              value={draft.timestamp ? draft.timestamp.slice(0, 16) : ""}
              onChange={e => setDraft(d => ({ ...d, timestamp: new Date(e.target.value).toISOString() }))}
            />
          </div>

          <div>
            <label className="text-[12px] text-[#8A8A99] block mb-2">Самочувствие (1–10)</label>
            <div className="flex gap-1.5 flex-wrap">
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                <button
                  key={n}
                  onClick={() => setDraft(d => ({ ...d, score: n }))}
                  className={`w-9 h-9 rounded-xl text-[13px] font-medium transition-all active:scale-95 ${
                    draft.score === n ? "bg-[#1A1A2E] text-white" : "bg-[#F0F0EE] text-[#1A1A2E]"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[12px] text-[#8A8A99] block mb-2">Симптомы</label>
            <div className="flex flex-wrap gap-2">
              {SYMPTOM_TAGS.map(s => (
                <button
                  key={s}
                  onClick={() => toggleSymptom(s)}
                  className={`px-3 py-1.5 rounded-xl text-[12px] font-medium transition-all active:scale-95 ${
                    (draft.symptoms ?? []).includes(s)
                      ? "bg-[#1A1A2E] text-white"
                      : "bg-[#F0F0EE] text-[#8A8A99]"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[12px] text-[#8A8A99] block mb-1.5">Заметка</label>
            <textarea
              className="w-full bg-[#F0F0EE] rounded-xl px-4 py-3 text-[#1A1A2E] text-[14px] outline-none resize-none placeholder:text-[#C0C0C0]"
              rows={3}
              placeholder="Как себя чувствуете?"
              value={draft.note ?? ""}
              onChange={e => setDraft(d => ({ ...d, note: e.target.value }))}
            />
          </div>

          <button onClick={saveEntry} className="w-full py-3 bg-[#1A1A2E] text-white rounded-xl font-medium active:scale-95 transition-all">
            Сохранить
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// HABITS TAB
// ═══════════════════════════════════════════════════

function HabitsTab({ data, setData }: { data: AppData; setData: (fn: (p: AppData) => AppData) => void }) {
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [draft, setDraft] = useState<Partial<Habit>>({ name: "", icon: "none", dailyCost: 0, relapses: [], notes: "", startedAt: null });

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const habitSummary = data.habits.map(habit => {
    const elapsed = Math.max(0, now - getHabitStartTime(habit, now));
    const currentDays = Math.floor(elapsed / 86400000);
    return { habit, elapsed, currentDays, moneySaved: Math.round(currentDays * habit.dailyCost) };
  });
  const bestCurrent = habitSummary.reduce((best, item) => item.elapsed > best.elapsed ? item : best, habitSummary[0] ?? { habit: null, elapsed: 0, currentDays: 0, moneySaved: 0 });
  const averageDays = habitSummary.length ? Math.round(habitSummary.reduce((total, item) => total + item.currentDays, 0) / habitSummary.length) : 0;
  const totalSaved = habitSummary.reduce((total, item) => total + item.moneySaved, 0);

  const addHabit = () => {
    if (!draft.name?.trim()) return;
    const startedAt = draft.startedAt ?? draft.relapses?.[0]?.timestamp ?? new Date().toISOString();
    const habit: Habit = {
      id: uid(),
      name: draft.name.trim(),
      icon: draft.icon ?? "none",
      dailyCost: draft.dailyCost ?? 0,
      relapses: draft.relapses ?? [],
      notes: draft.notes ?? "",
      startedAt,
      milestonesAchieved: [],
    };
    setData(prev => ({ ...prev, habits: [...prev.habits, habit] }));
    setDraft({ name: "", icon: "none", dailyCost: 0, relapses: [], notes: "", startedAt: null });
    setShowAddSheet(false);
  };

  const deleteHabit = (id: string) => {
    setData(prev => ({ ...prev, habits: prev.habits.filter(h => h.id !== id) }));
  };

  const addRelapse = (habitId: string) => {
    setData(prev => ({
      ...prev,
      habits: prev.habits.map(h =>
        h.id === habitId
          ? { ...h, relapses: [...h.relapses, { id: uid(), timestamp: new Date().toISOString() }] }
          : h
      ),
    }));
  };

  const handleMilestoneReached = (habitId: string, milestoneId: string) => {
    setData(prev => ({
      ...prev,
      habits: prev.habits.map(h => {
        if (h.id !== habitId) return h;
        const existing = h.milestonesAchieved ?? [];
        if (existing.includes(milestoneId)) return h;
        return { ...h, milestonesAchieved: [...existing, milestoneId] };
      }),
    }));
  };

  const openAddSheet = () => {
    setDraft({ name: "", icon: "none", dailyCost: 0, relapses: [], notes: "", startedAt: null });
    setShowAddSheet(true);
  };

  return (
    <div className="app-page habits-page pt-14 pb-6">
      <header className="habits-header">
        <div>
          <p className="habits-eyebrow"><span />ОСОЗНАННЫЕ ПЕРЕМЕНЫ</p>
          <h1>Зависимости</h1>
          <p className="habits-header-copy">Отслеживай прогресс в своём темпе — спокойно и без оценок.</p>
        </div>
        <button type="button" className="habits-add-button" aria-label="Новый трекер" onClick={openAddSheet}><Plus size={17} /><span>Новый трекер</span></button>
      </header>

      <div className="habits-content">
        <section className="habits-hero">
          <div className="habits-hero-copy">
            <p className="habits-hero-eyebrow">ТВОЙ ПРОГРЕСС</p>
            <h2>Один день за раз</h2>
            <p>Иди к переменам в своём темпе — шаг за шагом.</p>
          </div>
          <div className="habits-hero-progress">
            <span>Самая длинная серия</span>
            <strong>{habitSummary.length ? bestCurrent.currentDays : "—"}<small>{habitSummary.length ? "дней" : ""}</small></strong>
            <em>{bestCurrent.habit?.name ?? "Создай первый трекер"}</em>
          </div>
          <div className="habits-hero-decoration" aria-hidden="true"><span /><span /><span /><span /><span /></div>
        </section>

        <section className="habits-overview" aria-label="Сводка прогресса">
          <div className="habits-overview-card"><span className="habits-overview-icon habits-overview-blue"><IcoChain /></span><span><small>Трекеры</small><b>{data.habits.length}</b></span></div>
          <div className="habits-overview-card"><span className="habits-overview-icon habits-overview-green"><TrendingUp size={17} /></span><span><small>Средняя серия</small><b>{averageDays}<em> дн.</em></b></span></div>
          <div className="habits-overview-card"><span className="habits-overview-icon habits-overview-amber"><Sparkles size={17} /></span><span><small>Сэкономлено</small><b>{totalSaved.toLocaleString("ru-RU")}<em> ₽</em></b></span></div>
        </section>

        <section className="habits-list-section">
          <div className="habits-list-heading">
            <div><p className="habits-section-eyebrow">МОЙ ПРОГРЕСС</p><h2>Твои трекеры</h2></div>
            {data.habits.length > 0 && <span>{data.habits.length} {data.habits.length === 1 ? "трекер" : data.habits.length < 5 ? "трекера" : "трекеров"}</span>}
          </div>

          {data.habits.length === 0 ? (
            <div className="habits-empty-state">
              <div className="habits-empty-art"><IcoChain /></div>
              <div><h3>Начни с того, что важно тебе</h3><p>Добавь то, что хочешь изменить. Здесь появятся твоя серия, достижения и сохранённые деньги.</p></div>
              <button type="button" onClick={openAddSheet}><Plus size={16} />Создать первый трекер</button>
            </div>
          ) : (
            <div className="habits-card-grid" data-count={data.habits.length}>
              {habitSummary.map(({ habit }) => (
                <HabitCard
                  key={habit.id}
                  habit={habit}
                  now={now}
                  expanded={expandedId === habit.id}
                  onToggleExpand={() => setExpandedId(expandedId === habit.id ? null : habit.id)}
                  onRelapse={addRelapse}
                  onDelete={deleteHabit}
                  onMilestoneReached={handleMilestoneReached}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <BottomSheet open={showAddSheet} onClose={() => setShowAddSheet(false)} title="Новый трекер">
        <div className="habit-form">
          <p className="habit-form-intro">Настрой один раз — дальше отмечай свой прогресс каждый день.</p>
          <label className="habit-form-field">
            <span>Что хочешь изменить?</span>
            <input autoFocus value={draft.name ?? ""} onChange={e => setDraft(value => ({ ...value, name: e.target.value }))} placeholder="Например, курение или поздний скроллинг" maxLength={48} />
          </label>

          <fieldset className="habit-icon-fieldset">
            <legend>Выбери тему</legend>
            <div className="habit-icon-picker">
              {HABIT_ICON_KEYS.map(key => (
                <button key={key} type="button" aria-pressed={draft.icon === key} onClick={() => setDraft(value => ({ ...value, icon: key }))} className={draft.icon === key ? "is-selected" : ""}>
                  <span>{HabitIconSvg[key]}</span><small>{HABIT_ICON_LABELS[key]}</small>
                </button>
              ))}
            </div>
          </fieldset>

          <label className="habit-form-field">
            <span>Сколько обычно уходит в день? <em>необязательно</em></span>
            <div className="habit-money-input"><input type="number" min={0} step={50} value={draft.dailyCost || ""} onChange={e => setDraft(value => ({ ...value, dailyCost: Math.max(0, parseFloat(e.target.value) || 0) }))} placeholder="0" /><b>₽ / день</b></div>
            <small>Покажем, сколько денег удалось сохранить.</small>
          </label>

          <details className="habit-advanced-details">
            <summary>Дата старта и заметка <span>по желанию</span></summary>
            <div className="habit-advanced-fields">
              <label className="habit-form-field"><span>С какого момента считать серию?</span><input type="datetime-local" max={toDatetimeLocalValue(new Date().toISOString())} value={toDatetimeLocalValue(draft.startedAt ?? null)} onChange={e => setDraft(value => ({ ...value, startedAt: e.target.value ? new Date(e.target.value).toISOString() : null }))} /><small>Если оставить пустым, начнём сейчас.</small></label>
              <label className="habit-form-field"><span>Последний срыв <em>если был</em></span><input type="datetime-local" max={toDatetimeLocalValue(new Date().toISOString())} value={toDatetimeLocalValue(draft.relapses?.[0]?.timestamp ?? null)} onChange={e => { const timestamp = e.target.value ? new Date(e.target.value).toISOString() : null; setDraft(value => ({ ...value, relapses: timestamp ? [{ id: uid(), timestamp }] : [] })); }} /><small>Текущая серия начнётся с этой даты.</small></label>
              <label className="habit-form-field habit-form-note"><span>Напоминание себе</span><textarea rows={3} value={draft.notes ?? ""} onChange={e => setDraft(value => ({ ...value, notes: e.target.value }))} placeholder="Почему для тебя это важно?" /></label>
            </div>
          </details>

          <button type="button" className="habit-form-submit" onClick={addHabit} disabled={!draft.name?.trim()}><Plus size={17} />Создать трекер</button>
        </div>
      </BottomSheet>
    </div>
  );
}

function HabitCard({
  habit, now, expanded, onToggleExpand, onRelapse, onDelete, onMilestoneReached,
}: {
  habit: Habit;
  now: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onRelapse: (id: string) => void;
  onDelete: (id: string) => void;
  onMilestoneReached: (id: string, milestoneId: string) => void;
}) {
  const [relapseArmed, setRelapseArmed] = useState(false);
  const [relapseConfirmed, setRelapseConfirmed] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);

  const sortedRelapses = [...habit.relapses].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const startTime = getHabitStartTime(habit, now);
  const elapsed = Math.max(0, now - startTime);
  const recordDurationMs = getBestStreak(habit, now);
  const nextMilestoneIndex = HABIT_MILESTONES.findIndex(def => elapsed < def.durationMs);
  const nextMilestone = nextMilestoneIndex >= 0 ? HABIT_MILESTONES[nextMilestoneIndex] : null;
  const previousMilestone = nextMilestoneIndex > 0 ? HABIT_MILESTONES[nextMilestoneIndex - 1] : null;
  const milestoneProgress = nextMilestone
    ? Math.min(100, Math.max(0, ((elapsed - (previousMilestone?.durationMs ?? 0)) / (nextMilestone.durationMs - (previousMilestone?.durationMs ?? 0))) * 100))
    : 100;
  const timeToMilestone = nextMilestone ? Math.max(nextMilestone.durationMs - elapsed, 0) : 0;
  const achievedMilestones = HABIT_MILESTONES.filter(def =>
    recordDurationMs >= def.durationMs || (habit.milestonesAchieved ?? []).includes(def.id)
  );

  const daysSaved = Math.max(0, Math.floor(elapsed / 86400000));
  const moneySaved = Math.round(daysSaved * habit.dailyCost);

  useEffect(() => {
    const newlyAchieved = HABIT_MILESTONES.filter(def =>
      recordDurationMs >= def.durationMs && !(habit.milestonesAchieved ?? []).includes(def.id)
    );
    newlyAchieved.forEach(def => onMilestoneReached(habit.id, def.id));
  }, [habit.id, habit.milestonesAchieved, onMilestoneReached, recordDurationMs]);

  const startDateLabel = new Date(startTime).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  const relapseDate = sortedRelapses.length ? new Date(sortedRelapses[sortedRelapses.length - 1].timestamp) : null;
  const confirmRelapse = () => {
    onRelapse(habit.id);
    setRelapseArmed(false);
    setRelapseConfirmed(true);
    window.setTimeout(() => setRelapseConfirmed(false), 3200);
  };

  return (
    <Card className={`habit-card ${expanded ? "is-expanded" : ""}`}>
      <div className="habit-card-main">
        <button type="button" className="habit-card-open" onClick={onToggleExpand} aria-expanded={expanded} aria-label={`${expanded ? "Скрыть" : "Показать"} подробности: ${habit.name}`}>
          <span className="habit-card-icon">{HabitIconSvg[habit.icon] ?? HabitIconSvg.none}</span>
          <span className="habit-card-copy">
            <span className="habit-card-name-row"><b>{habit.name}</b><i>Отслеживается</i></span>
            <strong className="habit-card-time">{daysSaved > 0 ? `${daysSaved} ${daysSaved === 1 ? "день" : daysSaved < 5 ? "дня" : "дней"}` : formatHabitDuration(elapsed)}</strong>
            <small>{daysSaved > 0 ? "без этой зависимости" : "серия уже началась"}</small>
          </span>
          <span className="habit-card-chevron">{expanded ? <IcoChevronDown /> : <IcoChevronRight />}</span>
        </button>
      </div>

      <div className="habit-card-milestone">
        <div className="habit-milestone-title"><span>{nextMilestone ? "Следующий этап" : "Все этапы пройдены"}</span><b>{nextMilestone?.label ?? "Отличный путь"}</b></div>
        <div className="habit-milestone-track"><i style={{ width: `${milestoneProgress}%` }} /></div>
        <div className="habit-milestone-hint">{nextMilestone ? `Ещё ${formatHabitDuration(timeToMilestone)} до цели` : "Продолжай в своём темпе"}</div>
      </div>

      <div className="habit-card-footer">
        <div className="habit-card-rewards">
          {habit.dailyCost > 0 && <span className="habit-saving-chip"><Sparkles size={13} />{moneySaved.toLocaleString("ru-RU")} ₽ сохранено</span>}
          {achievedMilestones.length > 0 && <span className="habit-record-chip"><Check size={12} />Рекорд {formatHabitDuration(recordDurationMs)}</span>}
        </div>
        <button type="button" className="habit-details-toggle" onClick={onToggleExpand}>{expanded ? "Свернуть" : "Подробнее"}{expanded ? <IcoChevronDown /> : <IcoChevronRight />}</button>
      </div>

      {expanded && (
        <section className="habit-details" aria-label={`Подробности: ${habit.name}`}>
          <div className="habit-detail-stats">
            <div><small>Текущая серия</small><b>{formatHabitDuration(elapsed)}</b></div>
            <div><small>Личный рекорд</small><b>{formatHabitDuration(recordDurationMs)}</b></div>
            <div><small>Серия началась</small><b>{startDateLabel}</b></div>
          </div>

          {habit.notes && <p className="habit-motivation-note"><span>Напоминание себе</span>{habit.notes}</p>}

          <div className="habit-relapse-panel">
            {relapseConfirmed ? (
              <div className="habit-relapse-success"><Check size={17} /><span><b>Отметка сохранена</b><small>Новый этап начинается с этого момента.</small></span></div>
            ) : relapseArmed ? (
              <div className="habit-relapse-confirm">
                <div><b>Зафиксировать срыв?</b><small>Текущая серия сохранится в личном рекорде, таймер начнётся заново.</small></div>
                <div><button type="button" onClick={() => setRelapseArmed(false)}>Отмена</button><button type="button" onClick={confirmRelapse}>Подтвердить</button></div>
              </div>
            ) : (
              <button type="button" className="habit-relapse-button" onClick={() => setRelapseArmed(true)}>
                <span><b>Зафиксировать срыв</b><small>Серия начнётся заново, отметка останется в истории.</small></span><IcoChevronRight />
              </button>
            )}
          </div>

          <div className="habit-history">
            <div className="habit-history-heading"><b>История</b><span>{sortedRelapses.length ? `${sortedRelapses.length} ${sortedRelapses.length === 1 ? "отметка" : sortedRelapses.length < 5 ? "отметки" : "отметок"}` : "Пока без срывов"}</span></div>
            <div className="habit-history-row"><span>Текущая серия с</span><b>{startDateLabel}</b></div>
            {relapseDate && <div className="habit-history-row"><span>Последняя отметка</span><b>{relapseDate.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })} · {relapseDate.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</b></div>}
            {sortedRelapses.slice(-5).reverse().map(relapse => {
              const date = new Date(relapse.timestamp);
              return <div key={relapse.id} className="habit-history-row"><span>Срыв</span><b>{date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} · {date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</b></div>;
            })}
          </div>

          {deleteArmed ? (
            <div className="habit-delete-confirm"><span>Удалить этот трекер и историю?</span><button type="button" onClick={() => setDeleteArmed(false)}>Отмена</button><button type="button" onClick={() => onDelete(habit.id)}>Удалить</button></div>
          ) : (
            <button type="button" className="habit-delete-button" onClick={() => setDeleteArmed(true)}>Удалить трекер</button>
          )}
        </section>
      )}
    </Card>
  );
}

// ═══════════════════════════════════════════════════
// SETTINGS SCREEN
// ═══════════════════════════════════════════════════

function SettingsScreen({
  data, setData, onClose,
}: {
  data: AppData;
  setData: (fn: (p: AppData) => AppData) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ ...data.settings });
  const [medications, setMedications] = useState<Medication[]>(data.medications ?? []);
  const [medicationDraft, setMedicationDraft] = useState<MedicationDraft>(createMedicationDraft);
  const [editingMedicationId, setEditingMedicationId] = useState<string | null>(null);

  const save = () => {
    setData(prev => ({ ...prev, settings: { ...form }, medications }));
    onClose();
  };

  const resetMedicationDraft = () => {
    setMedicationDraft(createMedicationDraft());
    setEditingMedicationId(null);
  };

  const saveMedicationDraft = () => {
    const name = medicationDraft.name.trim();
    if (!name) return;
    const normalizedDraft = {
      ...medicationDraft,
      name,
      unitsPerDose: Math.max(1, Math.floor(medicationDraft.unitsPerDose || 1)),
      intervalDays: Math.max(2, Math.floor(medicationDraft.intervalDays || 2)),
      times: medicationDraft.times.length ? medicationDraft.times : ["09:00"],
    };
    if (editingMedicationId) {
      setMedications(current => current.map(medication => medication.id === editingMedicationId ? { ...normalizedDraft, id: editingMedicationId } : medication));
    } else {
      setMedications(current => [...current, { ...normalizedDraft, id: uid() }]);
    }
    resetMedicationDraft();
  };

  const editMedication = (medication: Medication) => {
    setMedicationDraft({ ...medication, times: [...medication.times] });
    setEditingMedicationId(medication.id);
  };
  const hasDuplicateMedicationTimes = medicationDraft.frequency === "daily"
    && new Set(medicationDraft.times).size !== medicationDraft.times.length;

  const field = (
    label: string,
    key: keyof Settings,
    type: "text" | "number" | "password" = "text",
    placeholder = ""
  ) => (
    <div>
      <label className="text-[12px] text-[#8A8A99] font-medium block mb-1.5">{label}</label>
      <input
        type={type}
        className="w-full bg-[#F0F0EE] rounded-xl px-4 py-3 text-[#1A1A2E] text-[14px] outline-none placeholder:text-[#C0C0C0]"
        placeholder={placeholder}
        value={String(form[key] ?? "")}
        onChange={e => setForm(f => ({
          ...f,
          [key]: type === "number" ? (parseFloat(e.target.value) || 0) : e.target.value,
        }))}
      />
    </div>
  );

  return (
    <div className="settings-screen fixed inset-0 z-40 bg-white flex flex-col">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 pt-14 pb-4 border-b border-[#F0F0EE] flex-shrink-0"
        style={{ paddingTop: "calc(56px + env(safe-area-inset-top))" }}
      >
        <button onClick={onClose} className="text-[#1A1A2E] active:scale-95 transition-all p-1">
          <IcoBack />
        </button>
        <h1 className="text-[17px] font-semibold text-[#1A1A2E] flex-1">Настройки</h1>
        <button
          onClick={save}
          className="px-4 py-2 bg-[#1A1A2E] text-white text-[13px] font-medium rounded-xl active:scale-95 transition-all"
        >
          Сохранить
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-6" style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}>
        {/* Profile */}
        <section>
          <SectionLabel>Профиль</SectionLabel>
          {field("Имя", "userName", "text", "Как вас зовут?")}
        </section>

        {/* Work */}
        <section>
          <SectionLabel>Работа</SectionLabel>
          {field("Дневная цель (часов)", "workGoalHours", "number", "8")}
        </section>

        {/* Nutrition */}
        <section>
          <SectionLabel>Питание</SectionLabel>
          <div className="space-y-3">
            {field("Дневная норма калорий (ккал)", "calorieGoal", "number", "2000")}
            {field("Цель по белкам (г)", "proteinGoal", "number", "150")}
            {field("Цель по жирам (г)", "fatGoal", "number", "67")}
            {field("Цель по углеводам (г)", "carbsGoal", "number", "250")}
          </div>
        </section>

        {/* Water */}
        <section>
          <SectionLabel>Вода</SectionLabel>
          {field("Цель по воде (стаканов)", "waterGoal", "number", "8")}
        </section>

        <section className="medications-settings-section">
          <SectionLabel>Таблетки</SectionLabel>
          <label className="medication-feature-toggle">
            <span><b>Показывать на главной</b><small>Блок дневных приёмов и отметок</small></span>
            <input
              type="checkbox"
              checked={Boolean(form.medicationsEnabled)}
              onChange={event => setForm(current => ({ ...current, medicationsEnabled: event.target.checked }))}
              aria-label="Показывать блок таблеток на главной"
            />
          </label>

          {medications.length > 0 && (
            <div className="medication-settings-list">
              {medications.map(medication => (
                <div key={medication.id} className="medication-settings-item">
                  <span className="medication-settings-icon"><PillIcon size={17} /></span>
                  <span className="medication-settings-copy"><b>{medication.name}</b><small>{formatMedicationDose(medication.unitsPerDose)} · {describeMedicationSchedule(medication)}</small></span>
                  <button onClick={() => editMedication(medication)} aria-label={`Изменить ${medication.name}`} className="medication-settings-edit">Изменить</button>
                  <button onClick={() => { setMedications(current => current.filter(item => item.id !== medication.id)); if (editingMedicationId === medication.id) resetMedicationDraft(); }} aria-label={`Удалить ${medication.name}`} className="medication-settings-delete"><X size={16} /></button>
                </div>
              ))}
            </div>
          )}

          <div className="medication-editor">
            <p className="medication-editor-title">{editingMedicationId ? "Изменить препарат" : "Добавить препарат"}</p>
            <label className="medication-form-field medication-name-field">
              <span>Название</span>
              <input value={medicationDraft.name} onChange={event => setMedicationDraft(current => ({ ...current, name: event.target.value }))} placeholder="Например, Витамин D" />
            </label>
            <div className="medication-form-grid">
              <label className="medication-form-field">
                <span>Таблеток за приём</span>
                <input type="number" min={1} max={99} value={medicationDraft.unitsPerDose} onChange={event => setMedicationDraft(current => ({ ...current, unitsPerDose: Number(event.target.value) }))} />
              </label>
              <label className="medication-form-field">
                <span>Расписание</span>
                <select value={medicationDraft.frequency} onChange={event => setMedicationDraft(current => ({ ...current, frequency: event.target.value as MedicationDraft["frequency"] }))}>
                  <option value="daily">Каждый день</option>
                  <option value="interval">Раз в несколько дней</option>
                </select>
              </label>
            </div>
            {medicationDraft.frequency === "daily" ? (
              <>
                <label className="medication-form-field">
                  <span>Приёмов в день</span>
                  <select value={medicationDraft.times.length} onChange={event => {
                    const count = Number(event.target.value);
                    const defaults = ["09:00", "15:00", "20:00", "22:00"];
                    setMedicationDraft(current => ({ ...current, times: Array.from({ length: count }, (_, index) => current.times[index] ?? defaults[index]) }));
                  }}>
                    {[1, 2, 3, 4].map(count => <option key={count} value={count}>{count} {count === 1 ? "раз" : count < 5 ? "раза" : "раз"} в день</option>)}
                  </select>
                </label>
                <div className="medication-times-grid">
                  {medicationDraft.times.map((time, index) => (
                    <label key={index} className="medication-form-field"><span>Время {index + 1}</span><input type="time" value={time} onChange={event => setMedicationDraft(current => ({ ...current, times: current.times.map((value, timeIndex) => timeIndex === index ? event.target.value : value) }))} /></label>
                  ))}
                </div>
                {hasDuplicateMedicationTimes && <p className="medication-field-hint">Для каждого приёма укажи своё время.</p>}
              </>
            ) : (
              <div className="medication-form-grid">
                <label className="medication-form-field"><span>Интервал, дней</span><input type="number" min={2} max={365} value={medicationDraft.intervalDays} onChange={event => setMedicationDraft(current => ({ ...current, intervalDays: Number(event.target.value) }))} /></label>
                <label className="medication-form-field"><span>Время приёма</span><input type="time" value={medicationDraft.intervalTime} onChange={event => setMedicationDraft(current => ({ ...current, intervalTime: event.target.value }))} /></label>
                <label className="medication-form-field"><span>Первый приём</span><input type="date" value={medicationDraft.startDate} onChange={event => setMedicationDraft(current => ({ ...current, startDate: event.target.value }))} /></label>
              </div>
            )}
            <div className="medication-editor-actions">
              {editingMedicationId && <button className="medication-cancel-edit" onClick={resetMedicationDraft}>Отмена</button>}
              <button className="medication-add-button" onClick={saveMedicationDraft} disabled={!medicationDraft.name.trim() || hasDuplicateMedicationTimes}><Plus size={16} />{editingMedicationId ? "Сохранить препарат" : "Добавить в список"}</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// BOTTOM NAV
// ═══════════════════════════════════════════════════




const TABS: { id: AppTab; label: string }[] = [
  { id: "home",      label: "Главная"  },
  { id: "work",      label: "Работа"   },
  { id: "goals",     label: "Цели"     },
  { id: "nutrition", label: "Питание"  },
  { id: "habits",    label: "Зависимости" },
];

export function BottomNav({
  active,
  onChange,
}: {
  active: AppTab;
  onChange: (t: AppTab) => void;
}) {
  return (
    <nav
      aria-label="Основная навигация"
      className="app-nav fixed bottom-0 left-0 right-0 z-30 border-t border-[#E9EDF2] bg-white/95 shadow-[0_-4px_20px_rgba(25,45,75,0.06)] backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="app-nav-items flex h-16">
        <div className="app-nav-brand">Life Tracker</div>
        {TABS.map((tab) => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 transition-colors ${isActive ? "text-[#549AF2]" : "text-[#778397]"}`}
              aria-label={tab.label}
              aria-current={isActive ? "page" : undefined}
              title={tab.label}
            >
              {tab.id === "home"      && <IcoHome      active={isActive} />}
              {tab.id === "work"      && <IcoWork      active={isActive} />}
              {tab.id === "goals"     && <IcoTarget    active={isActive} />}
              {tab.id === "nutrition" && <IcoLeaf      active={isActive} />}
              {tab.id === "habits"    && <IcoChain     active={isActive} />}
              <span className="whitespace-nowrap text-[10px] font-medium leading-3">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ═══════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════

export default function App() {
  const shouldReduceMotion = useReducedMotion();
  const [data, setDataRaw] = useState<AppData>(loadData);
  const [activeTab, setActiveTab] = useState<AppTab>("home");
  const [showSettings, setShowSettings] = useState(false);
  const [telegramUserId, setTelegramUserId] = useState<number | null>(null);
  const [isInitialLoadDone, setIsInitialLoadDone] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const saveTimeout = useRef<number | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  
  const setData = useCallback((fn: (prev: AppData) => AppData) => {
    setDataRaw(prev => fn(prev));
  }, []);

// 1. Инициализация Telegram SDK и получение ID
useEffect(() => {
  let cancelled = false;
  const tg = (window as any).Telegram?.WebApp;
  addLog(`[TMA] SDK: ${tg ? "найден" : "НЕ НАЙДЕН"}`);  // ✅
  if (tg) {
    tg.ready();
    tg.expand();

    try {
      if (typeof tg.disableVerticalSwipes === "function") {
        tg.disableVerticalSwipes();
      }
      if (typeof tg.disableSwipeBack === "function") {
        tg.disableSwipeBack();
      }
    } catch (error) {
      addLog(`[TMA] Не удалось отключить свайпы: ${error}`);
    }
  }
  resolveTelegramUserId().then(id => {
    if (cancelled) return;
    addLog(`[TMA] User ID: ${id ? "получен" : "не получен"}`);
    if (!id) {
      addLog("[Sync] Открыто вне Telegram — данные сохраняются только на этом устройстве");
      setSyncNotice("Открой приложение через Telegram, чтобы синхронизировать данные между устройствами.");
      setIsInitialLoadDone(true);
      return;
    }
    if (!supabase) {
      addLog("[Sync] Не заданы VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY");
      setSyncNotice("Облачная синхронизация не настроена. Данные пока хранятся только на этом устройстве.");
      setIsInitialLoadDone(true);
    }
    setTelegramUserId(id);
  });
  return () => { cancelled = true; };
}, []);

/// 2. Первичная загрузка данных из Supabase
useEffect(() => {
  if (!telegramUserId) return;
  if (!supabase) return;
  let cancelled = false;

  async function loadRemote() {
    addLog(`[Sync] 🚀 Загрузка с сервера для ID: ${telegramUserId}`);
    let remote: AppData | null;
    try {
      remote = await supabaseLoadData(telegramUserId);
    } catch (error) {
      // Keep sync disabled after a failed read so local data cannot overwrite cloud data.
      addLog(`[Sync] Ошибка чтения Supabase: ${error}`);
      setSyncNotice("Не удалось загрузить облачные данные. Проверь доступ Supabase и таблицу users; локальные данные не отправлены.");
      return;
    }
    if (cancelled) return;
    
    if (remote) {
      setDataRaw(prev => {
        // 🔥 Глубокое слияние: если в облаке пусто — оставляем локальное
        const merged: AppData = {
          settings: { ...prev.settings, ...(remote.settings ?? {}) },
          workActivity: Object.keys(remote.workActivity ?? {}).length > 0
            ? { ...prev.workActivity, ...remote.workActivity }
            : prev.workActivity,
          goals: (remote.goals?.length ?? 0) > 0 ? remote.goals : prev.goals,
          foodDiary: Object.keys(remote.foodDiary ?? {}).length > 0
            ? { ...prev.foodDiary, ...remote.foodDiary }
            : prev.foodDiary,
          myMenu: (remote.myMenu?.length ?? 0) > 0 ? remote.myMenu : prev.myMenu,
          water: Object.keys(remote.water ?? {}).length > 0
            ? { ...prev.water, ...remote.water }
            : prev.water,
          journalEntries: (remote.journalEntries?.length ?? 0) > 0
            ? remote.journalEntries
            : prev.journalEntries,
          habits: (remote.habits?.length ?? 0) > 0 ? remote.habits : prev.habits,
          wellbeing: Object.keys(remote.wellbeing ?? {}).length > 0
            ? { ...prev.wellbeing, ...remote.wellbeing }
            : prev.wellbeing,
          medications: Array.isArray(remote.medications) ? remote.medications : prev.medications,
          medicationLog: remote.medicationLog
            ? { ...prev.medicationLog, ...remote.medicationLog }
            : prev.medicationLog,
        };
        saveData(merged);
        return merged;
      });
    } else {
      addLog(`[Sync] На сервере данных нет`);
    }
    
    setIsInitialLoadDone(true);
    setSyncNotice(null);
    addLog(`[Sync] ✅ Первичная загрузка завершена`);
  }
  
  loadRemote();
  
  return () => {
    cancelled = true;
  };
}, [telegramUserId]);

// 3. Сохранение данных
useEffect(() => {
  saveData(data);
  if (!telegramUserId || !isInitialLoadDone || !supabase) {
    addLog(`[Sync] ⏸ Пропуск сохранения: ID=${telegramUserId}, loaded=${isInitialLoadDone}`);  // ✅
    return;
  }
  if (saveTimeout.current) {
    window.clearTimeout(saveTimeout.current);
  }
  saveTimeout.current = window.setTimeout(() => {
    addLog(`[Sync] 💾 Отправка в Supabase...`);  // ✅
    const snapshot = data;
    saveQueue.current = saveQueue.current
      .then(() => supabaseUpsertData(telegramUserId, snapshot))
      .then(saved => {
        if (!saved) setSyncNotice("Не удалось сохранить данные в облако. Проверь доступ Supabase и уникальность telegram_id в таблице users.");
        else setSyncNotice(null);
      })
      .then(() => undefined)
      .catch(error => addLog(`[Sync] Ошибка очереди сохранения: ${error}`));
  }, SAVE_DEBOUNCE_MS) as unknown as number;
  return () => {
    if (saveTimeout.current) {
      window.clearTimeout(saveTimeout.current);
    }
  };
}, [data, telegramUserId, isInitialLoadDone]);

  // Check if first launch (no user name)
  const isFirstLaunch = !data.settings.userName;

  useEffect(() => {
    if (isFirstLaunch && isInitialLoadDone) setShowSettings(true);
  }, [isFirstLaunch, isInitialLoadDone]);

  return (
    <div className="app-shell relative w-full overflow-hidden bg-white" style={{ height: "100dvh", fontFamily: "'Inter', sans-serif" }}>
      {/* Settings overlay */}
      {showSettings && (
        <SettingsScreen
          data={data}
          setData={setData}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Main content */}
      <div
        className="app-content absolute inset-0 overflow-y-auto overscroll-contain"
        style={{ paddingBottom: "calc(64px + env(safe-area-inset-bottom))" }}
      >
        {syncNotice && <div className="sync-notice" role="status">{syncNotice}</div>}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            className="tab-transition min-h-full"
            initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: "easeOut" }}
          >
            {activeTab === "home" && <HomeTab data={data} setData={setData} onOpenSettings={() => setShowSettings(true)} onNavigate={setActiveTab} />}
            {activeTab === "work" && <WorkTab data={data} setData={setData} />}
            {activeTab === "goals" && <GoalsTab data={data} setData={setData} />}
            {activeTab === "nutrition" && <NutritionTab data={data} setData={setData} />}
            {activeTab === "habits" && <HabitsTab data={data} setData={setData} />}
          </motion.div>
        </AnimatePresence>
        <footer className="app-attribution"><a href="https://shadcndashboard.dev/" target="_blank" rel="noreferrer">Shadcn Dashboard</a></footer>
      </div>
{/* Bottom nav */}
{!showSettings && <BottomNav active={activeTab} onChange={setActiveTab} />}

<KeyboardDismissControl />

</div>
);
}

function KeyboardDismissControl() {
  const [isInputFocused, setIsInputFocused] = useState(false);

  useEffect(() => {
    let focusOutTimer = 0;
    const isEditable = (element: Element | null) => element instanceof HTMLInputElement
      || element instanceof HTMLTextAreaElement
      || (element instanceof HTMLElement && element.isContentEditable);
    const onFocusIn = (event: FocusEvent) => setIsInputFocused(isEditable(event.target as Element | null));
    const onFocusOut = () => {
      window.clearTimeout(focusOutTimer);
      focusOutTimer = window.setTimeout(() => setIsInputFocused(isEditable(document.activeElement)), 0);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isEditable(document.activeElement)) {
        (document.activeElement as HTMLElement).blur();
      }
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusOutTimer);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  if (!isInputFocused) return null;
  return (
    <button
      type="button"
      className="keyboard-dismiss"
      aria-label="Скрыть клавиатуру"
      onPointerDown={event => {
        event.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur();
        setIsInputFocused(false);
      }}
    >
      <Keyboard size={16} aria-hidden="true" />
      <span>Готово</span>
    </button>
  );
}

// Helper: render per-character spans with index variable for CSS delay
function renderShimmerText(text: string) {
  return Array.from(text).map((ch, i) => {
    const key = `c-${i}-${ch}`;
    // preserve spaces
    const char = ch === " " ? "\u00A0" : ch;
    return (
      <span
        key={key}
        className="shimmer-char"
        style={{ ["--i"]: i } as React.CSSProperties}
      >
        {char}
      </span>
    );
  });
}
