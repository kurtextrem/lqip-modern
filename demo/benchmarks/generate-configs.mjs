import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const baseUrl = process.env.BENCH_BASE_URL
	? process.env.BENCH_BASE_URL.replace(/\/+$/, "")
	: "";

const TECHNIQUES = [
	"backdrop-filter",
	"filter",
	"nextjs-blur",
	"svg-blur",
	"svg-blur-css",
];

const BLUR_RADII = [10, 20, 40];
const CONTENT_VISIBILITY_MODES = ["off", "auto"];

const TRACE_CATEGORIES = [
	"blink",
	"blink.user_timing",
	"cc",
	"devtools.timeline",
	"disabled-by-default-devtools.timeline",
	"disabled-by-default-devtools.timeline.frame",
	"disabled-by-default-devtools.timeline.layers",
	"disabled-by-default-devtools.timeline.picture",
	"gpu",
	"renderer.scheduler",
	"toplevel",
	"viz",
];

const BASE_BROWSER = {
	name: "chrome",
	headless: true,
	windowSize: {
		width: 1440,
		height: 900,
	},
};

function benchmarkName({ technique, blurPx, contentVisibility }) {
	return `${technique}-blur-${blurPx}-cv-${contentVisibility}`;
}

function benchmarkUrl(page, { technique, blurPx, contentVisibility }) {
	const params = new URLSearchParams();
	params.set("technique", technique);
	params.set("blur", String(blurPx));
	params.set("contentVisibility", contentVisibility);
	if (baseUrl) {
		return `${baseUrl}/benchmarks/${page}?${params.toString()}`;
	}
	return `demo/benchmarks/${page}?${params.toString()}`;
}

function createMatrix() {
	const matrix = [];
	for (const technique of TECHNIQUES) {
		for (const blurPx of BLUR_RADII) {
			for (const contentVisibility of CONTENT_VISIBILITY_MODES) {
				matrix.push({ technique, blurPx, contentVisibility });
			}
		}
	}
	return matrix;
}

function createReflowConfig() {
	const matrix = createMatrix();
	return {
		$schema: "../../node_modules/tachometer/config.schema.json",
		root: "../..",
		sampleSize: 12,
		timeout: 0,
		autoSampleConditions: ["0%"],
		benchmarks: matrix.map((variant) => ({
			name: benchmarkName(variant),
			url: benchmarkUrl("reflow-paint-benchmark.html", variant),
			measurement: {
				mode: "expression",
				name: "runtime-ms",
				expression:
					"window.__benchmarkError ? undefined : (Number.isFinite(window.tachometerResult) && window.tachometerResult > 0 ? window.tachometerResult : undefined)",
			},
			browser: {
				...BASE_BROWSER,
				trace: {
					logDir: "demo/benchmarks/results/reflow-traces",
					categories: TRACE_CATEGORIES,
				},
			},
		})),
	};
}

function createAnimationConfig() {
	const matrix = createMatrix();
	return {
		$schema: "../../node_modules/tachometer/config.schema.json",
		root: "../..",
		sampleSize: 12,
		timeout: 0,
		autoSampleConditions: ["0%"],
		benchmarks: matrix.map((variant) => ({
			name: benchmarkName(variant),
			url: benchmarkUrl("animation-benchmark.html", variant),
			measurement: [
				{
					mode: "expression",
					name: "runtime-ms",
					expression:
						"window.__benchmarkError ? undefined : (Number.isFinite(window.tachometerResult) && window.tachometerResult > 0 ? window.tachometerResult : undefined)",
				},
				{
					mode: "expression",
					name: "fps",
					expression:
						"window.__benchmarkError ? undefined : (Number.isFinite(window.__benchmarkFps) && window.__benchmarkFps > 0 ? window.__benchmarkFps : undefined)",
				},
				{
					mode: "expression",
					name: "avg-frame-ms",
					expression:
						"window.__benchmarkError ? undefined : (Number.isFinite(window.__benchmarkAvgFrameMs) && window.__benchmarkAvgFrameMs > 0 ? window.__benchmarkAvgFrameMs : undefined)",
				},
			],
			browser: {
				...BASE_BROWSER,
				trace: {
					logDir: "demo/benchmarks/results/animation-traces",
					categories: TRACE_CATEGORIES,
				},
			},
		})),
	};
}

async function main() {
	const reflowPath = path.join(__dirname, "tachometer-reflow.json");
	const animationPath = path.join(__dirname, "tachometer-animation.json");
	const resultsDir = path.join(__dirname, "results");

	await fs.mkdir(resultsDir, { recursive: true });
	await fs.writeFile(
		reflowPath,
		`${JSON.stringify(createReflowConfig(), null, 2)}\n`,
	);
	await fs.writeFile(
		animationPath,
		`${JSON.stringify(createAnimationConfig(), null, 2)}\n`,
	);

	console.log("Generated:");
	console.log(`- ${path.relative(process.cwd(), reflowPath)}`);
	console.log(`- ${path.relative(process.cwd(), animationPath)}`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
