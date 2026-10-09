import { renderBarChart } from "../charts";
import { describeSet, doneSets, sessionRecords, sessionSetCount, sessionVolume, sortedSessions } from "../stats";
import { WorkoutSession } from "../types";
import { RANGE_LABELS, dateToTime, formatDate, formatNumber, inRange, startOfWeek, toISODate } from "../utils";
import { changeLabel, emptyState, rangeControl, section, statTile, statTiles } from "./components";
import { BodyweightModal, textButton } from "./modals";
import type { WorkoutView } from "./view";

const HEATMAP_WEEKS = 26;

export function renderDashboard(el: HTMLElement, view: WorkoutView): void {
	const { store, plugin } = view;
	const sessions = store.data.sessions;
	const mondayFirst = store.settings.weekStartsMonday;

	const actions = el.createDiv({ cls: "workout-quick-actions" });
	textButton(actions, "play", store.data.activeSession ? "Continue workout" : "Start workout", () => plugin.promptStartWorkout(), "", true);
	textButton(actions, "scale", "Log bodyweight", () => new BodyweightModal(view.app, store).open());

	/* Tiles */
	const now = new Date();
	const weekStart = startOfWeek(now, mondayFirst).getTime();
	const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
	const thisWeek = sessions.filter((s) => dateToTime(s.date) >= weekStart);
	const thisMonth = sessions.filter((s) => dateToTime(s.date) >= monthStart);

	const tiles = statTiles(el);
	statTile(tiles, "This week", `${thisWeek.length}`, thisWeek.length === 1 ? "workout" : "workouts");
	statTile(tiles, "This month", `${thisMonth.length}`, thisMonth.length === 1 ? "workout" : "workouts");
	statTile(
		tiles,
		"Volume this week",
		`${formatNumber(thisWeek.reduce((v, s) => v + sessionVolume(s), 0), 0)} kg`,
		`${thisWeek.reduce((n, s) => n + sessionSetCount(s), 0)} sets`
	);
	const bw = store.bodyweightSorted();
	if (bw.length) {
		const latest = bw[bw.length - 1];
		const monthAgo = dateToTime(latest.date) - 30 * 86400000;
		const ref = [...bw].reverse().find((b) => dateToTime(b.date) <= monthAgo);
		statTile(tiles, "Bodyweight", `${formatNumber(latest.weight)} kg`, ref ? `${changeLabel(ref.weight, latest.weight, (v) => `${formatNumber(v)} kg`)} in 30 days` : formatDate(latest.date));
	} else {
		statTile(tiles, "Workouts logged", `${sessions.length}`, "all time");
	}

	if (!sessions.length) {
		emptyState(el, "Log your first workout to see stats here. Start by adding exercises, then create a workout in the Workouts tab.");
		return;
	}

	/* Heatmap */
	const heat = section(el, "Training days");
	heat.head.createDiv({ cls: "workout-muted", text: `Last ${HEATMAP_WEEKS} weeks` });
	renderHeatmap(heat.body, sessions, mondayFirst);

	/* Muscle groups */
	const mg = section(el, "Sets per muscle group");
	rangeControl(mg.head, view.range, (r) => view.setRange(r));
	const counts = new Map<string, number>();
	const exMap = store.exerciseMap();
	for (const s of sessions) {
		if (!inRange(s.date, view.range)) continue;
		for (const se of s.exercises) {
			const ex = exMap.get(se.exerciseId);
			if (!ex) continue;
			counts.set(ex.muscleGroup, (counts.get(ex.muscleGroup) ?? 0) + doneSets(se).length);
		}
	}
	const sorted = [...counts.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
	view.charts.add(
		renderBarChart(mg.body, {
			label: `Completed sets per muscle group (${RANGE_LABELS[view.range]})`,
			labels: sorted.map(([g]) => g),
			values: sorted.map(([, n]) => n),
			formatValue: (v) => `${v} sets`,
		})
	);

	/* Recent PRs */
	const prs = section(el, "Recent personal records");
	const list = prs.body.createDiv({ cls: "workout-pr-list" });
	let shown = 0;
	const recent = sortedSessions(sessions).reverse();
	for (const s of recent) {
		if (shown >= 8) break;
		const recs = sessionRecords(s, sessions, exMap);
		for (const [key, labels] of recs) {
			if (shown >= 8) break;
			const [ei, si] = key.split(":").map(Number);
			const se = s.exercises[ei];
			const ex = exMap.get(se.exerciseId);
			if (!ex) continue;
			const row = list.createDiv({ cls: "workout-pr-row" });
			row.createSpan({ cls: "workout-pr-date", text: formatDate(s.date, false) });
			const name = row.createEl("a", { cls: "workout-link", text: ex.name });
			name.onclick = () => view.openTab("progress", { exerciseId: ex.id });
			row.createSpan({ text: describeSet(se.sets[si], ex.type) });
			row.createSpan({ cls: "workout-pr-badge is-visible", text: `🏆 ${labels.join(" · ")}` });
			shown++;
		}
	}
	if (!shown) emptyState(list, "No PRs yet — they appear when you beat a previous best.");
}

function renderHeatmap(el: HTMLElement, sessions: WorkoutSession[], mondayFirst: boolean): void {
	const setsByDay = new Map<string, number>();
	const namesByDay = new Map<string, string[]>();
	for (const s of sessions) {
		setsByDay.set(s.date, (setsByDay.get(s.date) ?? 0) + sessionSetCount(s));
		namesByDay.set(s.date, [...(namesByDay.get(s.date) ?? []), s.name]);
	}
	const today = new Date();
	const start = startOfWeek(today, mondayFirst);
	start.setDate(start.getDate() - (HEATMAP_WEEKS - 1) * 7);

	const wrap = el.createDiv({ cls: "workout-heatmap-wrap" });
	const grid = wrap.createDiv({ cls: "workout-heatmap", attr: { role: "img", "aria-label": "Calendar of training days" } });
	grid.style.gridTemplateColumns = `repeat(${HEATMAP_WEEKS}, 1fr)`;
	const d = new Date(start);
	for (let w = 0; w < HEATMAP_WEEKS; w++) {
		for (let day = 0; day < 7; day++) {
			const iso = toISODate(d);
			const sets = setsByDay.get(iso) ?? 0;
			const future = d > today;
			const level = sets === 0 ? 0 : sets < 10 ? 1 : sets < 20 ? 2 : sets < 30 ? 3 : 4;
			const cell = grid.createDiv({ cls: `workout-heat-cell level-${level}` });
			cell.style.gridColumn = `${w + 1}`;
			cell.style.gridRow = `${day + 1}`;
			if (future) cell.addClass("is-future");
			else
				cell.setAttr(
					"aria-label",
					sets ? `${formatDate(iso)}: ${namesByDay.get(iso)?.join(", ")} — ${sets} sets` : `${formatDate(iso)}: rest`
				);
			d.setDate(d.getDate() + 1);
		}
	}
	const legend = wrap.createDiv({ cls: "workout-heat-legend" });
	legend.createSpan({ text: "Fewer sets" });
	for (let l = 0; l <= 4; l++) legend.createDiv({ cls: `workout-heat-cell level-${l}` });
	legend.createSpan({ text: "More" });
}
