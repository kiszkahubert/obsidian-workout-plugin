import { TFile } from "obsidian";
import { cloneDeep } from "../store";
import { describeSet, sessionDurationMin, sessionRecords, sessionSetCount, sessionVolume, sortedSessions } from "../stats";
import { formatDate, formatNumber, parseISODate } from "../utils";
import { emptyState } from "./components";
import { confirm, textButton } from "./modals";
import type { WorkoutView } from "./view";

export function renderHistory(el: HTMLElement, view: WorkoutView): void {
	const { store, plugin } = view;
	const sessions = sortedSessions(store.data.sessions).reverse();
	if (!sessions.length) {
		emptyState(el, "No finished workouts yet.");
		return;
	}
	const exMap = store.exerciseMap();
	let month = "";
	for (const s of sessions.slice(0, view.historyLimit)) {
		const m = parseISODate(s.date).toLocaleDateString(undefined, { year: "numeric", month: "long" });
		if (m !== month) {
			month = m;
			el.createDiv({ cls: "workout-subheader", text: m });
		}
		const records = sessionRecords(s, store.data.sessions, exMap);
		const expanded = view.historyExpanded.has(s.id);
		const card = el.createDiv({ cls: "workout-card workout-history-card" });
		const head = card.createDiv({ cls: "workout-card-head is-clickable", attr: { role: "button", "aria-expanded": String(expanded) } });
		const title = head.createDiv({ cls: "workout-card-title" });
		title.createSpan({ text: s.name });
		title.createSpan({ cls: "workout-muted", text: ` · ${formatDate(s.date)}` });
		const meta = head.createDiv({ cls: "workout-history-meta" });
		const dur = sessionDurationMin(s);
		if (dur !== null) meta.createSpan({ text: `${dur} min` });
		meta.createSpan({ text: `${sessionSetCount(s)} sets` });
		const vol = sessionVolume(s);
		if (vol > 0) meta.createSpan({ text: `${formatNumber(vol, 0)} kg` });
		if (records.size) meta.createSpan({ cls: "workout-pr-badge is-visible", text: `🏆 ${records.size}` });
		head.onclick = () => {
			if (expanded) view.historyExpanded.delete(s.id);
			else view.historyExpanded.add(s.id);
			view.render();
		};
		if (!expanded) continue;

		const body = card.createDiv({ cls: "workout-card-body" });
		s.exercises.forEach((se, ei) => {
			const ex = exMap.get(se.exerciseId);
			const row = body.createDiv({ cls: "workout-history-ex" });
			const name = row.createEl("a", { cls: "workout-link", text: ex?.name ?? "Deleted exercise" });
			if (ex) name.onclick = () => view.openTab("progress", { exerciseId: ex.id });
			const sets = row.createDiv({ cls: "workout-history-sets" });
			se.sets.forEach((set, si) => {
				if (!set.done || !ex) return;
				const chip = sets.createSpan({ cls: "workout-chip", text: describeSet(set, ex.type) });
				const r = records.get(`${ei}:${si}`);
				if (r) {
					chip.addClass("is-pr");
					chip.setText(`🏆 ${describeSet(set, ex.type)}`);
					chip.setAttr("aria-label", `${r.join(", ")} PR`);
				}
			});
		});
		if (s.notes?.trim()) body.createDiv({ cls: "workout-history-notes", text: s.notes.trim() });

		const actions = body.createDiv({ cls: "workout-row-actions" });
		const note = s.notePath ? view.app.vault.getAbstractFileByPath(s.notePath) : null;
		if (note instanceof TFile) {
			textButton(actions, "file-text", "Open note", () => void view.app.workspace.getLeaf("tab").openFile(note));
		} else if (store.settings.createNotes) {
			textButton(actions, "file-plus", "Create note", () => void plugin.saveEditedSession(s));
		}
		textButton(actions, "pencil", "Edit", () => {
			view.historyDraft = cloneDeep(s);
			view.render();
		});
		textButton(actions, "trash-2", "Delete", () =>
			confirm(
				view.app,
				"Delete workout?",
				`Delete "${s.name}" from ${formatDate(s.date)}?${note ? " Its note will be moved to the trash." : ""}`,
				"Delete",
				() => plugin.deleteSession(s)
			)
		).addClass("mod-warning");
	}
	if (sessions.length > view.historyLimit) {
		textButton(el, "chevron-down", `Show more (${sessions.length - view.historyLimit} older)`, () => {
			view.historyLimit += 20;
			view.render();
		}, "workout-btn-wide");
	}
}
