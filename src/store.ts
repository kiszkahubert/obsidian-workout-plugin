import { Events, Plugin } from "obsidian";
import {
	BodyweightEntry,
	DEFAULT_SETTINGS,
	Exercise,
	ExerciseTarget,
	SessionExercise,
	SetEntry,
	WorkoutData,
	WorkoutSession,
	WorkoutSettings,
	WorkoutTemplate,
} from "./types";
import { lastSets } from "./stats";
import { todayISO, uid } from "./utils";

const DATA_VERSION = 1;

function emptyData(): WorkoutData {
	return {
		version: DATA_VERSION,
		settings: { ...DEFAULT_SETTINGS },
		exercises: [],
		templates: [],
		sessions: [],
		activeSession: null,
		bodyweight: [],
	};
}

export function cloneDeep<T>(v: T): T {
	return JSON.parse(JSON.stringify(v)) as T;
}

/**
 * Owns all plugin data. `commit()` saves and fires "changed" so views re-render;
 * `persist()` saves silently (used while typing so inputs keep focus).
 */
export class WorkoutStore extends Events {
	data: WorkoutData = emptyData();

	constructor(private plugin: Plugin) {
		super();
	}

	async load(): Promise<void> {
		const raw = (await this.plugin.loadData()) as Partial<WorkoutData> | null;
		const base = emptyData();
		this.data = {
			...base,
			...(raw ?? {}),
			settings: { ...base.settings, ...(raw?.settings ?? {}) },
			version: DATA_VERSION,
		};
	}

	async persist(): Promise<void> {
		await this.plugin.saveData(this.data);
	}

	async commit(): Promise<void> {
		await this.persist();
		this.trigger("changed");
	}

	get settings(): WorkoutSettings {
		return this.data.settings;
	}

	/* ---------- Exercises ---------- */

	exerciseMap(): Map<string, Exercise> {
		return new Map(this.data.exercises.map((e) => [e.id, e]));
	}

	getExercise(id: string): Exercise | undefined {
		return this.data.exercises.find((e) => e.id === id);
	}

	exercisesSorted(): Exercise[] {
		return [...this.data.exercises].sort((a, b) => a.name.localeCompare(b.name));
	}

	findExerciseByName(name: string): Exercise | undefined {
		const n = name.trim().toLowerCase();
		return this.data.exercises.find((e) => e.name.toLowerCase() === n);
	}

	/** Number of logged sessions that contain the exercise (active session included). */
	exerciseUsage(id: string): number {
		const sessions = [...this.data.sessions];
		if (this.data.activeSession) sessions.push(this.data.activeSession);
		return sessions.filter((s) => s.exercises.some((e) => e.exerciseId === id)).length;
	}

	async saveExercise(ex: Exercise): Promise<void> {
		const i = this.data.exercises.findIndex((e) => e.id === ex.id);
		if (i >= 0) this.data.exercises[i] = ex;
		else this.data.exercises.push(ex);
		await this.commit();
	}

	/** Only exercises without logged history can be deleted; they are also removed from templates. */
	async deleteExercise(id: string): Promise<void> {
		this.data.exercises = this.data.exercises.filter((e) => e.id !== id);
		for (const t of this.data.templates) t.exercises = t.exercises.filter((e) => e.exerciseId !== id);
		await this.commit();
	}

	/* ---------- Templates ---------- */

	getTemplate(id: string): WorkoutTemplate | undefined {
		return this.data.templates.find((t) => t.id === id);
	}

	templatesSorted(): WorkoutTemplate[] {
		return [...this.data.templates].sort((a, b) => a.name.localeCompare(b.name));
	}

	async saveTemplate(t: WorkoutTemplate): Promise<void> {
		const i = this.data.templates.findIndex((x) => x.id === t.id);
		if (i >= 0) this.data.templates[i] = t;
		else this.data.templates.push(t);
		await this.commit();
	}

	async deleteTemplate(id: string): Promise<void> {
		this.data.templates = this.data.templates.filter((t) => t.id !== id);
		await this.commit();
	}

	/* ---------- Sessions ---------- */

	/** Builds sets for an exercise, pre-filled from the last time it was done, falling back to the target. */
	buildSessionExercise(exerciseId: string, target?: ExerciseTarget): SessionExercise {
		const last = lastSets(this.data.sessions, exerciseId);
		const count = target?.sets ?? (last.length || 3);
		const sets: SetEntry[] = [];
		for (let i = 0; i < count; i++) {
			const src = last[i] ?? last[last.length - 1];
			if (src) {
				sets.push({
					weight: src.weight,
					reps: src.reps,
					duration: src.duration,
					distance: src.distance,
					done: false,
				});
			} else {
				sets.push({
					weight: target?.weight,
					reps: target?.repsMax ?? target?.repsMin,
					duration: target?.duration,
					distance: target?.distance,
					done: false,
				});
			}
		}
		return { exerciseId, sets, target: target ? cloneDeep(target) : undefined };
	}

	async startSession(template?: WorkoutTemplate): Promise<WorkoutSession> {
		const session: WorkoutSession = {
			id: uid(),
			name: template?.name ?? "Workout",
			templateId: template?.id,
			date: todayISO(),
			startedAt: Date.now(),
			exercises: (template?.exercises ?? [])
				.filter((te) => this.getExercise(te.exerciseId))
				.map((te) => {
					const { exerciseId, ...target } = te;
					return this.buildSessionExercise(exerciseId, target);
				}),
		};
		this.data.activeSession = session;
		await this.commit();
		return session;
	}

	/** Drops sets not marked done and exercises left empty. Returns the stored session, or null if nothing was done. */
	async finishActiveSession(): Promise<WorkoutSession | null> {
		const s = this.data.activeSession;
		if (!s) return null;
		const cleaned = this.cleanSession(s);
		if (!cleaned.exercises.length) return null;
		cleaned.finishedAt = Date.now();
		this.data.sessions.push(cleaned);
		this.data.activeSession = null;
		await this.commit();
		return cleaned;
	}

	cleanSession(s: WorkoutSession): WorkoutSession {
		const c = cloneDeep(s);
		c.exercises = c.exercises
			.map((e) => ({ ...e, sets: e.sets.filter((x) => x.done) }))
			.filter((e) => e.sets.length > 0);
		return c;
	}

	async discardActiveSession(): Promise<void> {
		this.data.activeSession = null;
		await this.commit();
	}

	getSession(id: string): WorkoutSession | undefined {
		return this.data.sessions.find((s) => s.id === id);
	}

	async updateSession(session: WorkoutSession): Promise<void> {
		const i = this.data.sessions.findIndex((s) => s.id === session.id);
		if (i >= 0) this.data.sessions[i] = session;
		await this.commit();
	}

	async deleteSession(id: string): Promise<void> {
		this.data.sessions = this.data.sessions.filter((s) => s.id !== id);
		await this.commit();
	}

	/* ---------- Bodyweight ---------- */

	bodyweightSorted(): BodyweightEntry[] {
		return [...this.data.bodyweight].sort((a, b) => a.date.localeCompare(b.date));
	}

	async setBodyweight(date: string, weight: number): Promise<void> {
		this.data.bodyweight = this.data.bodyweight.filter((b) => b.date !== date);
		this.data.bodyweight.push({ date, weight });
		await this.commit();
	}

	async deleteBodyweight(date: string): Promise<void> {
		this.data.bodyweight = this.data.bodyweight.filter((b) => b.date !== date);
		await this.commit();
	}
}
