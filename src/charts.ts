import {
	BarController,
	BarElement,
	CategoryScale,
	Chart,
	Filler,
	LineController,
	LineElement,
	LinearScale,
	PointElement,
	Tooltip,
} from "chart.js";

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, BarController, BarElement, Tooltip, Filler);

const DAY = 86400000;

interface Theme {
	accent: string;
	accentFill: string;
	pr: string;
	text: string;
	grid: string;
	surface: string;
	font: string;
}

function readTheme(): Theme {
	const s = getComputedStyle(document.body);
	const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
	const accent = v("--interactive-accent", "#7b6cd9");
	return {
		accent,
		accentFill: v("--interactive-accent-hover", accent),
		pr: v("--color-orange", "#e0832c"),
		text: v("--text-muted", "#888"),
		grid: v("--background-modifier-border", "rgba(128,128,128,0.2)"),
		surface: v("--background-primary", "#fff"),
		font: v("--font-interface", "sans-serif"),
	};
}

function makeCanvas(container: HTMLElement, height: number): HTMLCanvasElement {
	const wrap = container.createDiv({ cls: "workout-chart" });
	wrap.style.height = `${height}px`;
	return wrap.createEl("canvas");
}

export interface LinePoint {
	x: number;
	y: number;
	pr?: boolean;
	label?: string;
}

export interface LineChartOptions {
	label: string;
	points: LinePoint[];
	formatY: (v: number) => string;
	height?: number;
	/** Reverse y so "better" is up (e.g. pace). */
	reverseY?: boolean;
}

export function renderLineChart(container: HTMLElement, opts: LineChartOptions): Chart | null {
	if (!opts.points.length) {
		container.createDiv({ cls: "workout-empty", text: "No data in this range yet." });
		return null;
	}
	const t = readTheme();
	const canvas = makeCanvas(container, opts.height ?? 260);
	canvas.setAttribute("role", "img");
	canvas.setAttribute("aria-label", `${opts.label} over time`);
	const xs = opts.points.map((p) => p.x);
	let minX = Math.min(...xs);
	let maxX = Math.max(...xs);
	if (maxX - minX < 7 * DAY) {
		minX -= 3 * DAY;
		maxX += 3 * DAY;
	}
	const pts = opts.points;

	return new Chart(canvas, {
		type: "line",
		data: {
			datasets: [
				{
					label: opts.label,
					data: pts.map((p) => ({ x: p.x, y: p.y })),
					borderColor: t.accent,
					backgroundColor: t.accent,
					borderWidth: 2,
					cubicInterpolationMode: "monotone",
					pointRadius: pts.map((p) => (p.pr ? 6 : 3.5)),
					pointHoverRadius: pts.map((p) => (p.pr ? 8 : 6)),
					pointHitRadius: 12,
					pointBackgroundColor: pts.map((p) => (p.pr ? t.pr : t.accent)),
					pointBorderColor: t.surface,
					pointBorderWidth: 2,
					pointStyle: pts.map((p) => (p.pr ? "rectRot" : "circle")),
				},
			],
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			animation: false,
			interaction: { mode: "nearest", axis: "x", intersect: false },
			font: { family: t.font },
			scales: {
				x: {
					type: "linear",
					min: minX,
					max: maxX,
					grid: { display: false },
					border: { color: t.grid },
					ticks: {
						color: t.text,
						maxTicksLimit: 6,
						callback: (v) =>
							new Date(Number(v)).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
					},
				},
				y: {
					reverse: !!opts.reverseY,
					grace: "5%",
					grid: { color: t.grid },
					border: { display: false },
					ticks: { color: t.text, maxTicksLimit: 6, callback: (v) => opts.formatY(Number(v)) },
				},
			},
			plugins: {
				legend: { display: false },
				tooltip: {
					displayColors: false,
					callbacks: {
						title: (items) =>
							new Date(Number(items[0].parsed.x)).toLocaleDateString(undefined, {
								weekday: "short",
								year: "numeric",
								month: "short",
								day: "numeric",
							}),
						label: (item) => {
							const p = pts[item.dataIndex];
							return `${opts.label}: ${opts.formatY(Number(item.parsed.y))}${p.pr ? "  🏆 PR" : ""}`;
						},
						afterLabel: (item) => pts[item.dataIndex].label ?? "",
					},
				},
			},
		},
	});
}

export interface BarChartOptions {
	label: string;
	labels: string[];
	values: number[];
	formatValue: (v: number) => string;
}

/** Horizontal single-hue bar chart (magnitude by category). */
export function renderBarChart(container: HTMLElement, opts: BarChartOptions): Chart | null {
	if (!opts.values.length) {
		container.createDiv({ cls: "workout-empty", text: "No data in this range yet." });
		return null;
	}
	const t = readTheme();
	const canvas = makeCanvas(container, Math.max(120, opts.labels.length * 30 + 40));
	canvas.setAttribute("role", "img");
	canvas.setAttribute("aria-label", opts.label);
	return new Chart(canvas, {
		type: "bar",
		data: {
			labels: opts.labels,
			datasets: [
				{
					label: opts.label,
					data: opts.values,
					backgroundColor: t.accent,
					hoverBackgroundColor: t.accentFill,
					borderRadius: 4,
					borderSkipped: "start",
					barPercentage: 0.8,
					categoryPercentage: 0.9,
				},
			],
		},
		options: {
			indexAxis: "y",
			responsive: true,
			maintainAspectRatio: false,
			animation: false,
			scales: {
				x: {
					beginAtZero: true,
					grid: { color: t.grid },
					border: { display: false },
					ticks: { color: t.text, maxTicksLimit: 5, precision: 0 },
				},
				y: { grid: { display: false }, border: { color: t.grid }, ticks: { color: t.text } },
			},
			plugins: {
				legend: { display: false },
				tooltip: {
					displayColors: false,
					callbacks: { label: (item) => opts.formatValue(Number(item.parsed.x)) },
				},
			},
		},
	});
}

/** Tracks charts rendered into a container so they can be destroyed before re-rendering. */
export class ChartBag {
	private charts: Chart[] = [];
	add(c: Chart | null): void {
		if (c) this.charts.push(c);
	}
	destroy(): void {
		for (const c of this.charts) c.destroy();
		this.charts = [];
	}
}
