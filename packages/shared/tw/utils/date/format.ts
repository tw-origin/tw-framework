/**
 * Date formatting utilities -- production-ready date/time formatters.
 * @module shared/utils/date
 */

export interface DateFormatOptions {
  year?: "numeric" | "2-digit" | "short" | "long";
  month?: "numeric" | "2-digit" | "short" | "long" | "narrow";
  day?: "numeric" | "2-digit";
  hour?: "numeric" | "2-digit";
  minute?: "numeric" | "2-digit";
  second?: "numeric" | "2-digit";
  hour12?: boolean;
  timeZone?: string;
  weekday?: "narrow" | "short" | "long";
  era?: "narrow" | "short" | "long";
  timeZoneName?: "short" | "long" | "shortOffset" | "longOffset";
  fractionalSecondDigits?: 1 | 2 | 3;
}

const DEFAULT_OPTIONS: Required<Omit<DateFormatOptions, "timeZone" | "weekday" | "era" | "timeZoneName" | "fractionalSecondDigits">> = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getCachedFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}:${JSON.stringify(options)}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    formatterCache.set(key, formatter);
    if (formatterCache.size > 100) {
      const firstKey = formatterCache.keys().next().value;
      if (firstKey) formatterCache.delete(firstKey);
    }
  }
  return formatter;
}

export function formatDate(
  date: Date | number | string,
  locale: string = "en-IN",
  options: DateFormatOptions = {},
): string {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "Invalid Date";
  const merged = { ...DEFAULT_OPTIONS, ...options } as Intl.DateTimeFormatOptions;
  return getCachedFormatter(locale, merged).format(d);
}

export function formatDateShort(date: Date | number | string, locale: string = "en-IN"): string {
  return formatDate(date, locale, { year: "numeric", month: "short", day: "numeric", hour: undefined, minute: undefined, second: undefined });
}

export function formatDateLong(date: Date | number | string, locale: string = "en-IN"): string {
  return formatDate(date, locale, { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: undefined, minute: undefined, second: undefined });
}

export function formatTime(date: Date | number | string, locale: string = "en-IN", hour12: boolean = false): string {
  return formatDate(date, locale, { year: undefined, month: undefined, day: undefined, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12 });
}

export function formatRelative(date: Date | number | string, locale: string = "en"): string {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "Invalid Date";
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const now = Date.now();
  const diff = d.getTime() - now;
  const absDiff = Math.abs(diff);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 365 * 24 * 60 * 60 * 1000],
    ["month", 30 * 24 * 60 * 60 * 1000],
    ["week", 7 * 24 * 60 * 60 * 1000],
    ["day", 24 * 60 * 60 * 1000],
    ["hour", 60 * 60 * 1000],
    ["minute", 60 * 1000],
    ["second", 1000],
  ];
  for (const [unit, ms] of units) {
    if (absDiff >= ms || unit === "second") {
      return rtf.format(Math.round(diff / ms), unit);
    }
  }
  return rtf.format(0, "second");
}

export function formatDuration(ms: number): string {
  if (ms < 0) return "-" + formatDuration(-ms);
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h ${m % 60}m`;
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function startOfWeek(date: Date, weekStartsOn: number = 1): Date {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

export function endOfWeek(date: Date, weekStartsOn: number = 1): Date {
  const d = startOfWeek(date, weekStartsOn);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function startOfMonth(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  return d;
}

export function endOfMonth(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1);
}

export function endOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function addYears(date: Date, years: number): Date {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

export function addHours(date: Date, hours: number): Date {
  const d = new Date(date);
  d.setHours(d.getHours() + hours);
  return d;
}

export function addMinutes(date: Date, minutes: number): Date {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() + minutes);
  return d;
}

export function addSeconds(date: Date, seconds: number): Date {
  const d = new Date(date);
  d.setSeconds(d.getSeconds() + seconds);
  return d;
}

export function diffDays(a: Date, b: Date): number {
  const ms = startOfDay(a).getTime() - startOfDay(b).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

export function diffHours(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (60 * 60 * 1000));
}

export function diffMinutes(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (60 * 1000));
}

export function diffSeconds(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 1000);
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function isSameYear(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear();
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

export function isYesterday(date: Date): boolean {
  return isSameDay(date, addDays(new Date(), -1));
}

export function isTomorrow(date: Date): boolean {
  return isSameDay(date, addDays(new Date(), 1));
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

export function weekOfYear(date: Date): number {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / (7 * 24 * 60 * 60 * 1000));
}

export function parseISO(isoString: string): Date {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid ISO date string: ${isoString}`);
  }
  return date;
}

