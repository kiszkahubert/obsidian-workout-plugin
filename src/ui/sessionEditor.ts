import { App, Notice, setIcon } from "obsidian";
import { WorkoutStore } from "../store";
import { Exercise, SessionExercise, SetEntry, WorkoutSession } from "../types";
import { describeSet, describeTarget, lastSets, sessionRecords } from "../stats";
import { formatDuration, parseDuration, parseNum } from "../utils";
import { confirm, iconButton, pickExercise, textButton } from "./modals";

export interface SessionEditorCallbacks {
	/** A value changed (typing); persist without re-rendering. */
	onChange: () => void;
	/** Exercises/sets were added, removed or reordered; persist and re-render. */
	onStructureChange: () => void;
	onSubmit: () => void;
	onCancel: () => void;
}

/**
 * Renders an editable workout session. Used for the in-progress workout ("active")
 * and for editing a finished workout from History ("edit").
 */
export class SessionEditor {
	private timer: number | null = null;
	private badges = new Map<string, HTMLElement>();
	private progressEl: HTMLElement | null = null;

	constructor(
		private container: HTMLElement,
		private app: App,
		private store: WorkoutStore,
		private session: WorkoutSession,
		private mode: "active" | "edit",
		private cb: SessionEditorCallbacks
	) {}

	destroy(): void {
		if (this.timer !== null) window.clearInterval(this.timer);
		this.timer = null;
	}

	render(): void {
		this.destroy();
		this.badges.clear();
		const root = this.container.createDiv({ cls: "workout-session" });
		this.renderHeader(root);

		if (!this.session.exercises.length) {
			root.createDiv({ cls: "workout-empty", text: "No exercises yet. Add one to get going." });
		}
		this.session.exercises.forEach((se, ei) => this.renderExercise(root, se, ei));

		textButton(root, "plus", "Add exercise", () => this.addExercise(), "workout-btn-wide");

		const notes = root.createDiv({ cls: "workout-card" });
		notes.createDiv({ cls: "workout-card-title", text: "Notes" });
		const ta = notes.createEl("textarea", { cls: "workout-notes", attr: { rows: "3", placeholder: "How did it go?" } });
		ta.value = this.session.notes ?? "";
		ta.addEventListener("input", () => {
			this.session.notes = ta.value;
			this.cb.onChange();
		});

		const footer = root.createDiv({ cls: "workout-session-footer" });
		if (this.mode === "active") {
			textButton(footer, "trash-2", "Discard", () =>
				confirm(this.app, "Discard workout?", "Everything logged in this workout will be lost.", "Discard", () => this.cb.onCancel())
			).addClass("mod-warning");
			textButton(footer, "check", "Finish workout", () => this.submit(), "", true);
		} else {
			textButton(footer, "x", "Cancel", () => this.cb.onCancel());
			textButton(footer, "save", "Save changes", () => this.submit(), "", true);
		}

		this.refreshBadges();
	}

	private submit(): void {
		const total = this.session.exercises.reduce((n, e) => n + e.sets.length, 0);
		const done = this.session.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
		if (done === 0) {
			new Notice("Mark at least one set as done (tap the ✓ next to the set).");
			return;
		}
		if (done < total) {
			const n = total - done;
			confirm(
				this.app,
				this.mode === "active" ? "Finish workout?" : "Save workout?",
				`${n} set${n > 1 ? "s are" : " is"} not marked as done and will be discarded.`,
				this.mode === "active" ? "Finish" : "Save",
				() => this.cb.onSubmit(),
				false
			);
			return;
		}
		this.cb.onSubmit();
	}

	private renderHeader(root: HTMLElement): void {
		const head = root.createDiv({ cls: "workout-card workout-session-head" });
		const row = head.createDiv({ cls: "workout-fields" });

		const nameWrap = row.createEl("label", { cls: "workout-field workout-field-grow" });
		nameWrap.createSpan({ cls: "workout-field-label", text: "Workout" });
		const name = nameWrap.createEl("input", { type: "text", value: this.session.name });
		name.addEventListener("input", () => {
			this.session.name = name.value.trim() || "Workout";
			this.cb.onChange();
		});

		const dateWrap = row.createEl("label", { cls: "workout-field workout-field-date" });
		dateWrap.createSpan({ cls: "workout-field-label", text: "Date" });
		const date = dateWrap.createEl("input", { type: "date", value: this.session.date });
		date.addEventListener("change", () => {
			if (!date.value) return;
			this.session.date = date.value;
			this.cb.onStructureChange();
		});

		const meta = head.createDiv({ cls: "workout-session-meta" });
		if (this.mode === "active") {
			const clock = meta.createSpan({ cls: "workout-pill" });
			setIcon(clock.createSpan({ cls: "workout-btn-icon" }), "timer");
			const t = clock.createSpan();
			const tick = () => t.setText(formatDuration((Date.now() - this.session.startedAt) / 1000));
			tick();
			this.timer = window.setInterval(tick, 1000);
		}
		this.progressEl = meta.createSpan({ cls: "workout-pill" });
		this.updateProgress();
	}

	private updateProgress(): void {
		if (!this.progressEl) return;
		const total = this.session.exercises.reduce((n, e) => n + e.sets.length, 0);
		const done = this.session.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
		this.progressEl.setText(`${done} / ${total} sets done`);
	}

