import { getImageBlurSvg } from "/2026/svgFilter.js";
import { svgBlurImage } from "/2026/svgFilter2.js";

const TECHNIQUES = new Set([
	"backdrop-filter",
	"filter",
	"nextjs-blur",
	"svg-blur",
	"svg-blur-css",
]);

const SECTION_COUNT = 7;
const CARDS_PER_SECTION = 6;

function nextFrame() {
	return new Promise((resolve) => {
		let settled = false;
		const timeoutId = window.setTimeout(() => {
			if (settled) return;
			settled = true;
			resolve(performance.now());
		}, 50);

		requestAnimationFrame((timestamp) => {
			if (settled) return;
			settled = true;
			window.clearTimeout(timeoutId);
			resolve(timestamp);
		});
	});
}

async function waitFrames(count) {
	for (let i = 0; i < count; i += 1) {
		await nextFrame();
	}
}

function clampNumber(value, min, max, fallback) {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) return fallback;
	return Math.min(max, Math.max(min, numeric));
}

function parseTechnique(raw) {
	if (TECHNIQUES.has(raw)) return raw;
	return "backdrop-filter";
}

function parseContentVisibility(raw) {
	if (raw === "auto" || raw === "1" || raw === "true") {
		return true;
	}
	return false;
}

function defaultImageUrlForLocation(location = window.location) {
	const pathname = String(location?.pathname || "");
	if (pathname.startsWith("/benchmarks/")) {
		return "/original/beach.jpg";
	}

	return "/demo/original/beach.jpg";
}

function cssUrl(url) {
	return `url("${String(url).replace(/"/g, '\\"')}")`;
}

