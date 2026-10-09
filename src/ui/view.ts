import { ItemView, ViewStateResult, WorkspaceLeaf, debounce, setIcon } from "obsidian";
import type WorkoutPlugin from "../main";
import { ChartBag } from "../charts";
import { RangeKey, WorkoutSession } from "../types";
import { isRangeKey } from "../utils";
import { SessionEditor } from "./sessionEditor";
import { emptyState } from "./components";
import { textButton } from "./modals";
import { renderDashboard } from "./dashboard";
import { renderProgress } from "./progress";
import { renderHistory } from "./history";
import { renderExercises, renderWorkouts } from "./library";
import { renderBody } from "./body";

export const VIEW_TYPE_WORKOUT = "workout-tracker-view";

export type TabId = "dashboard" | "log" | "workouts" | "exercises" | "progress" | "history" | "body";

const TABS: { id: TabId; label: string; icon: string }[] = [
	{ id: "dashboard", label: "Dashboard", icon: "layout-dashboard" },
	{ id: "log", label: "Log", icon: "play" },
	{ id: "workouts", label: "Workouts", icon: "list-checks" },
	{ id: "exercises", label: "Exercises", icon: "dumbbell" },
	{ id: "progress", label: "Progress", icon: "line-chart" },
	{ id: "history", label: "History", icon: "history" },
	{ id: "body", label: "Body", icon: "scale" },
];

export class WorkoutView extends ItemView {
	tab: TabId = "dashboard";
	range: RangeKey;
	progressExerciseId?: string;
	progressMetricId?: string;
	/** Session being edited from History (a clone; saved explicitly). */
	historyDraft: WorkoutSession | null = null;
	historyExpanded = new Set<string>();
	historyLimit = 20;

	readonly charts = new ChartBag();
	private editor: SessionEditor | null = null;
	private persistActive = debounce(() => void this.plugin.store.persist(), 400, true);

	constructor(leaf: WorkspaceLeaf, readonly plugin: WorkoutPlugin) {
		super(leaf);
		this.range = plugin.store.settings.defaultRange;
	}

	get store() {
		return this.plugin.store;
	}

	getViewType(): string {
		return VIEW_TYPE_WORKOUT;
	}

	getDisplayText(): string {
		return "Workouts";
	}

	getIcon(): string {
		return "dumbbell";
	}

	getState(): Record<string, unknown> {
		return { tab: this.tab, range: this.range };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const s = (state ?? {}) as { tab?: string; range?: string };
		if (s.tab && TABS.some((t) => t.id === s.tab)) this.tab = s.tab as TabId;
		if (s.range && isRangeKey(s.range)) this.range = s.range;
		this.render();
		await super.setState(state, result);
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass("workout-view");
		this.registerEvent(this.store.on("changed", () => this.render()));
		this.registerEvent(this.app.workspace.on("css-change", () => this.render()));
		this.render();
	}

	async onClose(): Promise<void> {
		this.teardown();
	}

	openTab(tab: TabId, opts: { exerciseId?: string; sessionId?: string } = {}): void {
		this.tab = tab;
		if (opts.exerciseId) {
			this.progressExerciseId = opts.exerciseId;
			this.progressMetricId = undefined;
		}
		if (opts.sessionId) this.historyExpanded.add(opts.sessionId);
		this.app.workspace.requestSaveLayout();
		this.render();
	}

	setRange(r: RangeKey): void {
		this.range = r;
		this.app.workspace.requestSaveLayout();
		this.render();
	}

	private teardown(): void {
		this.charts.destroy();
		this.editor?.destroy();
		this.editor = null;
	}

	render(): void {
		const scroll = this.contentEl.scrollTop;
		this.teardown();
		const el = this.contentEl;
		el.empty();

		const nav = el.createDiv({ cls: "workout-nav", attr: { role: "tablist" } });
		for (const t of TABS) {
			const b = nav.createEl("button", { cls: "workout-nav-btn", attr: { role: "tab", "aria-label": t.label } });
			setIcon(b.createSpan({ cls: "workout-nav-icon" }), t.icon);
			b.createSpan({ cls: "workout-nav-label", text: t.label });
			b.toggleClass("is-active", t.id === this.tab);
			b.setAttr("aria-selected", t.id === this.tab ? "true" : "false");
			if (t.id === "log" && this.store.data.activeSession) b.addClass("has-active");
			b.onclick = () => this.openTab(t.id);
		}

		const body = el.createDiv({ cls: `workout-body workout-tab-${this.tab}` });
		switch (this.tab) {
			case "dashboard":
				renderDashboard(body, this);
				break;
			case "log":
				this.renderLog(body);
				break;
			case "workouts":
				renderWorkouts(body, this);
				break;
			case "exercises":
				renderExercises(body, this);
				break;
			case "progress":
				renderProgress(body, this);
				break;
			case "history":
				if (this.historyDraft) this.renderHistoryEditor(body, this.historyDraft);
				else renderHistory(body, this);
				break;
			case "body":
				renderBody(body, this);
				break;
		}
		el.scrollTop = scroll;
	}

	private renderLog(body: HTMLElement): void {
		const session = this.store.data.activeSession;
		if (!session) {
			emptyState(body, "No workout in progress.");
			const list = body.createDiv({ cls: "workout-start-list" });
			for (const t of this.store.templatesSorted()) {
				textButton(list, "play", t.name, () => void this.plugin.startWorkout(t), "workout-btn-wide", true);
			}
			textButton(list, "plus", "Start empty workout", () => void this.plugin.startWorkout(null), "workout-btn-wide");
			return;
		}
		this.editor = new SessionEditor(body, this.app, this.store, session, "active", {
			onChange: () => this.persistActive(),
			onStructureChange: () => void this.store.commit(),
			onSubmit: () => void this.plugin.finishActiveWorkout(),
			onCancel: () => void this.store.discardActiveSession(),
		});
		this.editor.render();
	}

	private renderHistoryEditor(body: HTMLElement, draft: WorkoutSession): void {
		const title = body.createDiv({ cls: "workout-subheader" });
		title.createSpan({ text: "Editing workout" });
		this.editor = new SessionEditor(body, this.app, this.store, draft, "edit", {
			onChange: () => {},
			onStructureChange: () => this.render(),
			onSubmit: async () => {
				this.historyDraft = null;
				await this.plugin.saveEditedSession(draft);
			},
			onCancel: () => {
				this.historyDraft = null;
				this.render();
			},
		});
		this.editor.render();
	}
}
