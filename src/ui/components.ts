import { RangeKey } from "../types";
import { RANGE_LABELS } from "../utils";

export function rangeControl(parent: HTMLElement, value: RangeKey, onChange: (r: RangeKey) => void): HTMLElement {
	const group = parent.createDiv({ cls: "workout-segmented", attr: { role: "group", "aria-label": "Time range" } });
	(Object.keys(RANGE_LABELS) as RangeKey[]).forEach((key) => {
		const b = group.createEl("button", { text: RANGE_LABELS[key] });
		b.toggleClass("is-active", key === value);
		b.setAttr("aria-pressed", key === value ? "true" : "false");
		b.onclick = () => onChange(key);
	});
	return group;
}

export function statTiles(parent: HTMLElement): HTMLElement {
	return parent.createDiv({ cls: "workout-tiles" });
}

export function statTile(parent: HTMLElement, label: string, value: string, sub?: string): HTMLElement {
	const tile = parent.createDiv({ cls: "workout-tile" });
	tile.createDiv({ cls: "workout-tile-label", text: label });
	tile.createDiv({ cls: "workout-tile-value", text: value });
	if (sub) tile.createDiv({ cls: "workout-tile-sub", text: sub });
	return tile;
}

export function section(parent: HTMLElement, title: string): { card: HTMLElement; head: HTMLElement; body: HTMLElement } {
	const card = parent.createDiv({ cls: "workout-card" });
	const head = card.createDiv({ cls: "workout-card-head" });
	head.createDiv({ cls: "workout-card-title", text: title });
	const body = card.createDiv({ cls: "workout-card-body" });
	return { card, head, body };
}

export function emptyState(parent: HTMLElement, text: string): HTMLElement {
	return parent.createDiv({ cls: "workout-empty", text });
}

/** "+2.5 kg (+3%)" style change label. */
export function changeLabel(first: number, last: number, format: (v: number) => string): string {
	const diff = last - first;
	if (Math.abs(diff) < 1e-9) return "No change";
	const sign = diff > 0 ? "+" : "−";
	const pct = first !== 0 ? ` (${sign}${Math.abs(Math.round((diff / first) * 100))}%)` : "";
	const arrow = diff > 0 ? "▲" : "▼";
	return `${arrow} ${sign}${format(Math.abs(diff))}${pct}`;
}