function ensureGlobalStyles() {
	if (document.querySelector("#bench-styles")) return;

	const style = document.createElement("style");
	style.id = "bench-styles";
	style.textContent = `
		:root {
			color-scheme: dark;
			font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
		}

		* {
			box-sizing: border-box;
		}

		body {
			margin: 0;
			background: #0a0d13;
			color: #e5e9f0;
		}

		.bench-root {
			display: grid;
			grid-template-rows: auto 1fr;
			height: 100vh;
			overflow: hidden;
			background:
				radial-gradient(1200px 700px at 5% -10%, rgba(74, 123, 255, 0.2), transparent 62%),
				radial-gradient(1000px 650px at 98% 0%, rgba(255, 109, 171, 0.16), transparent 58%),
				linear-gradient(180deg, #0d1119 0%, #090c12 100%);
		}

		.bench-header {
			position: sticky;
			top: 0;
			z-index: 40;
			display: grid;
			grid-template-columns: 1fr auto;
			align-items: center;
			gap: 1rem;
			padding: 0.9rem 1.25rem;
			border-bottom: 1px solid rgba(139, 162, 204, 0.2);
			background: rgba(9, 12, 18, 0.8);
			backdrop-filter: blur(8px);
		}

		.bench-header h1 {
			margin: 0;
			font-size: 0.95rem;
			font-weight: 600;
			letter-spacing: 0.015em;
		}

		.bench-header p {
			margin: 0.18rem 0 0;
			font-size: 0.78rem;
			color: #9eaac4;
		}

		.bench-badges {
			display: flex;
			gap: 0.45rem;
			flex-wrap: wrap;
			justify-content: flex-end;
		}

		.bench-badge {
			border: 1px solid rgba(130, 150, 190, 0.3);
			padding: 0.28rem 0.5rem;
			border-radius: 999px;
			background: rgba(18, 24, 35, 0.72);
			font-size: 0.69rem;
			color: #d6ddf0;
		}

		.bench-viewport {
			overflow: auto;
			scroll-behavior: auto;
			padding: 0.8rem 0 1.1rem;
			contain: strict;
		}

		.bench-main {
			width: min(1300px, calc(100vw - 2rem));
			margin: 0 auto;
		}

		.content-section {
			margin-bottom: 0.95rem;
			border: 1px solid rgba(130, 150, 190, 0.2);
			border-radius: 14px;
			overflow: hidden;
			background: rgba(15, 20, 31, 0.74);
		}

		.content-section-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 1rem;
			padding: 0.85rem 1rem;
			border-bottom: 1px solid rgba(130, 150, 190, 0.2);
			background: linear-gradient(180deg, rgba(31, 38, 52, 0.45), rgba(17, 22, 31, 0.25));
		}

		.content-section-header h2 {
			font-size: 0.88rem;
			margin: 0;
			font-weight: 600;
		}

		.content-section-header p {
			font-size: 0.75rem;
			margin: 0.22rem 0 0;
			color: #98a8c9;
		}

		.chips {
			display: flex;
			flex-wrap: wrap;
			gap: 0.4rem;
		}

		.chip {
			font-size: 0.68rem;
			padding: 0.22rem 0.5rem;
			border-radius: 999px;
			color: #d2dcf6;
			border: 1px solid rgba(120, 149, 218, 0.4);
			background: rgba(28, 46, 83, 0.5);
			will-change: transform;
			animation: chip-float 1800ms ease-in-out infinite;
		}

		.chip:nth-child(2n) {
			animation-duration: 2300ms;
		}

		.chip:nth-child(3n) {
			animation-duration: 2700ms;
		}

		.cards {
			padding: 1rem;
			display: grid;
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 0.85rem;
		}

		.card {
			position: relative;
			border: 1px solid rgba(114, 134, 176, 0.26);
			border-radius: 12px;
			padding: 0.66rem;
			background:
				linear-gradient(180deg, rgba(29, 38, 54, 0.45) 0%, rgba(17, 22, 31, 0.42) 100%);
			box-shadow:
				inset 0 0 0 0.5px rgba(182, 198, 240, 0.28),
				0 8px 24px rgba(3, 5, 10, 0.32);
			will-change: transform, opacity;
			animation: card-drift 6200ms ease-in-out infinite;
		}

		.card:nth-child(2n) {
			animation-duration: 7800ms;
		}

		.card:nth-child(3n) {
			animation-duration: 8400ms;
		}

		.media-stack {
			position: relative;
			aspect-ratio: 16 / 10;
			border-radius: 10px;
			overflow: hidden;
			background: #131a29;
			contain: paint;
		}

		.media-real {
			position: absolute;
			inset: 0;
			width: 100%;
			height: 100%;
			object-fit: cover;
			opacity: 0.92;
			transform: scale(1.01);
		}

		.placeholder-root {
			position: absolute;
			inset: 0;
			pointer-events: none;
			will-change: opacity, transform, filter;
		}

		.placeholder-layer {
			position: absolute;
			inset: 0;
			background-size: cover;
			background-position: center;
			background-repeat: no-repeat;
		}

		.placeholder-root.tech-backdrop .placeholder-backdrop-glass {
			background: rgba(255, 255, 255, 0.01);
		}

		.placeholder-root.tech-filter .placeholder-filtered {
			transform-origin: center center;
		}

		.placeholder-root.tech-svg img,
		.placeholder-root.tech-nextjs img {
			position: absolute;
			inset: 0;
			width: 100%;
			height: 100%;
			object-fit: cover;
			transform: scale(1.03);
		}

		.card h3 {
			font-size: 0.77rem;
			font-weight: 600;
			margin: 0.58rem 0 0.22rem;
		}

		.card p {
			font-size: 0.69rem;
			line-height: 1.35;
			margin: 0;
			color: #99a7c6;
		}

		.meter {
			opacity: 0;
			height: 0;
			overflow: hidden;
			contain: strict;
		}

		.bench-root.theme-alt .content-section {
			background: rgba(19, 25, 38, 0.75);
		}

		.bench-root.theme-alt .card {
			background:
				linear-gradient(180deg, rgba(34, 45, 64, 0.46) 0%, rgba(18, 24, 34, 0.48) 100%);
		}

		@keyframes chip-float {
			0% { transform: translate3d(0, 0, 0); }
			50% { transform: translate3d(1px, -1px, 0); }
			100% { transform: translate3d(0, 0, 0); }
		}

		@keyframes card-drift {
			0% { transform: translate3d(0, 0, 0); }
			25% { transform: translate3d(0, -1px, 0); }
			50% { transform: translate3d(0.5px, 0, 0); }
			75% { transform: translate3d(0, 1px, 0); }
			100% { transform: translate3d(0, 0, 0); }
		}
	`;
	document.head.append(style);
}

function ensureSvgFilter(blurPx) {
	let svg = document.querySelector("#bench-svg-filter-root");
	let blurNode = document.querySelector("#bench-svg-filter-blur");

	if (!svg || !blurNode) {
		svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("id", "bench-svg-filter-root");
		svg.setAttribute("width", "0");
		svg.setAttribute("height", "0");
		svg.style.position = "absolute";
		svg.style.visibility = "hidden";

		const filter = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"filter",
		);
		filter.setAttribute("id", "benchSvgBlur");
		filter.setAttribute("color-interpolation-filters", "sRGB");
		blurNode = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"feGaussianBlur",
		);
		blurNode.setAttribute("id", "bench-svg-filter-blur");
		blurNode.setAttribute("in", "SourceGraphic");
		blurNode.setAttribute("stdDeviation", String(blurPx));
		filter.append(blurNode);
		svg.append(filter);
		document.body.append(svg);
	}

	blurNode.setAttribute("stdDeviation", String(blurPx));
}

