import { Notice } from "obsidian";
import { describeTarget, exerciseHistory, sortedSessions } from "../stats";
import { EXERCISE_TYPE_LABELS, Exercise } from "../types";
import { formatDate } from "../utils";
import { emptyState } from "./components";
import { ExerciseModal, TemplateModal, confirm, iconButton, textButton } from "./modals";
import type { WorkoutView } from "./view";

/* ---------- Exercises ---------- */

export function renderExercises(el: HTMLElement, view: WorkoutView): void {
	const { store, app } = view;
	const bar = el.createDiv({ cls: "workout-controls" });
	const search = bar.createEl("input", { type: "search", cls: "workout-search", attr: { placeholder: "Search exercises…" } });
	textButton(bar, "plus", "New exercise", () => new ExerciseModal(app, store).open(), "", true);

	const list = el.createDiv();
	const exercises = store.exercisesSorted();
	if (!exercises.length) {
		emptyState(list, "No exercises yet. Add the exercises you do — e.g. Bench Press, Squat, Pull-up, Plank.");
		return;
	}

	const draw = () => {
		list.empty();
		const q = search.value.trim().toLowerCase();
		const filtered = exercises.filter(
			(e) => !q || e.name.toLowerCase().includes(q) || e.muscleGroup.toLowerCase().includes(q) || (e.equipment ?? "").toLowerCase().includes(q)
		);
		if (!filtered.length) {
			emptyState(list, "No matches.");
			return;
		}
		const groups = new Map<string, Exercise[]>();
		for (const e of filtered) groups.set(e.muscleGroup, [...(groups.get(e.muscleGroup) ?? []), e]);
		for (const [group, items] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
			list.createDiv({ cls: "workout-subheader", text: group });
			const card = list.createDiv({ cls: "workout-card workout-list" });
			for (const ex of items) renderExerciseRow(card, ex, view);
		}
	};
	search.addEventListener("input", draw);
	draw();
}

function renderExerciseRow(parent: HTMLElement, ex: Exercise, view: WorkoutView): void {
	const { store, app } = view;
	const row = parent.createDiv({ cls: "workout-list-row" });
	const main = row.createDiv({ cls: "workout-list-main" });
	main.createDiv({ cls: "workout-list-title", text: ex.name });
	const hist = exerciseHistory(store.data.sessions, ex.id);
	const parts = [EXERCISE_TYPE_LABELS[ex.type]];
	if (ex.equipment) parts.push(ex.equipment);
	parts.push(hist.length ? `${hist.length} workout${hist.length > 1 ? "s" : ""} · last ${formatDate(hist[hist.length - 1].session.date)}` : "never logged");
	main.createDiv({ cls: "workout-muted", text: parts.join(" · ") });
	if (ex.notes) main.createDiv({ cls: "workout-list-notes", text: ex.notes });

	const actions = row.createDiv({ cls: "workout-actions" });
	iconButton(actions, "line-chart", "Show progress", () => view.openTab("progress", { exerciseId: ex.id }));
	iconButton(actions, "pencil", "Edit", () => new ExerciseModal(app, store, ex).open());
	iconButton(actions, "trash-2", "Delete", () => {
		const used = store.exerciseUsage(ex.id);
		if (used > 0) {
			new Notice(`"${ex.name}" is part of ${used} logged workout${used > 1 ? "s" : ""}, so it can't be deleted without losing history.`);
			return;
		}
		const inTemplates = store.data.templates.filter((t) => t.exercises.some((e) => e.exerciseId === ex.id)).length;
		confirm(
			app,
			"Delete exercise?",
			`Delete "${ex.name}"?${inTemplates ? ` It will also be removed from ${inTemplates} workout${inTemplates > 1 ? "s" : ""}.` : ""}`,
			"Delete",
			() => store.deleteExercise(ex.id)
		);
	});
}

/* ---------- Workout templates ---------- */

export function renderWorkouts(el: HTMLElement, view: WorkoutView): void {
	const { store, app, plugin } = view;
	const bar = el.createDiv({ cls: "workout-controls" });
	textButton(bar, "plus", "New workout", () => {
		if (!store.data.exercises.length) new Notice("Add some exercises first — then build a workout from them.");
		new TemplateModal(app, store).open();
	}, "", true);
	textButton(bar, "play", "Start empty workout", () => void plugin.startWorkout(null));

	const templates = store.templatesSorted();
	if (!templates.length) {
		emptyState(el, "No workouts yet. Create one (e.g. \"Push Day\") with the exercises and number of sets you plan to do.");
		return;
	}
	const lastByTemplate = new Map<string, string>();
	for (const s of sortedSessions(store.data.sessions)) if (s.templateId) lastByTemplate.set(s.templateId, s.date);

	for (const t of templates) {
		const card = el.createDiv({ cls: "workout-card" });
		const head = card.createDiv({ cls: "workout-card-head" });
		const title = head.createDiv({ cls: "workout-card-title" });
		title.createSpan({ text: t.name });
		const last = lastByTemplate.get(t.id);
		title.createSpan({ cls: "workout-muted", text: last ? ` · last done ${formatDate(last)}` : " · not done yet" });
		const actions = head.createDiv({ cls: "workout-actions" });
		iconButton(actions, "pencil", "Edit", () => new TemplateModal(app, store, t).open());
		iconButton(actions, "trash-2", "Delete", () =>
			confirm(app, "Delete workout?", `Delete the "${t.name}" workout? Logged history is kept.`, "Delete", () => store.deleteTemplate(t.id))
		);

		const list = card.createEl("ul", { cls: "workout-template-summary" });
		for (const te of t.exercises) {
			const ex = store.getExercise(te.exerciseId);
			if (!ex) continue;
			const li = list.createEl("li");
			li.createSpan({ text: ex.name });
			li.createSpan({ cls: "workout-muted", text: ` — ${describeTarget(te, ex.type)}` });
		}
		if (t.notes) card.createDiv({ cls: "workout-list-notes", text: t.notes });
		textButton(card, "play", "Start", () => void plugin.startWorkout(t), "workout-btn-wide", true);
	}
}
