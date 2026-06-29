import { useState, useEffect, useRef, useCallback } from "react";
import { BarChart, Bar, XAxis, ReferenceLine, ResponsiveContainer, Cell } from "recharts";
import { Slider } from "./components/ui/slider";



// ═══════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════

type AppTab = "home" | "work" | "goals" | "nutrition" | "habits";
type Priority = "high" | "medium" | "low";
type GoalGroup = "all" | "today" | "week" | "longterm";
type MealType = "breakfast" | "lunch" | "dinner" | "snack";
type RecurringType = "none" | "daily" | "weekly";

interface Settings {
  telegramToken: string;
  chatId: string;
  userName: string;
  workGoalHours: number;
  calorieGoal: number;
  proteinGoal: number;
  fatGoal: number;
  carbsGoal: number;
  waterGoal: number;
}

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
}

// ═══════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════

const DEFAULT_SETTINGS: Settings = {
  telegramToken: "",
  chatId: "",
  userName: "",
  workGoalHours: 8,
  calorieGoal: 2000,
  proteinGoal: 150,
  fatGoal: 67,
  carbsGoal: 250,
  waterGoal: 8,
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

const GROUP_LABELS: Record<GoalGroup, string> = {
  all: "Все",
  today: "Сегодня",
  week: "На этой неделе",
  longterm: "Долгосрочные",
};

const GOAL_SECTIONS: Exclude<GoalGroup, "all">[] = ["today", "week", "longterm"];

const HABIT_ICON_KEYS = ["smoke", "phone", "drink", "sugar", "coffee", "game", "shop", "none"];

function getGoalGroupLabel(group: GoalGroup, selectedDate: string, todayKey: string): string {
  if (group === "today") return selectedDate === todayKey ? "Сегодня" : "В этот день";
  return GROUP_LABELS[group];
}

// ═══════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
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
  return d.toISOString().split("T")[0];
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
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d} дн`);
  if (h > 0) parts.push(`${h} ч`);
  parts.push(`${m} мин`);
  return parts.join(" ");
}

function last7Days(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return getDateKey(d);
  });
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

function getBestStreak(relapses: Relapse[]): number {
  if (relapses.length === 0) return 0;
  const sorted = [...relapses].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  let best = 0;
  let prev = new Date(sorted[0].timestamp).getTime();
  for (let i = 1; i < sorted.length; i++) {
    const gap = new Date(sorted[i].timestamp).getTime() - prev;
    best = Math.max(best, gap);
    prev = new Date(sorted[i].timestamp).getTime();
  }
  const current = Date.now() - new Date(sorted[sorted.length - 1].timestamp).getTime();
  return Math.max(best, current);
}

// ═══════════════════════════════════════════════════
// TELEGRAM
// ═══════════════════════════════════════════════════

async function telegramSend(token: string, chatId: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_notification: true }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function telegramLoad(token: string): Promise<AppData | null> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=100&offset=-100`);
    if (!res.ok) return null;
    const json = await res.json();
    const updates: Array<{ message?: { text?: string } }> = json.result ?? [];
    for (let i = updates.length - 1; i >= 0; i--) {
      const text = updates[i]?.message?.text ?? "";
      if (text.startsWith("#DATA_SYNC")) {
        try {
          return JSON.parse(text.replace("#DATA_SYNC", "").trim()) as AppData;
        } catch { /* skip */ }
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════════

const STORAGE_KEY = "lifepwa_v1";

function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AppData;
  } catch { /* ignore */ }
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
  };
}

function saveData(data: AppData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
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
  value, max, size = 80, stroke = 6, color = "#1A1A2E", children,
}: {
  value: number; max: number; size?: number; stroke?: number; color?: string; children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(value / Math.max(max, 1), 1);
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} className="absolute inset-0">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EBEBEA" strokeWidth={stroke} />
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
            <button onClick={onClose} className="p-1.5 rounded-xl text-[#8A8A99] hover:text-[#1A1A2E] active:scale-95 transition-all">
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