async function loadImage(url) {
	const image = new Image();
	image.decoding = "async";
	const ready = new Promise((resolve, reject) => {
		image.onload = () => resolve();
		image.onerror = () => reject(new Error(`Failed to load image: ${url}`));
	});
	image.src = url;

	if (typeof image.decode === "function") {
		await image.decode().catch(() => ready);
	} else {
		await ready;
	}
	return image;
}

function makePlaceholderDataUrl(image, size = 52) {
	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;

	const ctx = canvas.getContext("2d", { alpha: false });
	if (!ctx) {
		throw new Error("Canvas 2D context unavailable");
	}

	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = "high";
	ctx.drawImage(image, 0, 0, size, size);

	try {
		return canvas.toDataURL("image/webp", 0.72);
	} catch {
		return canvas.toDataURL("image/jpeg", 0.7);
	}
}

function buildPlaceholderNode(config, sources) {
	const node = document.createElement("div");
	node.className = "placeholder-root";
	node.dataset.technique = config.technique;
	node.style.opacity = "1";

	const blurPx = config.blurPx;
	const baseScale = (1 + blurPx * 0.015).toFixed(4);

	if (config.technique === "backdrop-filter") {
		node.classList.add("tech-backdrop");

		const base = document.createElement("div");
		base.className = "placeholder-layer placeholder-base";
		base.style.backgroundImage = cssUrl(sources.placeholderDataUrl);

		const overlay = document.createElement("div");
		overlay.className = "placeholder-layer placeholder-backdrop-glass";
		overlay.style.backdropFilter = `blur(${blurPx}px)`;
		overlay.style.webkitBackdropFilter = `blur(${blurPx}px)`;

		node.append(base, overlay);
		return node;
	}

	if (config.technique === "filter") {
		node.classList.add("tech-filter");
		const filtered = document.createElement("div");
		filtered.className = "placeholder-layer placeholder-filtered";
		filtered.style.backgroundImage = cssUrl(sources.placeholderDataUrl);
		filtered.style.filter = `blur(${blurPx}px)`;
		filtered.style.transform = `scale(${baseScale})`;
		node.append(filtered);
		return node;
	}

	if (config.technique === "svg-blur-css") {
		node.classList.add("tech-svg-css");
		ensureSvgFilter(blurPx);
		const filtered = document.createElement("div");
		filtered.className = "placeholder-layer placeholder-svg-css";
		const encodedSvg = svgBlurImage(
			sources.placeholderDataUrl,
			sources.width,
			sources.height,
			0,
		);
		filtered.style.backgroundImage = cssUrl(
			`data:image/svg+xml;charset=utf-8,${encodedSvg}`,
		);
		filtered.style.filter = "url(#benchSvgBlur)";
		node.append(filtered);
		return node;
	}

	if (config.technique === "svg-blur") {
		node.classList.add("tech-svg");
		const image = document.createElement("img");
		const encodedSvg = encodeURIComponent(
			svgBlurImage(
				sources.placeholderDataUrl,
				sources.width,
				sources.height,
				blurPx,
			),
		);
		image.src = `data:image/svg+xml;charset=utf-8,${encodedSvg}`;
		image.alt = "";
		node.append(image);
		return node;
	}

	node.classList.add("tech-nextjs");
	const image = document.createElement("img");
	image.src = `data:image/svg+xml;charset=utf-8,${getImageBlurSvg({
		widthInt: sources.width,
		heightInt: sources.height,
		blurWidth: sources.width,
		blurHeight: sources.height,
		blurDataURL: sources.placeholderDataUrl,
		objectFit: "cover",
		blurStd: blurPx,
	})}`;
	image.alt = "";
	node.append(image);
	return node;
}

function startAmbientJsAnimations(elements) {
	if (elements.length === 0) {
		return () => {};
	}

	const animated = elements.slice(0, Math.min(14, elements.length));
	const origin = performance.now();
	let frameHandle = 0;
	let running = true;

	const tick = (now) => {
		if (!running) return;
		const t = (now - origin) / 1000;
		for (let i = 0; i < animated.length; i += 1) {
			const el = animated[i];
			const x = Math.sin(t * 1.2 + i * 0.41) * 1.35;
			const y = Math.cos(t * 1.05 + i * 0.27) * 1.1;
			el.style.transform = `translate3d(${x.toFixed(3)}px, ${y.toFixed(3)}px, 0)`;
		}
		frameHandle = requestAnimationFrame(tick);
	};

	frameHandle = requestAnimationFrame(tick);

	return () => {
		running = false;
		cancelAnimationFrame(frameHandle);
	};
}

