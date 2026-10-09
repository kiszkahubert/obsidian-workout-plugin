import { App, FuzzySuggestModal, Modal, Notice, Setting, setIcon } from "obsidian";
import { WorkoutStore, cloneDeep } from "../store";
import {
	EXERCISE_TYPE_LABELS,
	Exercise,
	ExerciseType,
	MUSCLE_GROUPS,
	TemplateExercise,
	WorkoutTemplate,
} from "../types";
import { describeTarget } from "../stats";
import { formatDuration, parseDuration, parseNum, todayISO, uid } from "../utils";

/* ---------- Confirm ---------- */

export class ConfirmModal extends Modal {
	constructor(
		app: App,
		private title: string,
		private message: string,
		private confirmText: string,
		private onConfirm: () => void | Promise<void>,
		private danger = true
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(this.title);
		this.contentEl.createEl("p", { text: this.message });
		new Setting(this.contentEl)
			.addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((b) => {
				b.setButtonText(this.confirmText).onClick(async () => {
					this.close();
					await this.onConfirm();
				});
				if (this.danger) b.setWarning();
				else b.setCta();
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export function confirm(app: App, title: string, message: string, confirmText: string, onConfirm: () => void | Promise<void>, danger = true): void {
	new ConfirmModal(app, title, message, confirmText, onConfirm, danger).open();
}

/* ---------- Exercise ---------- */

export class ExerciseModal extends Modal {
	private draft: Exercise;

	constructor(
		app: App,
		private store: WorkoutStore,
		existing?: Exercise,
		private onSaved?: (ex: Exercise) => void
	) {
		super(app);
		this.draft = existing
			? cloneDeep(existing)
			: { id: uid(), name: "", type: "weight_reps", muscleGroup: MUSCLE_GROUPS[0], createdAt: Date.now() };
	}

	onOpen(): void {
		const isNew = !this.store.getExercise(this.draft.id);
		const hasHistory = !isNew && this.store.exerciseUsage(this.draft.id) > 0;
		this.titleEl.setText(isNew ? "New exercise" : "Edit exercise");
		const el = this.contentEl;
		el.addClass("workout-modal");

		new Setting(el).setName("Name").addText((t) => {
			t.setPlaceholder("e.g. Bench Press").setValue(this.draft.name).onChange((v) => (this.draft.name = v));
			window.setTimeout(() => t.inputEl.focus(), 0);
			t.inputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter") void this.save();
			});
		});

		new Setting(el)
			.setName("Type")
			.setDesc(hasHistory ? "Can't be changed once the exercise has been logged." : "How sets of this exercise are recorded.")
			.addDropdown((d) => {
				d.addOptions(EXERCISE_TYPE_LABELS)
					.setValue(this.draft.type)
					.onChange((v) => (this.draft.type = v as ExerciseType));
				d.setDisabled(hasHistory);
			});

		new Setting(el).setName("Muscle group").addDropdown((d) => {
			const opts: Record<string, string> = {};
			for (const g of MUSCLE_GROUPS) opts[g] = g;
			if (!opts[this.draft.muscleGroup]) opts[this.draft.muscleGroup] = this.draft.muscleGroup;
			d.addOptions(opts)
				.setValue(this.draft.muscleGroup)
				.onChange((v) => (this.draft.muscleGroup = v));
		});

		new Setting(el).setName("Equipment").setDesc("Optional").addText((t) =>
			t.setPlaceholder("e.g. Barbell").setValue(this.draft.equipment ?? "").onChange((v) => (this.draft.equipment = v.trim() || undefined))
		);

		new Setting(el).setName("Notes").setDesc("Optional cues, setup, etc.").addTextArea((t) =>
			t.setValue(this.draft.notes ?? "").onChange((v) => (this.draft.notes = v.trim() || undefined))
		);

		new Setting(el)
			.addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((b) => b.setButtonText("Save").setCta().onClick(() => void this.save()));
	}

	private async save(): Promise<void> {
		const name = this.draft.name.trim();
		if (!name) {
			new Notice("Please enter a name.");
			return;
		}
		const clash = this.store.findExerciseByName(name);
		if (clash && clash.id !== this.draft.id) {
			new Notice(`An exercise called "${clash.name}" already exists.`);
			return;
		}
		this.draft.name = name;
		await this.store.saveExercise(this.draft);
		this.close();
		this.onSaved?.(this.draft);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/* ---------- Pickers ---------- */

export class ExercisePicker extends FuzzySuggestModal<Exercise> {
	constructor(app: App, private store: WorkoutStore, private onPick: (ex: Exercise) => void) {
		super(app);
		this.setPlaceholder("Pick an exercise…");
	}
	getItems(): Exercise[] {
		return this.store.exercisesSorted();
	}
	getItemText(item: Exercise): string {
		return `${item.name} (${item.muscleGroup})`;
	}
	onChooseItem(item: Exercise): void {
		this.onPick(item);
	}
}

/** Opens the exercise picker, or the new-exercise modal if there are no exercises yet. */
export function pickExercise(app: App, store: WorkoutStore, onPick: (ex: Exercise) => void): void {
	if (!store.data.exercises.length) {
		new Notice("Add your first exercise.");
		new ExerciseModal(app, store, undefined, onPick).open();
		return;
	}
	new ExercisePicker(app, store, onPick).open();
}

type TemplateChoice = { template: WorkoutTemplate | null };

export class TemplatePicker extends FuzzySuggestModal<TemplateChoice> {
	constructor(app: App, private store: WorkoutStore, private onPick: (t: WorkoutTemplate | null) => void) {
		super(app);
		this.setPlaceholder("Start which workout?");
	}
	getItems(): TemplateChoice[] {
		return [...this.store.templatesSorted().map((template) => ({ template })), { template: null }];
	}
	getItemText(item: TemplateChoice): string {
		return item.template ? item.template.name : "Empty workout";
	}
	onChooseItem(item: TemplateChoice): void {
		this.onPick(item.template);
	}
}

/* ---------- Template ---------- */

export class TemplateModal extends Modal {
	private draft: WorkoutTemplate;
	private listEl!: HTMLElement;

	constructor(
		app: App,
		private store: WorkoutStore,
		existing?: WorkoutTemplate,
		private onSaved?: (t: WorkoutTemplate) => void
	) {
		super(app);
		this.draft = existing ? cloneDeep(existing) : { id: uid(), name: "", exercises: [], createdAt: Date.now() };
	}

	onOpen(): void {
		const isNew = !this.store.getTemplate(this.draft.id);
		this.titleEl.setText(isNew ? "New workout" : "Edit workout");
		const el = this.contentEl;
		el.addClass("workout-modal", "workout-template-modal");

		new Setting(el).setName("Workout name").addText((t) => {
			t.setPlaceholder("e.g. Push Day").setValue(this.draft.name).onChange((v) => (this.draft.name = v));
			if (isNew) window.setTimeout(() => t.inputEl.focus(), 0);
		});

		el.createEl("h4", { text: "Exercises" });
		this.listEl = el.createDiv({ cls: "workout-template-list" });
		this.renderList();

		textButton(el, "plus", "Add exercise", () =>
			pickExercise(this.app, this.store, (ex) => {
				this.draft.exercises.push(this.defaultTarget(ex));
				this.renderList();
			}), "workout-btn-wide");

		new Setting(el).setName("Notes").setDesc("Optional").addTextArea((t) =>
			t.setValue(this.draft.notes ?? "").onChange((v) => (this.draft.notes = v.trim() || undefined))
		);

		new Setting(el)
			.addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((b) => b.setButtonText("Save").setCta().onClick(() => void this.save()));
	}

	private defaultTarget(ex: Exercise): TemplateExercise {
		switch (ex.type) {
			case "weight_reps":
				return { exerciseId: ex.id, sets: 3, repsMin: 8, repsMax: 12 };
			case "bodyweight_reps":
				return { exerciseId: ex.id, sets: 3, repsMin: 8, repsMax: 12 };
			case "time":
				return { exerciseId: ex.id, sets: 3, duration: 60 };
			case "cardio":
				return { exerciseId: ex.id, sets: 1, duration: 20 * 60 };
		}
	}

	private renderList(): void {
		const list = this.listEl;
		list.empty();
		if (!this.draft.exercises.length) {
			list.createDiv({ cls: "workout-empty", text: "No exercises yet — add some below." });
			return;
		}
		this.draft.exercises.forEach((te, i) => {
			const ex = this.store.getExercise(te.exerciseId);
			if (!ex) return;
			const card = list.createDiv({ cls: "workout-card workout-template-item" });
			const head = card.createDiv({ cls: "workout-card-head" });
			const title = head.createDiv({ cls: "workout-card-title" });
			title.createSpan({ text: ex.name });
			const summary = title.createSpan({ cls: "workout-muted", text: ` · ${describeTarget(te, ex.type)}` });
			const actions = head.createDiv({ cls: "workout-actions" });
			iconButton(actions, "arrow-up", "Move up", () => this.move(i, -1), i === 0);
			iconButton(actions, "arrow-down", "Move down", () => this.move(i, 1), i === this.draft.exercises.length - 1);
			iconButton(actions, "trash-2", "Remove", () => {
				this.draft.exercises.splice(i, 1);
				this.renderList();
			});

			const fields = card.createDiv({ cls: "workout-fields" });
			const refresh = () => summary.setText(` · ${describeTarget(te, ex.type)}`);
			numberField(fields, "Sets", te.sets, (v) => (te.sets = Math.max(1, Math.round(v ?? 1))), refresh, "numeric");
			if (ex.type === "weight_reps" || ex.type === "bodyweight_reps") {
				numberField(fields, "Reps min", te.repsMin, (v) => (te.repsMin = v), refresh, "numeric");
				numberField(fields, "Reps max", te.repsMax, (v) => (te.repsMax = v), refresh, "numeric");
			}
			if (ex.type === "weight_reps") numberField(fields, "Weight (kg)", te.weight, (v) => (te.weight = v), refresh);
			if (ex.type === "cardio") numberField(fields, "Distance (km)", te.distance, (v) => (te.distance = v), refresh);
			if (ex.type === "time" || ex.type === "cardio")
				durationField(fields, "Time (m:ss)", te.duration, (v) => (te.duration = v), refresh);
		});
	}

	private move(i: number, delta: number): void {
		const j = i + delta;
		const arr = this.draft.exercises;
		if (j < 0 || j >= arr.length) return;
		[arr[i], arr[j]] = [arr[j], arr[i]];
		this.renderList();
	}

	private async save(): Promise<void> {
		const name = this.draft.name.trim();
		if (!name) {
			new Notice("Please enter a workout name.");
			return;
		}
		if (!this.draft.exercises.length) {
			new Notice("Add at least one exercise.");
			return;
		}
		this.draft.name = name;
		await this.store.saveTemplate(this.draft);
		this.close();
		this.onSaved?.(this.draft);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/* ---------- Bodyweight ---------- */

export class BodyweightModal extends Modal {
	private date = todayISO();
	private weight: number | undefined;

	constructor(app: App, private store: WorkoutStore) {
		super(app);
		const last = store.bodyweightSorted().pop();
		this.weight = last?.weight;
	}

	onOpen(): void {
		this.titleEl.setText("Log bodyweight");
		const el = this.contentEl;
		el.addClass("workout-modal");
		new Setting(el).setName("Date").addText((t) => {
			t.inputEl.type = "date";
			t.setValue(this.date).onChange((v) => (this.date = v));
		});
		new Setting(el).setName("Weight (kg)").addText((t) => {
			t.inputEl.type = "text";
			t.inputEl.inputMode = "decimal";
			t.setValue(this.weight !== undefined ? String(this.weight) : "").onChange((v) => (this.weight = parseNum(v)));
			window.setTimeout(() => t.inputEl.select(), 0);
			t.inputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter") void this.save();
			});
		});
		new Setting(el)
			.addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((b) => b.setButtonText("Save").setCta().onClick(() => void this.save()));
	}

	private async save(): Promise<void> {
		if (!this.date || !this.weight || this.weight <= 0) {
			new Notice("Enter a valid date and weight.");
			return;
		}
		await this.store.setBodyweight(this.date, this.weight);
		new Notice(`Bodyweight ${this.weight} kg saved.`);
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/* ---------- Small DOM helpers shared by views ---------- */

export function iconButton(parent: HTMLElement, icon: string, label: string, onClick: () => void, disabled = false): HTMLButtonElement {
	const b = parent.createEl("button", { cls: "clickable-icon workout-icon-btn", attr: { "aria-label": label } });
	setIcon(b, icon);
	b.disabled = disabled;
	b.onclick = (e) => {
		e.stopPropagation();
		onClick();
	};
	return b;
}

export function textButton(parent: HTMLElement, icon: string, text: string, onClick: () => void, cls = "", cta = false): HTMLButtonElement {
	const b = parent.createEl("button", { cls: `workout-text-btn ${cls}`.trim() });
	if (cta) b.addClass("mod-cta");
	setIcon(b.createSpan({ cls: "workout-btn-icon" }), icon);
	b.createSpan({ text });
	b.onclick = (e) => {
		e.stopPropagation();
		onClick();
	};
	return b;
}

export function numberField(
	parent: HTMLElement,
	label: string,
	value: number | undefined,
	set: (v: number | undefined) => void,
	onInput?: () => void,
	mode: "decimal" | "numeric" = "decimal"
): HTMLInputElement {
	const wrap = parent.createEl("label", { cls: "workout-field" });
	wrap.createSpan({ cls: "workout-field-label", text: label });
	const input = wrap.createEl("input", { type: "text", value: value !== undefined ? String(value) : "" });
	input.inputMode = mode;
	input.addEventListener("input", () => {
		set(parseNum(input.value));
		onInput?.();
	});
	input.addEventListener("focus", () => input.select());
	return input;
}

export function durationField(
	parent: HTMLElement,
	label: string,
	value: number | undefined,
	set: (v: number | undefined) => void,
	onInput?: () => void
): HTMLInputElement {
	const wrap = parent.createEl("label", { cls: "workout-field" });
	wrap.createSpan({ cls: "workout-field-label", text: label });
	const input = wrap.createEl("input", {
		type: "text",
		value: value !== undefined ? formatDuration(value) : "",
		attr: { placeholder: "m:ss" },
	});
	input.addEventListener("input", () => {
		set(parseDuration(input.value));
		onInput?.();
	});
	input.addEventListener("focus", () => input.select());
	return input;
}