	private renderExercise(root: HTMLElement, se: SessionExercise, ei: number): void {
		const ex = this.store.getExercise(se.exerciseId);
		const card = root.createDiv({ cls: "workout-card workout-session-ex" });
		const head = card.createDiv({ cls: "workout-card-head" });
		const title = head.createDiv({ cls: "workout-card-title" });
		title.createSpan({ text: ex?.name ?? "Deleted exercise" });
		if (ex) title.createSpan({ cls: "workout-muted", text: ` · ${ex.muscleGroup}` });
		const actions = head.createDiv({ cls: "workout-actions" });
		iconButton(actions, "arrow-up", "Move up", () => this.moveExercise(ei, -1), ei === 0);
		iconButton(actions, "arrow-down", "Move down", () => this.moveExercise(ei, 1), ei === this.session.exercises.length - 1);
		iconButton(actions, "trash-2", "Remove exercise", () =>
			confirm(this.app, "Remove exercise?", `Remove ${ex?.name ?? "this exercise"} and its sets from this workout?`, "Remove", () => {
				this.session.exercises.splice(ei, 1);
				this.cb.onStructureChange();
			})
		);
		if (!ex) return;

		const info = card.createDiv({ cls: "workout-ex-info" });
		if (se.target) info.createDiv({ text: `Target: ${describeTarget(se.target, ex.type)}` });
		const last = lastSets(this.store.data.sessions, ex.id, this.session);
		if (last.length) info.createDiv({ text: `Last time: ${last.map((s) => describeSet(s, ex.type)).join(", ")}` });

		const table = card.createDiv({ cls: `workout-sets workout-sets-${ex.type}` });
		const header = table.createDiv({ cls: "workout-set-row workout-set-header" });
		header.createSpan({ text: "Set" });
		for (const col of this.columns(ex)) header.createSpan({ text: col.label });
		header.createSpan({ text: "Done" });
		header.createSpan();

		se.sets.forEach((s, si) => this.renderSet(table, ex, se, s, ei, si));

		textButton(card, "plus", "Add set", () => {
			const prev = se.sets[se.sets.length - 1];
			se.sets.push({
				weight: prev?.weight,
				reps: prev?.reps,
				duration: prev?.duration,
				distance: prev?.distance,
				done: this.mode === "edit",
			});
			this.cb.onStructureChange();
		}, "workout-add-set");
	}

	private columns(ex: Exercise): { label: string; kind: "weight" | "reps" | "duration" | "distance" }[] {
		switch (ex.type) {
			case "weight_reps":
				return [
					{ label: "kg", kind: "weight" },
					{ label: "Reps", kind: "reps" },
				];
			case "bodyweight_reps":
				return [
					{ label: "Reps", kind: "reps" },
					{ label: "+kg", kind: "weight" },
				];
			case "time":
				return [{ label: "Time", kind: "duration" }];
			case "cardio":
				return [
					{ label: "km", kind: "distance" },
					{ label: "Time", kind: "duration" },
				];
		}
	}

	private renderSet(table: HTMLElement, ex: Exercise, se: SessionExercise, s: SetEntry, ei: number, si: number): void {
		const row = table.createDiv({ cls: "workout-set-row" });
		row.toggleClass("is-done", s.done);
		row.createSpan({ cls: "workout-set-num", text: `${si + 1}` });

		for (const col of this.columns(ex)) {
			const input = row.createEl("input", { type: "text", cls: "workout-set-input", attr: { "aria-label": `Set ${si + 1} ${col.label}` } });
			if (col.kind === "duration") {
				input.value = s.duration !== undefined ? formatDuration(s.duration) : "";
				input.placeholder = "m:ss";
			} else {
				const v = s[col.kind];
				input.value = v !== undefined ? String(v) : "";
				input.inputMode = col.kind === "reps" ? "numeric" : "decimal";
				input.placeholder = col.kind === "weight" && ex.type === "bodyweight_reps" ? "0" : "";
			}
			input.addEventListener("focus", () => input.select());
			input.addEventListener("input", () => {
				if (col.kind === "duration") s.duration = parseDuration(input.value);
				else s[col.kind] = parseNum(input.value);
				this.refreshBadges();
				this.cb.onChange();
			});
		}

		const doneBtn = row.createEl("button", { cls: "workout-done-btn", attr: { "aria-label": "Mark set done" } });
		setIcon(doneBtn, "check");
		doneBtn.onclick = () => {
			s.done = !s.done;
			row.toggleClass("is-done", s.done);
			this.refreshBadges();
			this.updateProgress();
			this.cb.onChange();
		};

		iconButton(row, "x", "Remove set", () => {
			se.sets.splice(si, 1);
			this.cb.onStructureChange();
		});
		const badge = row.createSpan({ cls: "workout-pr-badge workout-set-pr" });
		this.badges.set(`${ei}:${si}`, badge);
	}

	private refreshBadges(): void {
		const records = sessionRecords(this.session, this.store.data.sessions, this.store.exerciseMap());
		for (const [key, el] of this.badges) {
			const r = records.get(key);
			el.setText(r ? `🏆 ${r.join(" · ")}` : "");
			el.toggleClass("is-visible", !!r);
			if (r) el.setAttr("aria-label", `Personal record: ${r.join(", ")}`);
		}
	}

	private moveExercise(i: number, delta: number): void {
		const arr = this.session.exercises;
		const j = i + delta;
		if (j < 0 || j >= arr.length) return;
		[arr[i], arr[j]] = [arr[j], arr[i]];
		this.cb.onStructureChange();
	}

	private addExercise(): void {
		pickExercise(this.app, this.store, (ex) => {
			const se = this.store.buildSessionExercise(ex.id);
			if (this.mode === "edit") se.sets.forEach((s) => (s.done = true));
			this.session.exercises.push(se);
			this.cb.onStructureChange();
		});
	}
}