function createSectionTitle(index) {
	return [
		"Featured destinations",
		"Editors picks",
		"Recommended stories",
		"Popular products",
		"Trending creators",
		"Weekend plans",
		"Travel and culture",
	][index % 7];
}

function createCardCopy(index) {
	return `Fast-loading media card ${index + 1} with layered visuals, progressive rendering, and animated accents to mimic modern feeds.`;
}

function parseConfigFromLocation(location = window.location) {
	const params = new URLSearchParams(location.search);
	const technique = parseTechnique(params.get("technique") ?? "");
	const blurPx = clampNumber(params.get("blur"), 0, 80, 20);
	const contentVisibilityAuto = parseContentVisibility(
		params.get("contentVisibility") ?? "",
	);
	const imageUrl = params.get("image") || defaultImageUrlForLocation(location);

	return {
		technique,
		blurPx,
		contentVisibilityAuto,
		imageUrl,
	};
}

export async function setupBenchmarkScene(location = window.location) {
	const config = parseConfigFromLocation(location);
	ensureGlobalStyles();

	const sourceImage = await loadImage(config.imageUrl);
	const placeholderDataUrl = makePlaceholderDataUrl(sourceImage);
	const sources = {
		width: sourceImage.naturalWidth || 1280,
		height: sourceImage.naturalHeight || 720,
		realImageUrl: config.imageUrl,
		placeholderDataUrl,
	};

	document.body.textContent = "";

	const root = document.createElement("div");
	root.className = "bench-root";

	const header = document.createElement("header");
	header.className = "bench-header";
	header.innerHTML = `
		<div>
			<h1>LQIP blur benchmark scene</h1>
			<p>Simulated modern website layout with moving composited UI elements.</p>
		</div>
	`;

	const badgeRow = document.createElement("div");
	badgeRow.className = "bench-badges";
	for (const text of [
		`technique: ${config.technique}`,
		`blur: ${config.blurPx}px`,
		`content-visibility: ${config.contentVisibilityAuto ? "auto" : "off"}`,
	]) {
		const badge = document.createElement("span");
		badge.className = "bench-badge";
		badge.textContent = text;
		badgeRow.append(badge);
	}
	header.append(badgeRow);

	const viewport = document.createElement("div");
	viewport.className = "bench-viewport";
	const main = document.createElement("main");
	main.className = "bench-main";
	viewport.append(main);

	const placeholders = [];
	const cards = [];
	const layoutTargets = [];
	const jsAnimated = [];

	for (let sectionIndex = 0; sectionIndex < SECTION_COUNT; sectionIndex += 1) {
		const section = document.createElement("section");
		section.className = "content-section";
		if (config.contentVisibilityAuto) {
			section.style.contentVisibility = "auto";
			section.style.containIntrinsicSize = "940px";
		}

		const sectionHeader = document.createElement("div");
		sectionHeader.className = "content-section-header";

		const titleGroup = document.createElement("div");
		const title = document.createElement("h2");
		title.textContent = createSectionTitle(sectionIndex);
		const subtitle = document.createElement("p");
		subtitle.textContent =
			"Image-rich section with progressive placeholders and layered UI.";
		titleGroup.append(title, subtitle);

		const chips = document.createElement("div");
		chips.className = "chips";
		for (let chipIndex = 0; chipIndex < 4; chipIndex += 1) {
			const chip = document.createElement("span");
			chip.className = "chip";
			chip.textContent = `Live ${sectionIndex + 1}.${chipIndex + 1}`;
			chips.append(chip);
		}

		sectionHeader.append(titleGroup, chips);
		section.append(sectionHeader);

		const cardsGrid = document.createElement("div");
		cardsGrid.className = "cards";

		for (let cardIndex = 0; cardIndex < CARDS_PER_SECTION; cardIndex += 1) {
			const absoluteIndex = sectionIndex * CARDS_PER_SECTION + cardIndex;
			const card = document.createElement("article");
			card.className = "card";

			const mediaStack = document.createElement("div");
			mediaStack.className = "media-stack";
			jsAnimated.push(mediaStack);

			const realImage = document.createElement("img");
			realImage.className = "media-real";
			realImage.src = sources.realImageUrl;
			realImage.alt = "";
			realImage.loading = "eager";
			realImage.decoding = "async";

			const placeholder = buildPlaceholderNode(config, sources);
			placeholders.push(placeholder);

			mediaStack.append(realImage, placeholder);

			const heading = document.createElement("h3");
			heading.textContent = `Card ${absoluteIndex + 1}`;
			layoutTargets.push(heading);

			const paragraph = document.createElement("p");
			paragraph.textContent = createCardCopy(absoluteIndex);
			layoutTargets.push(paragraph);

			card.append(mediaStack, heading, paragraph);
			cards.push(card);
			cardsGrid.append(card);
		}

		section.append(cardsGrid);
		main.append(section);
	}

	const meter = document.createElement("div");
	meter.className = "meter";
	main.append(meter);

	root.append(header, viewport);
	document.body.append(root);

	const stopAmbientAnimations = startAmbientJsAnimations(jsAnimated);
	await waitFrames(3);

	return {
		config,
		root,
		viewport,
		meter,
		placeholders,
		cards,
		layoutTargets,
		stopAmbientAnimations,
	};
}

