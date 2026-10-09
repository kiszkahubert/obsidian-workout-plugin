import { RangeKey } from "./types";

export function uid(): string {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function pad(n: number): string {
	return n < 10 ? `0${n}` : `${n}`;
}

export function toISODate(d: Date): string {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(): string {
	return toISODate(new Date());
}

export function parseISODate(s: string): Date {
	const [y, m, d] = s.split("-").map(Number);
	return new Date(y, (m || 1) - 1, d || 1);
}

export function dateToTime(s: string): number {
	return parseISODate(s).getTime();
}

export function formatDate(s: string, withYear = true): string {
	return parseISODate(s).toLocaleDateString(undefined, {
		year: withYear ? "numeric" : undefined,
		month: "short",
		day: "numeric",
	});
}

export function formatTimeOfDay(ms: number): string {
	return new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** Seconds → "m:ss" or "h:mm:ss". */
export function formatDuration(totalSeconds: number): string {
	const s = Math.max(0, Math.round(totalSeconds));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Accepts "90", "1:30" or "1:02:03"; returns seconds. */
export function parseDuration(text: string): number | undefined {
	const t = text.trim();
	if (!t) return undefined;
	const parts = t.split(":").map((p) => Number(p.replace(",", ".")));
	if (parts.some((p) => !isFinite(p) || p < 0)) return undefined;
	return Math.round(parts.reduce((acc, p) => acc * 60 + p, 0));
}

export function parseNum(text: string): number | undefined {
	const t = text.trim().replace(",", ".");
	if (!t) return undefined;
	const n = Number(t);
	return isFinite(n) ? n : undefined;
}

export function formatNumber(n: number, maxDecimals = 1): string {
	const f = Math.pow(10, maxDecimals);
	return (Math.round(n * f) / f).toLocaleString(undefined, { maximumFractionDigits: maxDecimals });
}

export function formatKg(n: number): string {
	return `${formatNumber(n)} kg`;
}

export const RANGE_LABELS: Record<RangeKey, string> = {
	"1m": "1M",
	"3m": "3M",
	"6m": "6M",
	"1y": "1Y",
	all: "All",
};

export function isRangeKey(s: string): s is RangeKey {
	return s in RANGE_LABELS;
}

/** Start timestamp (inclusive) for a range, or null for "all". */
export function rangeStart(range: RangeKey): number | null {
	const months: Record<RangeKey, number> = { "1m": 1, "3m": 3, "6m": 6, "1y": 12, all: 0 };
	if (range === "all") return null;
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	d.setMonth(d.getMonth() - months[range]);
	return d.getTime();
}

export function inRange(date: string, range: RangeKey): boolean {
	const start = rangeStart(range);
	return start === null || dateToTime(date) >= start;
}

export function startOfWeek(d: Date, mondayFirst: boolean): Date {
	const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
	const day = r.getDay();
	const diff = mondayFirst ? (day + 6) % 7 : day;
	r.setDate(r.getDate() - diff);
	return r;
}

export function sanitizeFileName(s: string): string {
	return s.replace(/[\\/:*?"<>|#^[\]]/g, "").replace(/\s+/g, " ").trim() || "Workout";
}