function Card({ children, className = "", onClick, style }: {
  children: React.ReactNode; className?: string; onClick?: () => void; style?: React.CSSProperties;
}) {
  return (
    <div
      className={`bg-[#F7F7F5] rounded-2xl ${onClick ? "active:scale-[0.98] transition-transform cursor-pointer" : ""} ${className}`}
      style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.04)", ...style }}
      onClick={onClick}
    >
      {children}
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
  data, setData, onOpenSettings,
}: {
  data: AppData;
  setData: (fn: (p: AppData) => AppData) => void;
  onOpenSettings: () => void;
}) {
  const todayKey = getDateKey();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const todaySessions = data.workSessions[todayKey] ?? [];
  const workedMinutes = todaySessions.reduce((acc, s) => acc + sessionMinutes(s), 0);
  const goalMinutes = data.settings.workGoalHours * 60;

  const todayDiary = data.foodDiary[todayKey] ?? EMPTY_DIARY;
  const caloriesEaten = [...todayDiary.breakfast, ...todayDiary.lunch, ...todayDiary.dinner, ...todayDiary.snack]
    .reduce((acc, f) => acc + Math.round(f.calories * f.portion / 100), 0);

  const topGoals = data.goals.filter(g => !g.completed && !g.archived && g.group === "today").slice(0, 3);

  const todayWell = data.wellbeing[todayKey];

  const handleCompleteGoal = (id: string) => {
    setData(prev => ({
      ...prev,
      goals: prev.goals.map(g => g.id === id ? { ...g, completed: true, completedAt: new Date().toISOString() } : g),
    }));
  };

  const handleWellbeing = (score: number) => {
    setData(prev => ({ ...prev, wellbeing: { ...prev.wellbeing, [todayKey]: score } }));
  };

  return (
    <div className="px-4 pt-14 pb-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-[22px] font-semibold text-[#1A1A2E] leading-tight">{getGreeting()}{data.settings.userName ? `, ${data.settings.userName}` : ""}.</p>
          <p className="text-sm text-[#8A8A99] mt-0.5">{formatDate()}</p>
        </div>
        <button
          onClick={onOpenSettings}
          className="w-9 h-9 rounded-xl bg-[#F7F7F5] flex items-center justify-center text-[#8A8A99] active:scale-95 transition-all"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}
        >
          <IcoSettings />
        </button>
      </div>

      {/* Work progress */}
      <Card className="p-4 mb-3">
        <div className="flex items-center justify-between mb-3">
          <SectionLabel>Работа сегодня</SectionLabel>
          <span className="text-xs text-[#8A8A99]">{formatDuration(workedMinutes)} из {data.settings.workGoalHours}ч</span>
        </div>
        <ProgressBar value={workedMinutes} max={goalMinutes} />
        {todaySessions.some(s => !s.end) && (
          <div className="flex items-center gap-1.5 mt-2.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#2D7D46] animate-pulse" />
            <span className="text-[12px] text-[#2D7D46] font-medium">Сессия активна</span>
          </div>
        )}
      </Card>

      {/* Top goals */}
      <Card className="p-4 mb-3">
        <SectionLabel>Задачи на сегодня</SectionLabel>
        {topGoals.length === 0 ? (
          <p className="text-sm text-[#8A8A99] py-2">Нет активных задач</p>
        ) : (
          <div className="space-y-2">
            {topGoals.map(g => (
              <GoalQuickItem key={g.id} goal={g} onComplete={handleCompleteGoal} />
            ))}
          </div>
        )}
      </Card>

      {/* Calories */}
      <Card className="p-4 mb-3">
        <div className="flex items-center gap-4">
          <ProgressRing value={caloriesEaten} max={data.settings.calorieGoal} size={72} stroke={6}>
            <div className="text-center">
              <p className="text-[13px] font-semibold text-[#1A1A2E] leading-none">{caloriesEaten}</p>
              <p className="text-[9px] text-[#8A8A99]">ккал</p>
            </div>
          </ProgressRing>
          <div className="flex-1 space-y-1.5">
            <SectionLabel>Питание</SectionLabel>
            <div className="space-y-1">
              {[
                { label: "Белки", val: [...todayDiary.breakfast, ...todayDiary.lunch, ...todayDiary.dinner, ...todayDiary.snack].reduce((a, f) => a + Math.round(f.protein * f.portion / 100), 0), goal: data.settings.proteinGoal, color: "#4A90E2" },
                { label: "Жиры", val: [...todayDiary.breakfast, ...todayDiary.lunch, ...todayDiary.dinner, ...todayDiary.snack].reduce((a, f) => a + Math.round(f.fat * f.portion / 100), 0), goal: data.settings.fatGoal, color: "#E2944A" },
                { label: "Углеводы", val: [...todayDiary.breakfast, ...todayDiary.lunch, ...todayDiary.dinner, ...todayDiary.snack].reduce((a, f) => a + Math.round(f.carbs * f.portion / 100), 0), goal: data.settings.carbsGoal, color: "#4AE2A0" },
              ].map(m => (
                <div key={m.label} className="flex items-center gap-2">
                  <span className="text-[11px] text-[#8A8A99] w-16">{m.label} {m.val}г</span>
                  <div className="flex-1">
                    <ProgressBar value={m.val} max={m.goal} color={m.color} height={3} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Active habits */}
      {data.habits.length > 0 && (
        <div className="mb-3">
          <SectionLabel>Привычки</SectionLabel>
          <div className="space-y-2">
            {data.habits.slice(0, 3).map(h => {
              const lastRelapse = h.relapses.length > 0
                ? Math.max(...h.relapses.map(r => new Date(r.timestamp).getTime()))
                : null;
              const elapsed = lastRelapse ? now - lastRelapse : null;
              return (
                <Card key={h.id} className="p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[#EBEBEA] flex items-center justify-center text-[#1A1A2E] flex-shrink-0">
                    {HabitIconSvg[h.icon] ?? HabitIconSvg.none}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[#1A1A2E] truncate">{h.name}</p>
                    <p className="text-[11px] text-[#8A8A99]">
                      {elapsed !== null ? formatTimerLong(elapsed) : "Начинается сейчас"}
                    </p>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Wellbeing */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <SectionLabel>Самочувствие</SectionLabel>
          {todayWell !== undefined && <ScoreTag score={todayWell} />}
        </div>
        {todayWell === undefined ? (
          <p className="text-sm text-[#8A8A99] mb-3">Как вы сегодня?</p>
        ) : (
          <p className="text-sm text-[#8A8A99] mb-3">Оценка за сегодня</p>
        )}
        <div className="flex gap-1.5 flex-wrap">
          {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
            <button
              key={n}
              onClick={() => handleWellbeing(n)}
              className={`w-8 h-8 rounded-xl text-[13px] font-medium transition-all active:scale-95 ${
                todayWell === n
                  ? "bg-[#1A1A2E] text-white"
                  : "bg-[#EBEBEA] text-[#1A1A2E]"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </Card>
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

function WorkTab({ data, setData }: { data: AppData; setData: (fn: (p: AppData) => AppData) => void }) {
  const [view, setView] = useState<"today" | "stats">("today");
  const [showGoalSheet, setShowGoalSheet] = useState(false);
  const [goalInput, setGoalInput] = useState(String(data.settings.workGoalHours));

  const todayKey = getDateKey();
  const todayActivity = (data as any).workActivity?.[todayKey] ?? { totalSeconds: 0, hours: {} };
  const workedSeconds = todayActivity.totalSeconds ?? 0;
  const workedMinutes = Math.floor(workedSeconds / 60);
  const goalMinutes = data.settings.workGoalHours * 60;
  const goalSeconds = data.settings.workGoalHours * 3600;

  // Самый активный час сегодня
  const todayHours: Record<string, number> = todayActivity.hours ?? {};
  const peakHourEntry = Object.entries(todayHours).sort((a, b) => b[1] - a[1])[0];
  const peakHour = peakHourEntry ? `${peakHourEntry[0]}:00 – ${peakHourEntry[0]}:59` : null;

  const saveGoal = () => {
    const h = parseFloat(goalInput);
    if (!isNaN(h) && h > 0) {
      setData(prev => ({ ...prev, settings: { ...prev.settings, workGoalHours: h } }));
    }
    setShowGoalSheet(false);
  };

  // ── Данные для графика по дням (последние 7) ──
  const days = last7Days();
  const chartDataDays = days.map(d => {
    const act = (data as any).workActivity?.[d] ?? { totalSeconds: 0 };
    return {
      day: shortDay(d),
      hours: parseFloat((act.totalSeconds / 3600).toFixed(1)),
      isToday: d === todayKey,
    };
  });

  const weekAvg = parseFloat((chartDataDays.reduce((acc, d) => acc + d.hours, 0) / 7).toFixed(1));
  const bestDay = chartDataDays.reduce((best, d) => d.hours > best.hours ? d : best, chartDataDays[0]);

  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const secs = (data as any).workActivity?.[days[i]]?.totalSeconds ?? 0;
    if (secs >= goalSeconds) streak++;
    else break;
  }

  // ── Данные для графика по часам (сегодня) ──
  const hoursChartData = Array.from({ length: 24 }, (_, i) => ({
    hour: `${i}`,
    label: i % 3 === 0 ? `${i}:00` : "",
    seconds: todayHours[String(i)] ?? 0,
    isActive: (todayHours[String(i)] ?? 0) > 0,
  })).filter(h => {
    // Показываем только рабочие часы — от первого активного до последнего + 1
    const activeHours = Object.keys(todayHours).map(Number);
    if (activeHours.length === 0) return h.hour >= "8" && h.hour <= "20";
    const min = Math.max(0, Math.min(...activeHours) - 1);
    const max = Math.min(23, Math.max(...activeHours) + 1);
    return Number(h.hour) >= min && Number(h.hour) <= max;
  });

  const maxHourSeconds = Math.max(...hoursChartData.map(h => h.seconds), 1);

  return (
    <div className="pt-14 pb-6">
      {/* Header */}
      <div className="px-4 mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#1A1A2E]">Работа</h1>
        <div className="flex bg-[#F0F0EE] rounded-xl p-0.5">
          {(["today", "stats"] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-[10px] text-[13px] font-medium transition-all ${
                view === v ? "bg-white text-[#1A1A2E] shadow-sm" : "text-[#8A8A99]"
              }`}
            >
              {v === "today" ? "Сегодня" : "Статистика"}
            </button>
          ))}
        </div>
      </div>

      {view === "today" && (
        <div className="px-4 space-y-3">

          {/* Главная карточка — кольцо + два числа */}
          <Card className="p-6 flex flex-col items-center">
            <button onClick={() => setShowGoalSheet(true)} className="active:scale-95 transition-all mb-4">
              <ProgressRing value={workedSeconds} max={goalSeconds} size={148} stroke={10}>
                <div className="text-center px-2">
                  <p className="text-[11px] text-[#8A8A99] mb-0.5">отработано</p>
                  <p className="text-[28px] font-semibold text-[#1A1A2E] leading-none">
                    {Math.floor(workedMinutes / 60)}
                    <span className="text-[16px] text-[#8A8A99]">ч </span>
                    {workedMinutes % 60}
                    <span className="text-[16px] text-[#8A8A99]">м</span>
                  </p>
                  <div className="w-full h-px bg-[#EBEBEA] my-1.5" />
                  <p className="text-[11px] text-[#8A8A99] mb-0.5">цель</p>
                  <p className="text-[18px] font-medium text-[#8A8A99] leading-none">
                    {Math.round((workedSeconds / Math.max(goalSeconds, 1)) * 100)}
                    <span className="text-[13px]">%</span>
                  </p>
                </div>
              </ProgressRing>
            </button>

            {/* Пиковый час */}
            {peakHour && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#FFF4E0]">
                <div className="text-[#C9921A]"><IcoFire /></div>
                <span className="text-[12px] text-[#C9921A] font-medium">
                  Пик активности: {peakHour}
                </span>
              </div>
            )}

            {workedSeconds === 0 && (
              <p className="text-[13px] text-[#8A8A99] mt-2">
                Данные появятся автоматически со скрипта
              </p>
            )}
          </Card>

          {/* График активности по часам */}
          {hoursChartData.some(h => h.seconds > 0) && (
            <Card className="p-4">
              <SectionLabel>Активность по часам</SectionLabel>
              <div className="flex items-end gap-1 h-24 mt-2">
                {hoursChartData.map(h => {
                  const pct = h.seconds / maxHourSeconds;
                  const mins = Math.round(h.seconds / 60);
                  return (
                    <div key={h.hour} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full flex flex-col justify-end" style={{ height: 72 }}>
                        <div
                          className="w-full rounded-t-md transition-all duration-500"
                          style={{
                            height: `${Math.max(pct * 100, h.seconds > 0 ? 4 : 0)}%`,
                            background: h.seconds > 0 ? "#1A1A2E" : "#EBEBEA",
                            opacity: pct > 0.8 ? 1 : 0.4 + pct * 0.6,
                          }}
                          title={`${h.hour}:00 — ${mins} мин`}
                        />
                      </div>
                      {h.label && (
                        <span className="text-[9px] text-[#8A8A99]">{h.label}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      )}

      {view === "stats" && (
        <div className="px-4 space-y-4">

          {/* График по дням */}
          <Card className="p-4">
            <SectionLabel>Часы за последние 7 дней</SectionLabel>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={chartDataDays} barSize={28} margin={{ top: 8, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#8A8A99" }} axisLine={false} tickLine={false} />
                <ReferenceLine y={data.settings.workGoalHours} stroke="#1A1A2E" strokeDasharray="4 2" strokeWidth={1} />
                <Bar dataKey="hours" radius={[5, 5, 0, 0]}>
                  {chartDataDays.map((entry, i) => (
                    <Cell key={i} fill={entry.isToday ? "#1A1A2E" : "#E8E8E6"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* График активных часов за неделю */}
          <Card className="p-4">
            <SectionLabel>Самые активные часы за неделю</SectionLabel>
            {(() => {
              // Суммируем часы за последние 7 дней
              const weekHours: Record<string, number> = {};
              for (const d of days) {
                const h = (data as any).workActivity?.[d]?.hours ?? {};
                for (const [hour, secs] of Object.entries(h)) {
                  weekHours[hour] = (weekHours[hour] ?? 0) + (secs as number);
                }
              }
              const maxSecs = Math.max(...Object.values(weekHours), 1);
              const allHours = Array.from({ length: 24 }, (_, i) => ({
                hour: i,
                seconds: weekHours[String(i)] ?? 0,
              })).filter(h => {
                const active = Object.keys(weekHours).map(Number);
                if (active.length === 0) return h.hour >= 8 && h.hour <= 20;
                const min = Math.max(0, Math.min(...active) - 1);
                const max = Math.min(23, Math.max(...active) + 1);
                return h.hour >= min && h.hour <= max;
              });

              return (
                <div className="flex items-end gap-1 h-24 mt-2">
                  {allHours.map(h => {
                    const pct = h.seconds / maxSecs;
                    const mins = Math.round(h.seconds / 60);
                    return (
                      <div key={h.hour} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full flex flex-col justify-end" style={{ height: 72 }}>
                          <div
                            className="w-full rounded-t-md transition-all duration-500"
                            style={{
                              height: `${Math.max(pct * 100, h.seconds > 0 ? 4 : 0)}%`,
                              background: "#549AF2",
                              opacity: pct > 0.8 ? 1 : 0.3 + pct * 0.7,
                            }}
                            title={`${h.hour}:00 — ${mins} мин`}
                          />
                        </div>
                        {h.hour % 3 === 0 && (
                          <span className="text-[9px] text-[#8A8A99]">{h.hour}:00</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </Card>

          {/* Среднее и лучший день */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4">
              <p className="text-[11px] text-[#8A8A99] mb-1">Среднее за неделю</p>
              <p className="text-xl font-semibold text-[#1A1A2E]">
                {weekAvg}<span className="text-sm text-[#8A8A99]">ч</span>
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-[11px] text-[#8A8A99] mb-1">Лучший день</p>
              <p className="text-xl font-semibold text-[#1A1A2E]">
                {bestDay?.hours ?? 0}<span className="text-sm text-[#8A8A99]">ч</span>
              </p>
              <p className="text-[11px] text-[#8A8A99]">{bestDay?.day}</p>
            </Card>
          </div>

          {/* Streak */}
          <Card className="px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#FFF4E0] flex items-center justify-center text-[#C9921A]">
              <IcoFire />
            </div>
            <div>
              <p className="text-[13px] font-medium text-[#1A1A2E]">
                {streak} {streak === 1 ? "день" : streak < 5 ? "дня" : "дней"} подряд
              </p>
              <p className="text-[11px] text-[#8A8A99]">Выполняю дневную цель</p>
            </div>
          </Card>
        </div>
      )}

      {/* Goal sheet */}
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [recentlyCompleted, setRecentlyCompleted] = useState<string | null>(null);
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

  const newGoal = (): Partial<Goal> => ({
    title: "", description: "", deadline: null, priority: "medium", group: group === "all" ? "today" : group, scheduledFor: selectedDate, subtasks: [], recurring: "none",
  });
  const [draft, setDraft] = useState<Partial<Goal>>(newGoal());
  const [newSubtask, setNewSubtask] = useState("");

  const matchesSelectedDate = (goal: Goal) => {
    if (goal.group === "longterm") return true;
    if (goal.group === "week") {
      const createdKey = goal.createdAt ?? goal.scheduledFor ?? selectedDate;
      const { start, end } = getWeekBounds(createdKey);
      return selectedDate >= start && selectedDate <= end;
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
  const archivedGoals = data.goals.filter(g => g.archived);
  const sections = group === "all"
    ? GOAL_SECTIONS.map(section => ({
        key: section,
        todos: visibleGoals.filter(g => g.group === section),
        dones: [] as Goal[],
      }))
    : [{ key: group as Exclude<GoalGroup, "all">, todos: activeGoals, dones: [] as Goal[] }];

  const handleComplete = (id: string) => {
    setData(prev => ({
      ...prev,
      goals: prev.goals.map(g =>
        g.id === id
          ? {
              ...g,
              completed: true,
              completedAt: new Date().toISOString(),
              subtasks: g.subtasks.map(s => ({ ...s, done: true })),
            }
          : g
      ),
    }));
    setRecentlyCompleted(id);
    setTimeout(() => setRecentlyCompleted(null), 4000);
  };

  const handleCompleteFromEditor = () => {
    if (!editingGoalId) return;
    handleComplete(editingGoalId);
    closeGoalEditor();
  };

  const handleUncomplete = (id: string) => {
    setData(prev => ({
      ...prev,
      goals: prev.goals.map(g =>
        g.id === id
          ? {
              ...g,
              completed: false,
              completedAt: null,
              subtasks: g.subtasks.map(s => ({ ...s, done: false })),
            }
          : g
      ),
    }));
  };

  const handleDelete = (id: string) => {
    setData(prev => ({ ...prev, goals: prev.goals.filter(g => g.id !== id) }));
  };

  const handleArchive = (id: string) => {
    setData(prev => ({
      ...prev,
      goals: prev.goals.map(g => g.id === id ? { ...g, archived: true } : g),
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
      const goal: Goal = {
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
      setData(prev => ({ ...prev, goals: [...prev.goals, goal] }));
    }
    closeGoalEditor();
  };

  const addDraftSubtask = () => {
    if (!newSubtask.trim()) return;
    setDraft(d => ({ ...d, subtasks: [...(d.subtasks ?? []), { id: uid(), title: newSubtask.trim(), done: false }] }));
    setNewSubtask("");
  };

  const dateItems = Array.from({ length: 14 }, (_, index) => {
    const day = addDays(new Date(), index);
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

  return (
    <div className="pt-14 pb-6">
      {/* Header */}
      <div className="px-4 mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#1A1A2E]">Цели</h1>
        <button
          onClick={() => setShowArchive(true)}
          className="flex items-center gap-1.5 text-[#8A8A99] text-[13px] active:scale-95 transition-all"
        >
          <IcoArchive />
          <span>Архив</span>
        </button>
      </div>

      <div
        ref={dateStripRef}
        className="px-4 mb-4 overflow-x-auto pb-1 select-none hide-scrollbar"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch", overscrollBehaviorX: "contain" }}
        onWheel={handleDateStripWheel}
        onMouseDown={handleDateStripMouseDown}
      >
        <div className="flex gap-2 min-w-max">
          {dateItems.map(item => (
            <button
              key={item.key}
              onClick={() => setSelectedDate(item.key)}
              className={`flex-shrink-0 min-w-[74px] rounded-2xl border px-3 py-2 text-left transition-all ${selectedDate === item.key ? "border-[#1A1A2E] bg-[#1A1A2E] text-white" : "border-[#ECECE8] bg-white text-[#1A1A2E]"}`}
            >
              <div className="text-[10px] uppercase tracking-[0.2em] opacity-70">{item.short}</div>
              <div className="text-[13px] font-semibold">{item.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Group tabs */}
      <div className="px-4 flex gap-2 mb-5 overflow-x-auto pb-1 hide-scrollbar">
        {(["all", "today", "week", "longterm"] as GoalGroup[]).map(g => (
          <Pill key={g} active={group === g} onClick={() => setGroup(g)}>
            {getGoalGroupLabel(g, selectedDate, todayKey)}
          </Pill>
        ))}
      </div>

      <div className="px-4 space-y-2">

        {sections.every(section => section.todos.length === 0 && section.dones.length === 0) && (
          <EmptyState
            text={`Нет активных целей ${getDateContextLabel(selectedDate, todayKey)}`}
            action="Добавить цель"
            onAction={() => openGoalEditor()}
          />
        )}

        {sections.map(section => (
          <div key={section.key} className="space-y-2">
            {group === "all" && (
              <div className="pt-2">
                <SectionLabel>{getGoalGroupLabel(section.key, selectedDate, todayKey)}</SectionLabel>
              </div>
            )}
            {section.todos.map(goal => (
              <GoalCard
                key={goal.id}
                goal={goal}
                expanded={expandedId === goal.id}
                onToggleExpand={() => setExpandedId(expandedId === goal.id ? null : goal.id)}
                onEdit={() => openGoalEditor(goal)}
                onToggleComplete={goal.completed ? handleUncomplete : handleComplete}
                onComplete={handleComplete}
                onDelete={handleDelete}
                onArchive={handleArchive}
                onToggleSubtask={handleToggleSubtask}
                overdue={isOverdueWeekGoal(goal)}
              />
            ))}
              </div>
        ))}
      </div>

      {/* FAB */}
      <button
        onClick={() => openGoalEditor()}
        className="fixed bottom-24 right-5 w-14 h-14 bg-[#1A1A2E] rounded-2xl flex items-center justify-center text-white shadow-lg active:scale-95 transition-all z-10"
        style={{ boxShadow: "0 4px 16px rgba(26,26,46,0.25)" }}
      >
        <IcoPlus size={24} />
      </button>

      {/* Goal editor sheet */}
      <BottomSheet open={showAddSheet} onClose={closeGoalEditor} title={editingGoalId ? "Редактировать цель" : "Новая цель"}>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-[12px] text-[#8A8A99] font-medium block mb-1.5">Название</label>
            <input
              autoFocus
              className="w-full bg-[#F0F0EE] rounded-xl px-4 py-3 text-[#1A1A2E] text-[15px] outline-none placeholder:text-[#C0C0C0]"
              placeholder="Чего вы хотите достичь?"
              value={draft.title ?? ""}
              onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-[12px] text-[#8A8A99] font-medium block mb-1.5">Описание (необязательно)</label>
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
            <div className="flex gap-2">
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
                    <button onClick={() => setData(prev => ({ ...prev, goals: prev.goals.map(goal => goal.id === g.id ? { ...goal, archived: false } : goal) }))} className="px-2 py-1 rounded-lg bg-[#E8F5EE] text-[#2D7D46] text-[11px]">Вернуть</button>
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

function GoalCard({
  goal, expanded, overdue, onToggleExpand, onEdit, onToggleComplete, onComplete, onDelete, onArchive, onToggleSubtask,
}: {
  goal: Goal;
  expanded: boolean;
  overdue?: boolean;
  onToggleExpand: () => void;
  onEdit: (goal: Goal) => void;
  onToggleComplete: (id: string) => void;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
  onToggleSubtask: (goalId: string, subId: string) => void;
}) {
  const [sliderValue, setSliderValue] = useState<number[]>([0]);
  const [completePulse, setCompletePulse] = useState(false);
  const [isSliding, setIsSliding] = useState(false);
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
      className="relative rounded-2xl overflow-hidden notebook-grid"
      style={{
        backgroundColor: overdue ? "#FFF4F4" : "#F7F7F5",
        boxShadow: overdue ? "0 2px 10px rgba(217,64,64,0.08)" : "0 2px 8px rgba(0,0,0,0.04)",
        border: overdue ? "1px solid rgba(217, 64, 64, 0.18)" : "1px solid transparent",
      }}
    >
      <div className="relative z-10">
        <div className="px-4 py-3.5 cursor-pointer" onClick={() => onEdit(goal)}>
          <div className="flex items-start gap-3">
            {/* Non-clickable status circle now rendered next to title in a badge */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="inline-flex items-center gap-3 rounded-full px-3 py-1 task-badge min-w-0 max-w-full" style={{ backgroundColor: "#549AF2" }}>
                    <div className="w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all border-white bg-white">
                      {goal.completed ? <IcoCheck size={16} strokeWidth={3} className="text-[#549AF2]" /> : null}
                    </div>
                    <p className={`flex-1 min-w-0 truncate text-[14px] font-medium leading-snug text-white transition-all ${goal.completed ? "line-through decoration-white/80 text-white/80" : "text-white"}`}>{goal.title}</p>
                  </div>
                  {goal.description?.trim() && (
                    <p className="text-[12px] text-[#8A8A99] mt-1 leading-snug">{goal.description}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ backgroundColor: `${accentColor}15`, color: accentColor }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: accentColor }} />
                      {overdue ? "Просрочено" : PRIORITY_LABELS[goal.priority]}
                    </span>
                    {goal.deadline && (
                      <span className="text-[11px] text-[#8A8A99]">до {new Date(goal.deadline).toLocaleDateString("ru", { day: "numeric", month: "short" })}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {goal.completed ? (
                    <button
                      onPointerDown={e => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); onToggleComplete(goal.id); }}
                      className="px-3 py-1 rounded-full bg-[#549AF2] text-white text-[11px] font-semibold transition-all active:scale-95"
                    >
                      Вернуть
                    </button>
                  ) : null}
                  <button
                    onPointerDown={e => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onArchive(goal.id); }}
                    className="text-[#8A8A99] p-1.5 rounded-lg bg-[#F0F0EE] active:scale-95 transition-all"
                  >
                    <IcoArchive />
                  </button>
                  <button
                    onPointerDown={e => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onDelete(goal.id); }}
                    className="text-[#D94040] p-1.5 rounded-lg bg-[#FDE8E8] active:scale-95 transition-all"
                  >
                    <IcoTrash />
                  </button>
                </div>
              </div>
              {goal.subtasks.length > 0 && (
                <div className="mt-2.5">
                  <ProgressBar value={progress} max={100} height={3} />
                  <p className="text-[11px] text-[#8A8A99] mt-1">{goal.subtasks.filter(s => s.done).length} из {goal.subtasks.length}</p>
                  <div className="mt-2 space-y-4">
                    {goal.subtasks.map(s => (
                      <div key={s.id} className="rounded-2xl border border-[#E5E7EB] bg-white/95 p-3 shadow-sm">
                        <button
                          onPointerDown={e => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); onToggleSubtask(goal.id, s.id); }}
                          className="relative w-full text-center active:scale-[0.99] transition-all"
                        >
                          <div className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border flex items-center justify-center ${s.done ? "border-[#1A1A2E]" : "border-[#D0D0D0]"}`}>
                            {s.done && <IcoCheck size={10} className="text-[#1A1A2E]" />}
                          </div>
                          <span className={`block w-full truncate text-[13px] ${s.done ? "text-[#8A8A99] line-through" : "text-[#1A1A2E]"}`}>{s.title}</span>
                        </button>

                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Slider for completion */}
        <div className="px-4 pb-3 pt-1" onClick={e => e.stopPropagation()}>
          <div
            className={`mb-1.5 relative overflow-hidden transition-[max-height,opacity] duration-300 ${goal.completed ? "max-h-0 opacity-0" : "max-h-32 opacity-100"}`}
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
    <div className="pt-14 pb-6">
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
  const [draft, setDraft] = useState<Partial<Habit>>({ name: "", icon: "none", dailyCost: 0, relapses: [], notes: "" });

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(id);
  }, []);

  const addHabit = () => {
    if (!draft.name?.trim()) return;
    const habit: Habit = {
      id: uid(),
      name: draft.name.trim(),
      icon: draft.icon ?? "none",
      dailyCost: draft.dailyCost ?? 0,
      relapses: draft.relapses ?? [],
      notes: draft.notes ?? "",
    };
    setData(prev => ({ ...prev, habits: [...prev.habits, habit] }));
    setDraft({ name: "", icon: "none", dailyCost: 0, relapses: [], notes: "" });
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

  return (
    <div className="pt-14 pb-6">
      <div className="px-4 mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#1A1A2E]">Привычки</h1>
        <button
          onClick={() => setShowAddSheet(true)}
          className="w-9 h-9 rounded-xl bg-[#1A1A2E] flex items-center justify-center text-white active:scale-95 transition-all"
        >
          <IcoPlus size={18} />
        </button>
      </div>

      <div className="px-4 space-y-3">
        {data.habits.length === 0 ? (
          <EmptyState
            text="Добавьте привычку, от которой хотите отказаться, и отслеживайте прогресс"
            action="Добавить привычку"
            onAction={() => setShowAddSheet(true)}
          />
        ) : (
          data.habits.map(habit => (
            <HabitCard
              key={habit.id}
              habit={habit}
              now={now}
              expanded={expandedId === habit.id}
              onToggleExpand={() => setExpandedId(expandedId === habit.id ? null : habit.id)}
              onRelapse={addRelapse}
              onDelete={deleteHabit}
            />
          ))
        )}
      </div>

      <BottomSheet open={showAddSheet} onClose={() => setShowAddSheet(false)} title="Новая привычка">
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-[12px] text-[#8A8A99] block mb-1.5">Название</label>
            <input
              className="w-full bg-[#F0F0EE] rounded-xl px-4 py-3 text-[#1A1A2E] text-[14px] outline-none placeholder:text-[#C0C0C0]"
              placeholder="Например: курение"
              value={draft.name ?? ""}
              onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-[12px] text-[#8A8A99] block mb-2">Иконка</label>
            <div className="flex gap-2 flex-wrap">
              {HABIT_ICON_KEYS.map(key => (
                <button
                  key={key}
                  onClick={() => setDraft(d => ({ ...d, icon: key }))}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-95 ${
                    draft.icon === key ? "bg-[#1A1A2E] text-white" : "bg-[#F0F0EE] text-[#8A8A99]"
                  }`}
                >
                  {HabitIconSvg[key]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[12px] text-[#8A8A99] block mb-1.5">Ежедневные траты (₽/день)</label>
            <input
              type="number"
              className="w-full bg-[#F0F0EE] rounded-xl px-4 py-3 text-[#1A1A2E] text-[14px] outline-none"
              placeholder="0"
              value={draft.dailyCost || ""}
              onChange={e => setDraft(d => ({ ...d, dailyCost: parseFloat(e.target.value) || 0 }))}
            />
          </div>

          <div>
            <label className="text-[12px] text-[#8A8A99] block mb-1.5">Время последнего срыва (если был)</label>
            <input
              type="datetime-local"
              className="w-full bg-[#F0F0EE] rounded-xl px-4 py-2.5 text-[#1A1A2E] text-[13px] outline-none"
              onChange={e => {
                if (!e.target.value) return;
                setDraft(d => ({
                  ...d,
                  relapses: [{ id: uid(), timestamp: new Date(e.target.value).toISOString() }],
                }));
              }}
            />
          </div>

          <div>
            <label className="text-[12px] text-[#8A8A99] block mb-1.5">Заметки</label>
            <textarea
              className="w-full bg-[#F0F0EE] rounded-xl px-4 py-3 text-[#1A1A2E] text-[14px] outline-none resize-none placeholder:text-[#C0C0C0]"
              rows={2}
              placeholder="Мотивация, триггеры…"
              value={draft.notes ?? ""}
              onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
            />
          </div>

          <button
            onClick={addHabit}
            disabled={!draft.name?.trim()}
            className="w-full py-3 bg-[#1A1A2E] text-white rounded-xl font-medium active:scale-95 transition-all disabled:opacity-40"
          >
            Добавить
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}

function HabitCard({
  habit, now, expanded, onToggleExpand, onRelapse, onDelete,
}: {
  habit: Habit;
  now: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onRelapse: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [swipeX, setSwipeX] = useState(0);
  const startX = useRef(0);
  const [relapseConfirmed, setRelapseConfirmed] = useState(false);

  const sortedRelapses = [...habit.relapses].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const lastRelapseTime = sortedRelapses.length > 0
    ? new Date(sortedRelapses[sortedRelapses.length - 1].timestamp).getTime()
    : null;

  const elapsed = lastRelapseTime !== null ? now - lastRelapseTime : now - (now - 86400000 * 7);
  const bestStreakMs = getBestStreak(habit.relapses);
  const currentStreakMs = lastRelapseTime !== null ? now - lastRelapseTime : elapsed;
  const streakPct = bestStreakMs > 0 ? Math.min(currentStreakMs / bestStreakMs, 1) : 1;

  const daysSaved = elapsed / 86400000;
  const moneySaved = Math.round(daysSaved * habit.dailyCost);

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    const dx = Math.max(0, e.touches[0].clientX - startX.current);
    setSwipeX(Math.min(dx, 200));
  };
  const handleTouchEnd = () => {
    if (swipeX > 140) {
      onRelapse(habit.id);
      setRelapseConfirmed(true);
      setTimeout(() => setRelapseConfirmed(false), 2000);
    }
    setSwipeX(0);
  };

  // Pattern: count by day of week
  const dayOfWeekCounts = Array(7).fill(0);
  for (const r of habit.relapses) {
    dayOfWeekCounts[new Date(r.timestamp).getDay()]++;
  }
  const dayNames = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

  return (
    <Card className="overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-[#EBEBEA] flex items-center justify-center text-[#1A1A2E] flex-shrink-0">
            {HabitIconSvg[habit.icon] ?? HabitIconSvg.none}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-[#1A1A2E]">{habit.name}</p>
            <p className="text-[22px] font-semibold text-[#1A1A2E] leading-tight mt-0.5 font-mono tabular-nums">
              {formatTimerLong(elapsed)}
            </p>
          </div>
          <button
            onClick={onToggleExpand}
            className="text-[#C0C0C0] p-1 active:scale-95 transition-all"
          >
            {expanded ? <IcoChevronDown /> : <IcoChevronRight />}
          </button>
        </div>

        {/* Streak bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-[#8A8A99]">Текущая / рекорд</span>
            <span className="text-[11px] text-[#8A8A99]">{formatTimerLong(bestStreakMs)}</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-[#EBEBEA] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${streakPct * 100}%`, background: "#1A1A2E" }}
            />
          </div>
        </div>

        {/* Money saved */}
        {habit.dailyCost > 0 && (
          <div className="flex items-center gap-3 p-2.5 bg-[#E8F5EE] rounded-xl">
            <div>
              <p className="text-[11px] text-[#2D7D46]">Сэкономлено</p>
              <p className="text-[16px] font-semibold text-[#2D7D46]">{moneySaved.toLocaleString("ru")} ₽</p>
              <p className="text-[10px] text-[#2D7D46]">≈ {Math.round(moneySaved / 1500)} посещений кафе</p>
            </div>
          </div>
        )}
      </div>

      {/* Expanded: history + relapse */}
      {expanded && (
        <div className="border-t border-[#F0F0EE] px-4 pb-4 pt-3">
          {/* Relapse button with swipe */}
          {!relapseConfirmed ? (
            <div className="mb-4">
              <p className="text-[12px] text-[#8A8A99] mb-2">Свайп вправо чтобы отметить срыв</p>
              <div
                className="relative h-12 rounded-xl overflow-hidden"
                style={{ background: "#FDE8E8" }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                <div
                  className="absolute inset-y-0 left-0 rounded-xl transition-none"
                  style={{ width: swipeX, background: "#D94040" }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[13px] font-medium text-[#D94040]">
                    {swipeX > 70 ? "Отпустите для подтверждения" : "Сорвался →"}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="mb-4 py-3 rounded-xl bg-[#FDE8E8] text-center">
              <p className="text-[13px] text-[#D94040] font-medium">Срыв зафиксирован. Таймер обнулён.</p>
            </div>
          )}

          {/* Pattern by day */}
          {habit.relapses.length > 0 && (
            <div className="mb-3">
              <SectionLabel>Паттерн срывов по дням</SectionLabel>
              <div className="flex gap-1.5">
                {dayNames.map((d, i) => (
                  <div key={d} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full rounded-lg"
                      style={{
                        height: 32,
                        background: dayOfWeekCounts[i] > 0
                          ? `rgba(217,64,64,${Math.min(dayOfWeekCounts[i] / Math.max(...dayOfWeekCounts), 1) * 0.7 + 0.1})`
                          : "#F0F0EE",
                      }}
                    />
                    <span className="text-[10px] text-[#8A8A99]">{d}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Last relapses */}
          {sortedRelapses.length > 0 && (
            <div>
              <SectionLabel>История срывов</SectionLabel>
              <div className="space-y-1">
                {sortedRelapses.slice(-5).reverse().map(r => (
                  <div key={r.id} className="flex items-center justify-between py-1.5 border-b border-[#F0F0EE] last:border-none">
                    <span className="text-[12px] text-[#8A8A99]">
                      {new Date(r.timestamp).toLocaleDateString("ru", { day: "numeric", month: "short" })}
                    </span>
                    <span className="text-[12px] text-[#8A8A99]">
                      {new Date(r.timestamp).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => onDelete(habit.id)}
            className="mt-3 flex items-center gap-1.5 text-[#D94040] text-[12px] active:scale-95 transition-all"
          >
            <IcoTrash />
            Удалить привычку
          </button>
        </div>
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
  const [telegramStatus, setTelegramStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "ok" | "error">("idle");

  const save = () => {
    setData(prev => ({ ...prev, settings: { ...form } }));
    onClose();
  };

  const testTelegram = async () => {
    setTelegramStatus("testing");
    const ok = await telegramSend(form.telegramToken, form.chatId, "Тест подключения от LifePWA");
    setTelegramStatus(ok ? "ok" : "error");
    setTimeout(() => setTelegramStatus("idle"), 3000);
  };

  const syncNow = async () => {
    if (!form.telegramToken || !form.chatId) return;
    setSyncStatus("syncing");
    const ok = await telegramSend(form.telegramToken, form.chatId, "#DATA_SYNC " + JSON.stringify(data));
    setSyncStatus(ok ? "ok" : "error");
    setTimeout(() => setSyncStatus("idle"), 3000);
  };

  const loadFromTelegram = async () => {
    if (!form.telegramToken) return;
    setSyncStatus("syncing");
    const loaded = await telegramLoad(form.telegramToken);
    if (loaded) {
      setData(() => loaded);
      setSyncStatus("ok");
    } else {
      setSyncStatus("error");
    }
    setTimeout(() => setSyncStatus("idle"), 3000);
  };

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
    <div className="fixed inset-0 z-40 bg-white flex flex-col">
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

        {/* Telegram */}
        <section>
          <SectionLabel>Telegram синхронизация</SectionLabel>
          <div className="space-y-3">
            {field("Bot Token", "telegramToken", "password", "123456789:ABCdef…")}
            {field("Chat ID", "chatId", "text", "Ваш Telegram ID")}
            <div className="flex gap-2">
              <button
                onClick={testTelegram}
                disabled={!form.telegramToken || !form.chatId}
                className="flex-1 py-2.5 border border-[#D0D0D0] rounded-xl text-[13px] text-[#1A1A2E] font-medium active:scale-95 transition-all disabled:opacity-40"
              >
                {telegramStatus === "testing" ? "Проверка…" : telegramStatus === "ok" ? "Подключено" : telegramStatus === "error" ? "Ошибка" : "Проверить"}
              </button>
              <button
                onClick={syncNow}
                disabled={!form.telegramToken || !form.chatId}
                className="flex-1 py-2.5 border border-[#D0D0D0] rounded-xl text-[13px] text-[#1A1A2E] font-medium active:scale-95 transition-all disabled:opacity-40"
              >
                {syncStatus === "syncing" ? "…" : syncStatus === "ok" ? "Сохранено" : syncStatus === "error" ? "Ошибка" : "Синхронизировать"}
              </button>
            </div>
            <button
              onClick={loadFromTelegram}
              disabled={!form.telegramToken}
              className="w-full py-2.5 border border-dashed border-[#D0D0D0] rounded-xl text-[13px] text-[#8A8A99] active:scale-95 transition-all disabled:opacity-40"
            >
              Загрузить данные из Telegram
            </button>
            <p className="text-[11px] text-[#8A8A99] leading-relaxed">
              Данные сохраняются в Telegram как сообщения с меткой #DATA_SYNC. Создайте бота через @BotFather и отправьте себе любое сообщение для получения Chat ID.
            </p>
          </div>
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
  { id: "habits",    label: "Привычки" },
];

const NOTCH_R = 28;
const NOTCH_CURVE = 23;
const NAV_H = 74;

function buildPath(cx: number, w: number): string {
  const l = cx - NOTCH_R - NOTCH_CURVE;
  const r = cx + NOTCH_R + NOTCH_CURVE;

  return [
    `M 0 0`,
    `L ${l} 0`,
    `Q ${cx - NOTCH_R} 0 ${cx - NOTCH_R} ${NOTCH_R}`,
    `A ${NOTCH_R} ${NOTCH_R * 0.6} 0 0 0 ${cx + NOTCH_R} ${NOTCH_R}`,
    `Q ${cx + NOTCH_R} 0 ${r} 0`,
    `L ${w} 0`,
    `L ${w} ${NAV_H}`,
    `L 0 ${NAV_H}`,
    `Z`,
  ].join(" ");
}

export function BottomNav({
  active,
  onChange,
}: {
  active: AppTab;
  onChange: (t: AppTab) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(390);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const activeIndex = TABS.findIndex((t) => t.id === active);
  const cx = (activeIndex + 0.5) * (width / TABS.length);
  const path = buildPath(cx, width);

  return (
    <div
      ref={containerRef}
      className="fixed bottom-0 left-0 right-0 z-30"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* SVG-панель с выемкой */}
      <svg
        width="100%"
        height={NAV_H}
        viewBox={`0 0 ${width} ${NAV_H}`}
        preserveAspectRatio="none"
        className="absolute bottom-0 left-0"
        style={{ overflow: "visible" }}
      >
        <path
          d={path}
          fill="#549af2"
          style={{ transition: "d 0.4s cubic-bezier(0.34,1.2,0.64,1)" }}
        />
      </svg>

      {/* Кнопки */}
      <div className="relative z-10 flex" style={{ height: NAV_H }}>
        {TABS.map((tab, i) => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className="flex flex-1 items-center justify-center"
              style={{ height: NAV_H }}
            >
              <span
                className={`
                  flex h-11 w-11 items-center justify-center rounded-full
                  transition-all duration-400
                  ${isActive
                    ? "bg-white text-[#549af2] -translate-y-7 shadow-lg ring-1 ring-[#549af2]"
                    : "bg-transparent text-white/90"
                  }
                `}
                style={{
                  transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)",
                }}
              >
                {/* твои иконки */}
                {tab.id === "home"      && <IcoHome      active={isActive} />}
                {tab.id === "work"      && <IcoWork      active={isActive} />}
                {tab.id === "goals"     && <IcoTarget    active={isActive} />}
                {tab.id === "nutrition" && <IcoLeaf      active={isActive} />}
                {tab.id === "habits"    && <IcoChain     active={isActive} />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════

export default function App() {
  const [data, setDataRaw] = useState<AppData>(loadData);
  const [activeTab, setActiveTab] = useState<AppTab>("home");
  const [showSettings, setShowSettings] = useState(false);
  const [shimmerActive, setShimmerActive] = useState(false);

  const setData = useCallback((fn: (prev: AppData) => AppData) => {
    setDataRaw(prev => {
      const next = fn(prev);
      saveData(next);
      // Fire-and-forget Telegram sync on each change
      if (next.settings.telegramToken && next.settings.chatId) {
        telegramSend(next.settings.telegramToken, next.settings.chatId, "#DATA_SYNC " + JSON.stringify(next));
      }
      return next;
    });
  }, []);

  // Check if first launch (no user name)
  const isFirstLaunch = !data.settings.telegramToken && !data.settings.userName;

  useEffect(() => {
    if (isFirstLaunch) setShowSettings(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Global shimmer sync: briefly enable shimmer on root every 8s
  useEffect(() => {
    let intervalId: number | null = null;
    let startTimeout: number | null = null;
    const activate = () => {
      setShimmerActive(true);
      window.setTimeout(() => setShimmerActive(false), 2400);
    };
    // small initial delay so UI mounts first
    startTimeout = window.setTimeout(() => {
      activate();
      intervalId = window.setInterval(activate, 8000) as unknown as number;
    }, 1200) as unknown as number;

    return () => {
      if (intervalId) window.clearInterval(intervalId);
      if (startTimeout) window.clearTimeout(startTimeout as unknown as number);
    };
  }, []);

  return (
    <div
      className={`w-full bg-white relative overflow-hidden ${shimmerActive ? "shimmer-active" : ""}`}
      style={{ height: "100dvh", maxWidth: 430, margin: "0 auto", fontFamily: "'Inter', sans-serif" }}
    >
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
        className="absolute inset-0 overflow-y-auto overscroll-contain"
        style={{ paddingBottom: "calc(64px + env(safe-area-inset-bottom))" }}
      >
        {activeTab === "home" && (
          <HomeTab data={data} setData={setData} onOpenSettings={() => setShowSettings(true)} />
        )}
        {activeTab === "work" && <WorkTab data={data} setData={setData} />}
        {activeTab === "goals" && <GoalsTab data={data} setData={setData} />}
        {activeTab === "nutrition" && <NutritionTab data={data} setData={setData} />}
        {activeTab === "habits" && <HabitsTab data={data} setData={setData} />}
      </div>

      {/* Bottom nav */}
      {!showSettings && <BottomNav active={activeTab} onChange={setActiveTab} />}
    </div>
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
