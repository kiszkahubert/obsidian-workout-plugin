import { Notice } from "obsidian";
import { renderLineChart } from "../charts";
import { dateToTime, formatDate, formatNumber, inRange, parseNum, todayISO } from "../utils";
import { changeLabel, emptyState, rangeControl, section, statTile, statTiles } from "./components";
import { confirm, iconButton, textButton } from "./modals";
import type { WorkoutView } from "./view";

export function renderBody(el: HTMLElement, view: WorkoutView): void {
	const { store, app } = view;
	const kg = (v: number) => `${formatNumber(v)} kg`;

	const form = el.createDiv({ cls: "workout-card workout-fields workout-bw-form" });
	const dWrap = form.createEl("label", { cls: "workout-field workout-field-date" });
	dWrap.createSpan({ cls: "workout-field-label", text: "Date" });
	const date = dWrap.createEl("input", { type: "date", value: todayISO() });
	const wWrap = form.createEl("label", { cls: "workout-field" });
	wWrap.createSpan({ cls: "workout-field-label", text: "Weight (kg)" });
	const all = store.bodyweightSorted();
	const weight = wWrap.createEl("input", { type: "text", value: all.length ? String(all[all.length - 1].weight) : "" });
	weight.inputMode = "decimal";
	const save = async () => {
		const w = parseNum(weight.value);
		if (!date.value || !w || w <= 0) {
			new Notice("Enter a valid date and weight.");
			return;
		}
		await store.setBodyweight(date.value, w);
	};
	weight.addEventListener("keydown", (e) => {
		if (e.key === "Enter") void save();
	});
	textButton(form, "save", "Save", () => void save(), "workout-bw-save", true);

	if (!all.length) {
		emptyState(el, "Log your bodyweight to track it over time.");
		return;
	}

	const entries = all.filter((b) => inRange(b.date, view.range));
	const tiles = statTiles(el);
	const latest = all[all.length - 1];
	statTile(tiles, "Latest", kg(latest.weight), formatDate(latest.date));
	if (entries.length >= 2) {
		statTile(tiles, "Change in range", changeLabel(entries[0].weight, entries[entries.length - 1].weight, kg));
		const ws = entries.map((e) => e.weight);
		statTile(tiles, "Lowest / highest", `${formatNumber(Math.min(...ws))} / ${formatNumber(Math.max(...ws))}`, "kg");
	}

	const chart = section(el, "Bodyweight");
	rangeControl(chart.head, view.range, (r) => view.setRange(r));
	view.charts.add(
		renderLineChart(chart.body, {
			label: "Bodyweight",
			points: entries.map((b) => ({ x: dateToTime(b.date), y: b.weight })),
			formatY: kg,
		})
	);

	const listCard = section(el, "Entries");
	const list = listCard.body.createDiv({ cls: "workout-list" });
	for (const b of [...entries].reverse()) {
		const row = list.createDiv({ cls: "workout-list-row" });
		row.createDiv({ cls: "workout-list-main", text: formatDate(b.date) });
		row.createDiv({ cls: "workout-list-value", text: kg(b.weight) });
		iconButton(row.createDiv({ cls: "workout-actions" }), "trash-2", "Delete entry", () =>
			confirm(app, "Delete entry?", `Delete the bodyweight entry for ${formatDate(b.date)}?`, "Delete", () => store.deleteBodyweight(b.date))
		);
	}
	if (!entries.length) emptyState(list, "No entries in this range.");
}
