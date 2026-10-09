import { renderLineChart } from "../charts";
import { describeSet, exerciseHistory, findMetric, metricSeries, metricsFor } from "../stats";
import { inRange, formatDate } from "../utils";
import { changeLabel, emptyState, rangeControl, section, statTile, statTiles } from "./components";
import type { WorkoutView } from "./view";

export function renderProgress(el: HTMLElement, view: WorkoutView): void {
	const { store } = view;
	const exercises = store.exercisesSorted();
	if (!exercises.length) {
		emptyState(el, "Add exercises and log workouts to see your progress.");
		return;
	}

	// Default to the most recently logged exercise.
	if (!view.progressExerciseId || !store.getExercise(view.progressExerciseId)) {
		const latest = [...store.data.sessions].sort((a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt)[0];
		view.progressExerciseId = latest?.exercises[0]?.exerciseId ?? exercises[0].id;
	}
	const ex = store.getExercise(view.progressExerciseId) ?? exercises[0];
	const metric = findMetric(ex.type, view.progressMetricId);

	const controls = el.createDiv({ cls: "workout-controls" });
	const exSelect = controls.createEl("select", { cls: "dropdown", attr: { "aria-label": "Exercise" } });
	for (const e of exercises) exSelect.createEl("option", { value: e.id, text: e.name });
	exSelect.value = ex.id;
	exSelect.onchange = () => {
		view.progressExerciseId = exSelect.value;
		view.progressMetricId = undefined;
		view.render();
	};

	const mSelect = controls.createEl("select", { cls: "dropdown", attr: { "aria-label": "Metric" } });
	for (const m of metricsFor(ex.type)) mSelect.createEl("option", { value: m.id, text: m.label });
	mSelect.value = metric.id;
	mSelect.onchange = () => {
		view.progressMetricId = mSelect.value;
		view.render();
	};
	rangeControl(controls, view.range, (r) => view.setRange(r));

	const all = metricSeries(store.data.sessions, ex.id, metric);
	const points = all.filter((p) => inRange(p.date, view.range));

	if (!all.length) {
		emptyState(el, `No completed sets of ${ex.name} yet.`);
		return;
	}

	const tiles = statTiles(el);
	const best = all.reduce((b, p) => (metric.lowerIsBetter ? (p.value < b.value ? p : b) : p.value > b.value ? p : b));
	statTile(tiles, "All-time best", metric.format(best.value), formatDate(best.date));
	const latest = all[all.length - 1];
	statTile(tiles, "Latest", metric.format(latest.value), formatDate(latest.date));
	if (points.length >= 2) {
		statTile(tiles, "Change in range", changeLabel(points[0].value, points[points.length - 1].value, metric.format), `${points.length} sessions`);
	} else {
		statTile(tiles, "Sessions in range", `${points.length}`);
	}
	const prCount = points.filter((p) => p.pr).length;
	statTile(tiles, "PRs in range", `${prCount}`, prCount ? "🏆" : undefined);

	const chart = section(el, `${ex.name} — ${metric.label}`);
	const legend = chart.head.createDiv({ cls: "workout-chart-legend" });
	legend.createSpan({ cls: "workout-legend-pr" });
	legend.createSpan({ text: "PR" });
	view.charts.add(
		renderLineChart(chart.body, {
			label: metric.label,
			points: points.map((p) => ({ x: p.t, y: p.value, pr: p.pr })),
			formatY: metric.format,
			reverseY: metric.lowerIsBetter,
		})
	);

	// Table view of the same data (most recent first).
	const occBySession = new Map(exerciseHistory(store.data.sessions, ex.id).map((o) => [o.session.id, o]));
	const tableCard = section(el, "Sessions");
	const table = tableCard.body.createEl("table", { cls: "workout-table" });
	const hr = table.createEl("thead").createEl("tr");
	for (const h of ["Date", "Sets", metric.label]) hr.createEl("th", { text: h });
	const tbody = table.createEl("tbody");
	for (const p of [...points].reverse()) {
		const occ = occBySession.get(p.sessionId);
		const tr = tbody.createEl("tr");
		const dateCell = tr.createEl("td");
		const link = dateCell.createEl("a", { cls: "workout-link", text: formatDate(p.date) });
		link.onclick = () => view.openTab("history", { sessionId: p.sessionId });
		tr.createEl("td", { cls: "workout-muted", text: occ ? occ.sets.map((s) => describeSet(s, ex.type)).join(", ") : "" });
		tr.createEl("td", { text: `${metric.format(p.value)}${p.pr ? " 🏆" : ""}` });
	}
	if (!points.length) emptyState(tableCard.body, "No sessions in this range.");
}
