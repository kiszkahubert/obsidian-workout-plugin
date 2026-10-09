import { Exercise, ExerciseType, SessionExercise, SetEntry, WorkoutSession } from "./types";
import { dateToTime, formatDuration, formatNumber } from "./utils";

/** Epley estimated one-rep max. */
export function e1rm(weight: number, reps: number): number {
	if (weight <= 0 || reps <= 0) return 0;
	if (reps === 1) return weight;
	return weight * (1 + reps / 30);
}

export function doneSets(se: SessionExercise): SetEntry[] {
	return se.sets.filter((s) => s.done);
}

export interface MetricDef {
	id: string;
	label: string;
	unit: string;
	lowerIsBetter?: boolean;
	compute: (sets: SetEntry[]) => number | null;
	format: (v: number) => string;
}

function maxOf(sets: SetEntry[], f: (s: SetEntry) => number | undefined): number | null {
	let best: number | null = null;
	for (const s of sets) {
		const v = f(s);
		if (v !== undefined && v > 0 && (best === null || v > best)) best = v;
	}
	return best;
}

function sumOf(sets: SetEntry[], f: (s: SetEntry) => number | undefined): number | null {
	let total = 0;
	let any = false;
	for (const s of sets) {
		const v = f(s);
		if (v !== undefined && v > 0) {
			total += v;
			any = true;
		}
	}
	return any ? total : null;
}

const kg = (v: number) => `${formatNumber(v)} kg`;
const reps = (v: number) => `${formatNumber(v, 0)} reps`;
const km = (v: number) => `${formatNumber(v, 2)} km`;
const dur = (v: number) => formatDuration(v);

export const METRICS: Record<ExerciseType, MetricDef[]> = {
	weight_reps: [
		{
			id: "e1rm",
			label: "Estimated 1RM",
			unit: "kg",
			compute: (sets) => maxOf(sets, (s) => e1rm(s.weight ?? 0, s.reps ?? 0)),
			format: kg,
		},
		{
			id: "max_weight",
			label: "Max weight",
			unit: "kg",
			compute: (sets) => maxOf(sets, (s) => ((s.reps ?? 0) > 0 ? s.weight : undefined)),
			format: kg,
		},
		{
			id: "volume",
			label: "Volume (sets × reps × kg)",
			unit: "kg",
			compute: (sets) => sumOf(sets, (s) => (s.weight ?? 0) * (s.reps ?? 0)),
			format: kg,
		},
		{
			id: "best_set",
			label: "Best set (kg × reps)",
			unit: "kg",
			compute: (sets) => maxOf(sets, (s) => (s.weight ?? 0) * (s.reps ?? 0)),
			format: kg,
		},
		{
			id: "total_reps",
			label: "Total reps",
			unit: "reps",
			compute: (sets) => sumOf(sets, (s) => s.reps),
			format: reps,
		},
	],
	bodyweight_reps: [
		{
			id: "max_reps",
			label: "Max reps in a set",
			unit: "reps",
			compute: (sets) => maxOf(sets, (s) => s.reps),
			format: reps,
		},
		{
			id: "total_reps",
			label: "Total reps",
			unit: "reps",
			compute: (sets) => sumOf(sets, (s) => s.reps),
			format: reps,
		},
	],
	time: [
		{
			id: "max_duration",
			label: "Longest set",
			unit: "time",
			compute: (sets) => maxOf(sets, (s) => s.duration),
			format: dur,
		},
		{
			id: "total_duration",
			label: "Total time",
			unit: "time",
			compute: (sets) => sumOf(sets, (s) => s.duration),
			format: dur,
		},
	],
	cardio: [
		{
			id: "distance",
			label: "Distance",
			unit: "km",
			compute: (sets) => sumOf(sets, (s) => s.distance),
			format: km,
		},
		{
			id: "duration",
			label: "Duration",
			unit: "time",
			compute: (sets) => sumOf(sets, (s) => s.duration),
			format: dur,
		},
		{
			id: "pace",
			label: "Pace (min/km)",
			unit: "time",
			lowerIsBetter: true,
			compute: (sets) => {
				const d = sumOf(sets, (s) => (s.duration && s.distance ? s.distance : undefined));
				const t = sumOf(sets, (s) => (s.duration && s.distance ? s.duration : undefined));
				return d && t ? t / d : null;
			},
			format: (v) => `${formatDuration(v)} /km`,
		},
	],
};

