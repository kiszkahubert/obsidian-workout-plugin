import { App, PluginSettingTab, Setting } from "obsidian";
import type WorkoutPlugin from "./main";
import { RangeKey } from "./types";
import { RANGE_LABELS } from "./utils";

export class WorkoutSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: WorkoutPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		const store = this.plugin.store;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Create a note for each workout")
			.setDesc("When you finish a workout, write a Markdown note with a summary table and frontmatter (works with Dataview).")
			.addToggle((t) =>
				t.setValue(store.settings.createNotes).onChange(async (v) => {
					store.settings.createNotes = v;
					await store.commit();
				})
			);

		new Setting(containerEl)
			.setName("Workout notes folder")
			.setDesc("Folder for workout notes. Created if it doesn't exist.")
			.addText((t) =>
				t
					.setPlaceholder("Workouts")
					.setValue(store.settings.notesFolder)
					.onChange(async (v) => {
						store.settings.notesFolder = v.trim().replace(/^\/+|\/+$/g, "") || "Workouts";
						await store.persist();
					})
			);

		new Setting(containerEl)
			.setName("Default chart range")
			.setDesc("Used when opening the view and for code blocks without a range.")
			.addDropdown((d) =>
				d
					.addOptions(RANGE_LABELS)
					.setValue(store.settings.defaultRange)
					.onChange(async (v) => {
						store.settings.defaultRange = v as RangeKey;
						await store.commit();
					})
			);

		new Setting(containerEl)
			.setName("Week starts on Monday")
			.setDesc("Affects \"This week\" stats and the training calendar.")
			.addToggle((t) =>
				t.setValue(store.settings.weekStartsMonday).onChange(async (v) => {
					store.settings.weekStartsMonday = v;
					await store.commit();
				})
			);

		new Setting(containerEl)
			.setName("Regenerate workout notes")
			.setDesc("Rewrite the note of every logged workout (creates missing ones).")
			.addButton((b) => b.setButtonText("Regenerate").onClick(() => void this.plugin.regenerateAllNotes()));
	}
}