function getMaxScroll(viewport) {
	return Math.max(0, viewport.scrollHeight - viewport.clientHeight);
}

export async function runReflowPaintBenchmark(location = window.location) {
	const scene = await setupBenchmarkScene(location);
	const maxScroll = getMaxScroll(scene.viewport);

	await waitFrames(2);

	const iterations = 90;
	const startTs = performance.now();

	for (let i = 0; i < iterations; i += 1) {
		scene.root.classList.toggle("theme-alt", i % 2 === 0);
		if (maxScroll > 0) {
			const progress = ((i * 37) % iterations) / (iterations - 1);
			scene.viewport.scrollTop = progress * maxScroll;
		}

		for (let j = 0; j < scene.layoutTargets.length; j += 1) {
			const target = scene.layoutTargets[j];
			target.style.marginTop = `${((i + j) % 5) * 0.6}px`;
			target.style.paddingRight = `${((i + j) % 4) * 0.4}px`;
		}

		const baseOpacity = 0.35 + Math.abs(Math.sin(i * 0.35)) * 0.65;
		for (let j = 0; j < scene.placeholders.length; j += 1) {
			const value = Math.max(0, baseOpacity - (j % 5) * 0.04);
			scene.placeholders[j].style.opacity = value.toFixed(3);
		}

		const probeCard = scene.cards[i % scene.cards.length];
		const rect = probeCard.getBoundingClientRect();
		scene.meter.textContent = `${i}:${rect.height.toFixed(2)}`;
		void scene.viewport.offsetHeight;

		await nextFrame();
	}

	scene.stopAmbientAnimations();
	return {
		runtimeMs: Math.max(0.01, performance.now() - startTs),
	};
}

export async function runAnimationBenchmark(location = window.location) {
	const scene = await setupBenchmarkScene(location);
	const maxScroll = getMaxScroll(scene.viewport);

	await waitFrames(2);

	const durationMs = 2200;
	let frameCount = 0;
	let previousTs = 0;
	let totalFrameTime = 0;

	const startTs = performance.now();

	for (;;) {
		const now = await nextFrame();
		frameCount += 1;
		if (previousTs > 0) {
			totalFrameTime += now - previousTs;
		}
		previousTs = now;

		const elapsed = now - startTs;
		const progress = Math.min(1, elapsed / durationMs);
		const opacity = 1 - progress;

		for (let i = 0; i < scene.placeholders.length; i += 1) {
			scene.placeholders[i].style.opacity = opacity.toFixed(3);
		}

		if (maxScroll > 0) {
			scene.viewport.scrollTop = progress * maxScroll;
		}

		for (let i = 0; i < scene.layoutTargets.length; i += 5) {
			const node = scene.layoutTargets[i];
			node.style.marginLeft = `${Math.sin((elapsed + i) * 0.006) * 0.9}px`;
		}

		void scene.viewport.offsetWidth;
		scene.meter.textContent = `${opacity.toFixed(3)}:${frameCount}`;

		if (progress >= 1) {
			break;
		}
	}

	const totalMs = Math.max(1, performance.now() - startTs);
	const fps = (frameCount * 1000) / totalMs;
	const avgFrameMs =
		frameCount > 1 ? totalFrameTime / (frameCount - 1) : totalMs;

	window.__benchmarkFps = fps;
	window.__benchmarkAvgFrameMs = avgFrameMs;
	scene.stopAmbientAnimations();
	return {
		runtimeMs: totalMs,
		fps,
		avgFrameMs,
	};
}