export function metricsFor(type: ExerciseType): MetricDef[] {
	return METRICS[type];
}

export function findMetric(type: ExerciseType, id: string | undefined): MetricDef {
	const list = METRICS[type];
	return list.find((m) => m.id === id) ?? list[0];
}

export function compareSessions(a: WorkoutSession, b: WorkoutSession): number {
	return dateToTime(a.date) - dateToTime(b.date) || a.startedAt - b.startedAt;
}

export function sortedSessions(sessions: WorkoutSession[]): WorkoutSession[] {
	return [...sessions].sort(compareSessions);
}

export interface ExerciseOccurrence {
	session: WorkoutSession;
	sets: SetEntry[];
}

/** Chronological list of sessions in which the exercise has at least one completed set. */
export function exerciseHistory(sessions: WorkoutSession[], exerciseId: string): ExerciseOccurrence[] {
	const out: ExerciseOccurrence[] = [];
	for (const session of sortedSessions(sessions)) {
		const sets = session.exercises
			.filter((e) => e.exerciseId === exerciseId)
			.flatMap((e) => doneSets(e));
		if (sets.length) out.push({ session, sets });
	}
	return out;
}

export interface MetricPoint {
	t: number;
	date: string;
	value: number;
	sessionId: string;
	pr: boolean;
}

/** One point per session; `pr` marks a session that beat every earlier one. */
export function metricSeries(
	sessions: WorkoutSession[],
	exerciseId: string,
	metric: MetricDef
): MetricPoint[] {
	const points: MetricPoint[] = [];
	let best: number | null = null;
	for (const occ of exerciseHistory(sessions, exerciseId)) {
		const value = metric.compute(occ.sets);
		if (value === null) continue;
		const better = best !== null && (metric.lowerIsBetter ? value < best : value > best);
		if (best === null || better) best = value;
		points.push({
			t: dateToTime(occ.session.date),
			date: occ.session.date,
			value,
			sessionId: occ.session.id,
			pr: better,
		});
	}
	return points;
}

/** Last completed sets of an exercise, optionally only from sessions before `before`. */
export function lastSets(
	sessions: WorkoutSession[],
	exerciseId: string,
	before?: WorkoutSession
): SetEntry[] {
	const hist = exerciseHistory(sessions, exerciseId).filter(
		(o) => !before || (o.session.id !== before.id && compareSessions(o.session, before) < 0)
	);
	return hist.length ? hist[hist.length - 1].sets : [];
}

/* ---------- Set-level personal records ---------- */

interface Bests {
	weight: number;
	e1rm: number;
	reps: number;
	duration: number;
	distance: number;
}

const emptyBests = (): Bests => ({ weight: 0, e1rm: 0, reps: 0, duration: 0, distance: 0 });

function absorb(b: Bests, s: SetEntry, type: ExerciseType) {
	if (type === "weight_reps") {
		if ((s.reps ?? 0) > 0) b.weight = Math.max(b.weight, s.weight ?? 0);
		b.e1rm = Math.max(b.e1rm, e1rm(s.weight ?? 0, s.reps ?? 0));
	}
	b.reps = Math.max(b.reps, s.reps ?? 0);
	b.duration = Math.max(b.duration, s.duration ?? 0);
	b.distance = Math.max(b.distance, s.distance ?? 0);
}

function setRecords(s: SetEntry, type: ExerciseType, b: Bests): string[] {
	const out: string[] = [];
	switch (type) {
		case "weight_reps":
			if ((s.reps ?? 0) > 0 && (s.weight ?? 0) > b.weight) out.push("Weight");
			if (e1rm(s.weight ?? 0, s.reps ?? 0) > b.e1rm) out.push("e1RM");
			break;
		case "bodyweight_reps":
			if ((s.reps ?? 0) > b.reps) out.push("Reps");
			break;
		case "time":
			if ((s.duration ?? 0) > b.duration) out.push("Time");
			break;
		case "cardio":
			if ((s.distance ?? 0) > b.distance) out.push("Distance");
			break;
	}
	return out;
}

