import { Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { WorkoutStore } from "./store";
import { WorkoutSession, WorkoutTemplate } from "./types";
import { sessionRecords, sessionSetCount } from "./stats";
import { deleteSessionNote, writeSessionNote } from "./notes";
import { WorkoutChartBlock } from "./codeblock";
import { WorkoutSettingTab } from "./settings";
import { TabId, VIEW_TYPE_WORKOUT, WorkoutView } from "./ui/view";
import { BodyweightModal, ExerciseModal, TemplateModal, TemplatePicker, confirm } from "./ui/modals";

export default class WorkoutPlugin extends Plugin {
	store!: WorkoutStore;

	async onload(): Promise<void> {
		this.store = new WorkoutStore(this);
		await this.store.load();

		this.registerView(VIEW_TYPE_WORKOUT, (leaf) => new WorkoutView(leaf, this));

		this.addRibbonIcon("dumbbell", "Open workouts", () => void this.activateView("dashboard"));

		this.addCommand({ id: "open-dashboard", name: "Open dashboard", callback: () => void this.activateView("dashboard") });
		this.addCommand({ id: "start-workout", name: "Start workout", callback: () => this.promptStartWorkout() });
		this.addCommand({
			id: "finish-workout",
			name: "Finish current workout",
			checkCallback: (checking) => {
				if (!this.store.data.activeSession) return false;
				if (!checking) void this.finishActiveWorkout();
				return true;
			},
		});
		this.addCommand({ id: "add-exercise", name: "Add exercise", callback: () => new ExerciseModal(this.app, this.store).open() });
		this.addCommand({ id: "create-workout", name: "Create workout template", callback: () => new TemplateModal(this.app, this.store).open() });
		this.addCommand({ id: "log-bodyweight", name: "Log bodyweight", callback: () => new BodyweightModal(this.app, this.store).open() });
		this.addCommand({ id: "open-progress", name: "Open progress charts", callback: () => void this.activateView("progress") });
		this.addCommand({ id: "open-history", name: "Open workout history", callback: () => void this.activateView("history") });

		this.registerMarkdownCodeBlockProcessor("workout-chart", (source, el, ctx) => {
			ctx.addChild(new WorkoutChartBlock(el, this, source, "exercise"));
		});
		this.registerMarkdownCodeBlockProcessor("workout-bodyweight", (source, el, ctx) => {
			ctx.addChild(new WorkoutChartBlock(el, this, source, "bodyweight"));
		});

		this.addSettingTab(new WorkoutSettingTab(this.app, this));
	}

	async activateView(tab?: TabId, opts: { exerciseId?: string; sessionId?: string } = {}): Promise<WorkoutView | null> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_WORKOUT)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getLeaf("tab");
			await leaf.setViewState({ type: VIEW_TYPE_WORKOUT, active: true, state: tab ? { tab } : undefined });
		}
		await workspace.revealLeaf(leaf);
		const view = leaf.view instanceof WorkoutView ? leaf.view : null;
		if (view && tab) view.openTab(tab, opts);
		return view;
	}

	/** Opens the running workout, or asks which workout to start. */
	promptStartWorkout(): void {
		if (this.store.data.activeSession) {
			void this.activateView("log");
			return;
		}
		new TemplatePicker(this.app, this.store, (t) => void this.startWorkout(t)).open();
	}

	async startWorkout(template: WorkoutTemplate | null): Promise<void> {
		const active = this.store.data.activeSession;
		if (active) {
			confirm(
				this.app,
				"Workout in progress",
				`"${active.name}" is still in progress. Finish or discard it before starting another one.`,
				"Open it",
				() => void this.activateView("log"),
				false
			);
			return;
		}
		await this.store.startSession(template ?? undefined);
		await this.activateView("log");
	}

	async finishActiveWorkout(): Promise<void> {
		const session = await this.store.finishActiveSession();
		if (!session) {
			new Notice("Nothing to save — mark at least one set as done.");
			return;
		}
		await this.syncNote(session);
		const prs = sessionRecords(session, this.store.data.sessions, this.store.exerciseMap()).size;
		new Notice(
			`Workout saved: ${sessionSetCount(session)} sets${prs ? ` · 🏆 ${prs} new PR${prs > 1 ? "s" : ""}!` : ""}`,
			6000
		);
		await this.activateView("history", { sessionId: session.id });
	}

	async saveEditedSession(draft: WorkoutSession): Promise<void> {
		const cleaned = this.store.cleanSession(draft);
		if (!cleaned.exercises.length) {
			new Notice("A workout needs at least one completed set.");
			return;
		}
		await this.store.updateSession(cleaned);
		await this.syncNote(cleaned);
	}

	async deleteSession(session: WorkoutSession): Promise<void> {
		await this.store.deleteSession(session.id);
		try {
			await deleteSessionNote(this.app, session);
		} catch (e) {
			console.error("Workout Tracker: failed to delete note", e);
		}
	}

	/** Writes the session's note (if enabled) and stores its path. */
	private async syncNote(session: WorkoutSession): Promise<void> {
		if (!this.store.settings.createNotes) return;
		try {
			const path = await writeSessionNote(this.app, this.store, session);
			if (session.notePath !== path) {
				session.notePath = path;
				await this.store.commit();
			}
		} catch (e) {
			console.error("Workout Tracker: failed to write note", e);
			new Notice("Workout saved, but its note could not be written. See the developer console.");
		}
	}

	async regenerateAllNotes(): Promise<void> {
		const prev = this.store.settings.createNotes;
		this.store.settings.createNotes = true;
		let n = 0;
		for (const s of this.store.data.sessions) {
			await this.syncNote(s);
			n++;
		}
		this.store.settings.createNotes = prev;
		await this.store.commit();
		new Notice(`Regenerated ${n} workout note${n === 1 ? "" : "s"}.`);
	}
}