export function toISODate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function toISOTime(date: Date): string {
  return date.toISOString().split("T")[1].split(".")[0];
}

export function fromUnixSeconds(seconds: number): Date {
  return new Date(seconds * 1000);
}

export function fromUnixMs(ms: number): Date {
  return new Date(ms);
}

export function toUnixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

export function toUnixMs(date: Date): number {
  return date.getTime();
}

export function isBetween(date: Date, start: Date, end: Date): boolean {
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

export function clampDate(date: Date, min: Date, max: Date): Date {
  if (date.getTime() < min.getTime()) return new Date(min);
  if (date.getTime() > max.getTime()) return new Date(max);
  return new Date(date);
}

export function eachDay(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const d = startOfDay(start);
  const e = startOfDay(end);
  while (d.getTime() <= e.getTime()) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

export function eachMonth(start: Date, end: Date): Date[] {
  const months: Date[] = [];
  const d = startOfMonth(start);
  const e = startOfMonth(end);
  while (d.getTime() <= e.getTime()) {
    months.push(new Date(d));
    d.setMonth(d.getMonth() + 1);
  }
  return months;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTH_NAMES_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function getMonthName(month: number, short: boolean = false): string {
  const idx = ((month % 12) + 12) % 12;
  return short ? MONTH_NAMES_SHORT[idx] : MONTH_NAMES[idx];
}

export function getDayName(day: number, short: boolean = false): string {
  const idx = ((day % 7) + 7) % 7;
  return short ? DAY_NAMES_SHORT[idx] : DAY_NAMES[idx];
}

export function getMonthNames(short: boolean = false): string[] {
  return short ? [...MONTH_NAMES_SHORT] : [...MONTH_NAMES];
}

export function getDayNames(short: boolean = false): string[] {
  return short ? [...DAY_NAMES_SHORT] : [...DAY_NAMES];
}

export interface DateRange {
  start: Date;
  end: Date;
}

export function createRange(start: Date, end: Date): DateRange {
  if (start.getTime() > end.getTime()) {
    return { start: new Date(end), end: new Date(start) };
  }
  return { start: new Date(start), end: new Date(end) };
}

export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.start.getTime() <= b.end.getTime() && b.start.getTime() <= a.end.getTime();
}

export function rangeContainsDate(range: DateRange, date: Date): boolean {
  return date.getTime() >= range.start.getTime() && date.getTime() <= range.end.getTime();
}

export function rangeDurationDays(range: DateRange): number {
  return diffDays(range.end, range.start) + 1;
}

export function quarter(date: Date): number {
  return Math.floor(date.getMonth() / 3) + 1;
}

export function startOfQuarter(date: Date): Date {
  const q = quarter(date);
  const month = (q - 1) * 3;
  return new Date(date.getFullYear(), month, 1);
}

export function endOfQuarter(date: Date): Date {
  const q = quarter(date);
  const month = q * 3 - 1;
  const d = new Date(date.getFullYear(), month + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function timezoneOffset(date: Date): number {
  return -date.getTimezoneOffset();
}

export function toTimezone(date: Date, timezone: string): string {
  return date.toLocaleString("en-US", { timeZone: timezone });
}

export function ageInYears(birthDate: Date, atDate: Date = new Date()): number {
  let age = atDate.getFullYear() - birthDate.getFullYear();
  const m = atDate.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && atDate.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

export function isExpired(date: Date, now: Date = new Date()): boolean {
  return date.getTime() < now.getTime();
}

export function timeUntil(date: Date, now: Date = new Date()): number {
  return date.getTime() - now.getTime();
}

export function timeSince(date: Date, now: Date = new Date()): number {
  return now.getTime() - date.getTime();
}