/**
 * Personal records set within `session`, keyed "exerciseIndex:setIndex".
 * A set counts only when it beats all earlier sessions *and* earlier sets of this session.
 * The very first time an exercise is done never counts as a PR.
 */
export function sessionRecords(
	session: WorkoutSession,
	allSessions: WorkoutSession[],
	exercises: Map<string, Exercise>
): Map<string, string[]> {
	const result = new Map<string, string[]>();
	const earlier = allSessions.filter(
		(s) => s.id !== session.id && compareSessions(s, session) < 0
	);
	const bestsByExercise = new Map<string, { bests: Bests; hasHistory: boolean }>();

	session.exercises.forEach((se, ei) => {
		const ex = exercises.get(se.exerciseId);
		if (!ex) return;
		let entry = bestsByExercise.get(se.exerciseId);
		if (!entry) {
			const bests = emptyBests();
			const hist = exerciseHistory(earlier, se.exerciseId);
			for (const occ of hist) for (const s of occ.sets) absorb(bests, s, ex.type);
			entry = { bests, hasHistory: hist.length > 0 };
			bestsByExercise.set(se.exerciseId, entry);
		}
		se.sets.forEach((s, si) => {
			if (!s.done || !entry) return;
			if (entry.hasHistory) {
				const recs = setRecords(s, ex.type, entry.bests);
				if (recs.length) result.set(`${ei}:${si}`, recs);
			}
			absorb(entry.bests, s, ex.type);
		});
	});
	return result;
}

/* ---------- Session summaries ---------- */

export function sessionVolume(session: WorkoutSession): number {
	let v = 0;
	for (const se of session.exercises)
		for (const s of doneSets(se)) v += (s.weight ?? 0) * (s.reps ?? 0);
	return v;
}

export function sessionSetCount(session: WorkoutSession): number {
	return session.exercises.reduce((n, se) => n + doneSets(se).length, 0);
}

export function sessionDurationMin(session: WorkoutSession): number | null {
	if (!session.finishedAt) return null;
	return Math.max(0, Math.round((session.finishedAt - session.startedAt) / 60000));
}

/** Short human description of a set, e.g. "60 kg × 8" or "1:30". */
export function describeSet(s: SetEntry, type: ExerciseType): string {
	switch (type) {
		case "weight_reps":
			return `${formatNumber(s.weight ?? 0)} kg × ${s.reps ?? 0}`;
		case "bodyweight_reps":
			return (s.weight ?? 0) > 0 ? `${s.reps ?? 0} (+${formatNumber(s.weight ?? 0)} kg)` : `${s.reps ?? 0}`;
		case "time":
			return formatDuration(s.duration ?? 0);
		case "cardio": {
			const parts: string[] = [];
			if (s.distance) parts.push(`${formatNumber(s.distance, 2)} km`);
			if (s.duration) parts.push(formatDuration(s.duration));
			return parts.join(" in ") || "—";
		}
	}
}

/** e.g. "4 × 8–10 @ 60 kg". */
export function describeTarget(t: { sets: number; repsMin?: number; repsMax?: number; weight?: number; duration?: number; distance?: number }, type: ExerciseType): string {
	let reps = "";
	if (t.repsMin && t.repsMax && t.repsMin !== t.repsMax) reps = `${t.repsMin}–${t.repsMax}`;
	else if (t.repsMin || t.repsMax) reps = `${t.repsMin ?? t.repsMax}`;
	switch (type) {
		case "weight_reps":
			return `${t.sets} × ${reps || "?"}${t.weight ? ` @ ${formatNumber(t.weight)} kg` : ""}`;
		case "bodyweight_reps":
			return `${t.sets} × ${reps || "max"}`;
		case "time":
			return `${t.sets} × ${t.duration ? formatDuration(t.duration) : "?"}`;
		case "cardio": {
			const parts: string[] = [];
			if (t.distance) parts.push(`${formatNumber(t.distance, 2)} km`);
			if (t.duration) parts.push(formatDuration(t.duration));
			return `${t.sets} × ${parts.join(" in ") || "?"}`;
		}
	}
}
