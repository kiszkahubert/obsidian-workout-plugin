import { MarkdownRenderChild } from "obsidian";
import type WorkoutPlugin from "./main";
import { ChartBag, renderLineChart } from "./charts";
import { METRICS, metricSeries } from "./stats";
import { RangeKey } from "./types";
import { RANGE_LABELS, dateToTime, formatNumber, inRange, isRangeKey } from "./utils";

export type BlockKind = "exercise" | "bodyweight";

function parseParams(source: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const line of source.split("\n")) {
		const m = line.match(/^\s*([A-Za-z_-]+)\s*:\s*(.*?)\s*$/);
		if (m) out[m[1].toLowerCase()] = m[2].replace(/\s+#.*$/, "").replace(/^["']|["']$/g, "");
	}
	return out;
}

/**
 * Renders a live chart inside a note:
 *
 * ```workout-chart
 * exercise: Bench Press
 * metric: e1rm        # optional, see README for ids
 * range: 3m           # 1m | 3m | 6m | 1y | all
 * height: 240         # optional, px
 * ```
 *
 * ```workout-bodyweight
 * range: 6m
 * ```
 */
export class WorkoutChartBlock extends MarkdownRenderChild {
	private charts = new ChartBag();

	constructor(
		containerEl: HTMLElement,
		private plugin: WorkoutPlugin,
		private source: string,
		private kind: BlockKind
	) {
		super(containerEl);
	}

	onload(): void {
		this.render();
		this.registerEvent(this.plugin.store.on("changed", () => this.render()));
		this.registerEvent(this.plugin.app.workspace.on("css-change", () => this.render()));
	}

	onunload(): void {
		this.charts.destroy();
	}

	private error(text: string): void {
		this.containerEl.createDiv({ cls: "workout-block-error", text });
	}

	private render(): void {
		this.charts.destroy();
		const el = this.containerEl;
		el.empty();
		el.addClass("workout-block");

		const p = parseParams(this.source);
		const range: RangeKey = p.range && isRangeKey(p.range.toLowerCase()) ? (p.range.toLowerCase() as RangeKey) : this.plugin.store.settings.defaultRange;
		const height = Math.min(800, Math.max(120, Number(p.height) || 240));
		const store = this.plugin.store;

		if (this.kind === "bodyweight") {
			const pts = store.bodyweightSorted().filter((b) => inRange(b.date, range));
			el.createDiv({ cls: "workout-block-title", text: p.title || `Bodyweight · ${RANGE_LABELS[range]}` });
			this.charts.add(
				renderLineChart(el, {
					label: "Bodyweight",
					points: pts.map((b) => ({ x: dateToTime(b.date), y: b.weight })),
					formatY: (v) => `${formatNumber(v)} kg`,
					height,
				})
			);
			return;
		}

		if (!p.exercise) {
			this.error("workout-chart: add a line like `exercise: Bench Press`.");
			return;
		}
		const ex = store.findExerciseByName(p.exercise);
		if (!ex) {
			const names = store.exercisesSorted().map((e) => e.name);
			this.error(`workout-chart: no exercise named "${p.exercise}".${names.length ? ` Available: ${names.join(", ")}` : ""}`);
			return;
		}
		const metrics = METRICS[ex.type];
		const q = (p.metric ?? "").trim().toLowerCase();
		const match = q ? metrics.find((m) => m.id === q.replace(/\s+/g, "_") || m.label.toLowerCase() === q) : undefined;
		const metric = match ?? metrics[0];
		if (q && !match) {
			this.error(`Unknown metric "${p.metric}" for ${ex.name}; showing ${metric.label}. Options: ${metrics.map((m) => m.id).join(", ")}`);
		}

		const points = metricSeries(store.data.sessions, ex.id, metric).filter((pt) => inRange(pt.date, range));
		el.createDiv({ cls: "workout-block-title", text: p.title || `${ex.name} — ${metric.label} · ${RANGE_LABELS[range]}` });
		this.charts.add(
			renderLineChart(el, {
				label: metric.label,
				points: points.map((pt) => ({ x: pt.t, y: pt.value, pr: pt.pr })),
				formatY: metric.format,
				reverseY: metric.lowerIsBetter,
				height,
			})
		);
	}
}
