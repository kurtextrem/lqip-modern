import fs from "node:fs/promises";
import path from "node:path";

const EVENT_GROUPS = {
	style: new Set([
		"RecalculateStyles",
		"ScheduleStyleRecalculation",
		"StyleRecalcInvalidationTracking",
		"UpdateLayoutTree",
	]),
	layout: new Set(["Layout", "LayoutNG", "InvalidateLayout"]),
	paint: new Set([
		"Paint",
		"PaintImage",
		"PaintArtifactCompositor",
		"RasterTask",
		"RecordRaster",
	]),
	commit: new Set([
		"Commit",
		"LayerTreeHost::DoUpdateLayers",
		"Layerize",
		"SubmitCompositorFrame",
	]),
	composite: new Set([
		"CompositeLayers",
		"ActivateLayerTree",
		"BeginMainThreadFrame",
	]),
};

function parseArgs(argv) {
	const args = new Map();
	for (let i = 2; i < argv.length; i += 1) {
		const key = argv[i];
		if (!key.startsWith("--")) continue;
		const value = argv[i + 1];
		if (!value || value.startsWith("--")) {
			args.set(key, "true");
			continue;
		}
		args.set(key, value);
		i += 1;
	}
	return args;
}

async function listTraceFiles(dir) {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await listTraceFiles(fullPath)));
		} else if (entry.isFile() && entry.name.endsWith(".json")) {
			files.push(fullPath);
		}
	}
	return files;
}

function percentile(sortedValues, p) {
	if (sortedValues.length === 0) return 0;
	if (sortedValues.length === 1) return sortedValues[0];
	const index = (sortedValues.length - 1) * p;
	const lower = Math.floor(index);
	const upper = Math.ceil(index);
	if (lower === upper) return sortedValues[lower];
	const blend = index - lower;
	return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * blend;
}

function summarize(values) {
	if (values.length === 0) {
		return { meanMs: 0, medianMs: 0, p95Ms: 0 };
	}
	const sorted = [...values].sort((a, b) => a - b);
	const total = values.reduce((sum, value) => sum + value, 0);
	return {
		meanMs: total / values.length,
		medianMs: percentile(sorted, 0.5),
		p95Ms: percentile(sorted, 0.95),
	};
}

function classifyEvent(name) {
	for (const [group, names] of Object.entries(EVENT_GROUPS)) {
		if (names.has(name)) return group;
	}

	if (name.includes("Layout")) return "layout";
	if (name.includes("Paint") || name.includes("Raster")) return "paint";
	if (name.includes("Commit") || name.includes("LayerTree")) return "commit";
	if (name.includes("Composite")) return "composite";
	if (name.includes("Style")) return "style";
	return null;
}

function extractTraceEvents(parsedJson) {
	if (!Array.isArray(parsedJson)) return [];
	const events = [];
	for (const chunk of parsedJson) {
		if (chunk && Array.isArray(chunk.value)) {
			events.push(...chunk.value);
		} else if (chunk && typeof chunk === "object" && chunk.name) {
			events.push(chunk);
		}
	}
	return events;
}

async function analyzeTraceFile(filePath) {
	const raw = await fs.readFile(filePath, "utf8");
	const parsed = JSON.parse(raw);
	const events = extractTraceEvents(parsed);

	const totals = {
		style: 0,
		layout: 0,
		paint: 0,
		commit: 0,
		composite: 0,
	};
	const counts = {
		style: 0,
		layout: 0,
		paint: 0,
		commit: 0,
		composite: 0,
	};

	for (const event of events) {
		if (!event || event.ph !== "X" || typeof event.dur !== "number") continue;
		const group = classifyEvent(String(event.name || ""));
		if (!group) continue;
		const durationMs = event.dur / 1000;
		totals[group] += durationMs;
		counts[group] += 1;
	}

	return { totals, counts };
}

function getBenchmarkLabel(traceFilePath, traceRoot) {
	const relative = path.relative(traceRoot, traceFilePath);
	const parts = relative.split(path.sep);
	return parts.length > 1 ? parts[0] : "unknown";
}

function formatNumber(value) {
	return Number(value.toFixed(3));
}

async function main() {
	const args = parseArgs(process.argv);
	const traceDirArg = args.get("--trace-dir");
	if (!traceDirArg) {
		throw new Error("Missing required flag: --trace-dir <path>");
	}

	const outputArg = args.get("--output");
	const traceDir = path.resolve(process.cwd(), traceDirArg);
	const traceFiles = await listTraceFiles(traceDir);

	const grouped = new Map();
	for (const traceFile of traceFiles) {
		const label = getBenchmarkLabel(traceFile, traceDir);
		const analysis = await analyzeTraceFile(traceFile);
		if (!grouped.has(label)) {
			grouped.set(label, []);
		}
		grouped.get(label).push(analysis);
	}

	const benchmarks = [];
	for (const [name, entries] of [...grouped.entries()].sort(([a], [b]) =>
		a.localeCompare(b),
	)) {
		const series = {
			style: [],
			layout: [],
			paint: [],
			commit: [],
			composite: [],
		};
		const countSeries = {
			style: [],
			layout: [],
			paint: [],
			commit: [],
			composite: [],
		};

		for (const entry of entries) {
			for (const key of Object.keys(series)) {
				series[key].push(entry.totals[key]);
				countSeries[key].push(entry.counts[key]);
			}
		}

		benchmarks.push({
			name,
			samples: entries.length,
			totalsMs: {
				style: summarize(series.style),
				layout: summarize(series.layout),
				paint: summarize(series.paint),
				commit: summarize(series.commit),
				composite: summarize(series.composite),
			},
			counts: {
				style: summarize(countSeries.style),
				layout: summarize(countSeries.layout),
				paint: summarize(countSeries.paint),
				commit: summarize(countSeries.commit),
				composite: summarize(countSeries.composite),
			},
		});
	}

	const result = {
		generatedAt: new Date().toISOString(),
		traceDir,
		traceFiles: traceFiles.length,
		benchmarkCount: benchmarks.length,
		benchmarks: benchmarks.map((benchmark) => ({
			...benchmark,
			totalsMs: Object.fromEntries(
				Object.entries(benchmark.totalsMs).map(([key, stats]) => [
					key,
					{
						meanMs: formatNumber(stats.meanMs),
						medianMs: formatNumber(stats.medianMs),
						p95Ms: formatNumber(stats.p95Ms),
					},
				]),
			),
			counts: Object.fromEntries(
				Object.entries(benchmark.counts).map(([key, stats]) => [
					key,
					{
						meanMs: formatNumber(stats.meanMs),
						medianMs: formatNumber(stats.medianMs),
						p95Ms: formatNumber(stats.p95Ms),
					},
				]),
			),
		})),
	};

	const output = JSON.stringify(result, null, 2);
	if (outputArg) {
		const outputPath = path.resolve(process.cwd(), outputArg);
		await fs.mkdir(path.dirname(outputPath), { recursive: true });
		await fs.writeFile(outputPath, `${output}\n`);
		console.log(`Wrote ${outputPath}`);
		return;
	}

	console.log(output);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
