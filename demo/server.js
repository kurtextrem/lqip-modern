import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const host = "127.0.0.1";
const port = 3000;
const cacheVersion = "v1";

const originalDir = path.join(__dirname, "original");
const processedDir = path.join(__dirname, "processed");
const allowedOriginals = new Map();
for (const file of fs.readdirSync(originalDir)) {
	const ext = path.extname(file).toLowerCase();
	if ([".jpg", ".jpeg", ".png", ".webp", ".avif"].includes(ext)) {
		const filename = path.basename(file, ext);
		allowedOriginals.set(filename, path.join(originalDir, file));
	}
}

const cache = new Map();
fs.mkdirSync(processedDir, { recursive: true });

function defaultOptionState() {
	return {
		avifLossless: false,
		avifChromaSubsampling: "4:2:0",
		avifBitdepth: 8,
		webpSmartSubsample: true,
		webpSmartDeblock: false,
		webpAlphaQuality: 100,
		webpLossless: false,
		webpNearLossless: false,
	};
}

function optionsSuffix({
	format,
	avifLossless,
	avifChromaSubsampling,
	avifBitdepth,
	webpSmartSubsample,
	webpSmartDeblock,
	webpAlphaQuality,
	webpLossless,
	webpNearLossless,
}) {
	const defaults = defaultOptionState();
	let payload;

	if (format === "avif") {
		payload = {
			avifLossless,
			avifChromaSubsampling,
			avifBitdepth,
		};

		if (
			payload.avifLossless === defaults.avifLossless &&
			payload.avifChromaSubsampling === defaults.avifChromaSubsampling &&
			payload.avifBitdepth === defaults.avifBitdepth
		) {
			return "";
		}
	} else {
		payload = {
			webpSmartSubsample,
			webpSmartDeblock,
			webpAlphaQuality,
			webpLossless,
			webpNearLossless,
		};

		if (
			payload.webpSmartSubsample === defaults.webpSmartSubsample &&
			payload.webpSmartDeblock === defaults.webpSmartDeblock &&
			payload.webpAlphaQuality === defaults.webpAlphaQuality &&
			payload.webpLossless === defaults.webpLossless &&
			payload.webpNearLossless === defaults.webpNearLossless
		) {
			return "";
		}
	}

	const hash = crypto
		.createHash("sha256")
		.update(JSON.stringify(payload))
		.digest("hex")
		.slice(0, 8);
	return `-opts-${hash}`;
}

function modernOutputName({
	filename,
	format,
	size,
	quality,
	sharpBlurLevel,
	sharpBlurTarget,
	avifLossless,
	avifChromaSubsampling,
	avifBitdepth,
	webpSmartSubsample,
	webpSmartDeblock,
	webpAlphaQuality,
	webpLossless,
	webpNearLossless,
}) {
	const normalizedTarget = sharpBlurLevel === 0 ? "none" : sharpBlurTarget;
	const suffix =
		sharpBlurLevel === 0
			? optionsSuffix({
					format,
					avifLossless,
					avifChromaSubsampling,
					avifBitdepth,
					webpSmartSubsample,
					webpSmartDeblock,
					webpAlphaQuality,
					webpLossless,
					webpNearLossless,
				})
			: "";

	return `${filename}-lqip-modern-${format}-${size}-q${quality}-b${sharpBlurLevel}-t${normalizedTarget}${suffix}.${format}`;
}

function parseBool(value, fallback = false) {
	if (value === null) return fallback;
	return value === "1" || value === "true" || value === "yes";
}

function clampNumber(value, min, max, fallback) {
	const num = Number(value);
	if (!Number.isFinite(num)) return fallback;
	return Math.min(max, Math.max(min, num));
}

function contentTypeForPath(filePath) {
	const ext = path.extname(filePath).toLowerCase();
	if (ext === ".html") return "text/html; charset=utf-8";
	if (ext === ".js") return "application/javascript; charset=utf-8";
	if (ext === ".css") return "text/css; charset=utf-8";
	if (ext === ".json") return "application/json; charset=utf-8";
	if (ext === ".svg") return "image/svg+xml";
	if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
	if (ext === ".png") return "image/png";
	if (ext === ".webp") return "image/webp";
	if (ext === ".avif") return "image/avif";
	return "application/octet-stream";
}

async function handleModern(req, res, url) {
	const filename = url.searchParams.get("image");
	const originalPath = filename ? allowedOriginals.get(filename) : null;
	if (!originalPath) {
		res.statusCode = 400;
		res.end("Invalid image");
		return;
	}

	const format = url.searchParams.get("format");
	if (!format || !["webp", "avif"].includes(format)) {
		res.statusCode = 400;
		res.end("Invalid format");
		return;
	}

	const size = clampNumber(url.searchParams.get("size"), 1, 64, 16);
	const quality = clampNumber(url.searchParams.get("quality"), 1, 100, 50);
	const sharpBlurLevel = clampNumber(
		url.searchParams.get("sharpBlurLevel"),
		0,
		3,
		0,
	);
	const sharpBlurTarget =
		url.searchParams.get("sharpBlurTarget") === "original"
			? "original"
			: "placeholder";

	const avifLossless = parseBool(url.searchParams.get("avifLossless"), false);
	const avifChromaSubsampling =
		url.searchParams.get("avifChromaSubsampling") === "444" ? "4:4:4" : "4:2:0";
	const avifBitdepthParam = Number(url.searchParams.get("avifBitdepth"));
	const avifBitdepth = [8, 10, 12].includes(avifBitdepthParam)
		? avifBitdepthParam
		: 8;

	const webpSmartSubsample = parseBool(
		url.searchParams.get("webpSmartSubsample"),
		true,
	);
	const webpSmartDeblock = parseBool(
		url.searchParams.get("webpSmartDeblock"),
		false,
	);
	const webpAlphaQuality = clampNumber(
		url.searchParams.get("webpAlphaQuality"),
		0,
		100,
		100,
	);
	const webpLossless = parseBool(url.searchParams.get("webpLossless"), false);
	const webpNearLossless = parseBool(
		url.searchParams.get("webpNearLossless"),
		false,
	);

	const cacheKey = JSON.stringify({
		cacheVersion,
		filename,
		format,
		size,
		quality,
		sharpBlurLevel,
		sharpBlurTarget,
		avifLossless,
		avifChromaSubsampling,
		avifBitdepth,
		webpSmartSubsample,
		webpSmartDeblock,
		webpAlphaQuality,
		webpLossless,
		webpNearLossless,
	});
	const outputName = modernOutputName({
		filename,
		format,
		size,
		quality,
		sharpBlurLevel,
		sharpBlurTarget,
		avifLossless,
		avifChromaSubsampling,
		avifBitdepth,
		webpSmartSubsample,
		webpSmartDeblock,
		webpAlphaQuality,
		webpLossless,
		webpNearLossless,
	});
	const cacheFilePath = path.join(processedDir, outputName);

	const cached = cache.get(cacheKey);
	if (cached) {
		res.statusCode = 200;
		res.setHeader("Content-Type", cached.contentType);
		res.setHeader("Content-Length", cached.buffer.length);
		res.setHeader("X-Modern-Cache", "memory");
		res.end(cached.buffer);
		return;
	}

	if (fs.existsSync(cacheFilePath)) {
		const buffer = await fs.promises.readFile(cacheFilePath);
		cache.set(cacheKey, {
			buffer,
			contentType: contentTypeForPath(cacheFilePath),
		});
		res.statusCode = 200;
		res.setHeader("Content-Type", contentTypeForPath(cacheFilePath));
		res.setHeader("Content-Length", buffer.length);
		res.setHeader("X-Modern-Cache", "processed");
		res.end(buffer);
		return;
	}

	let pipeline = sharp(originalPath).rotate();

	if (sharpBlurLevel > 0 && sharpBlurTarget === "original") {
		pipeline = pipeline.blur(sharpBlurLevel);
	}

	pipeline = pipeline.resize(size, size, { fit: "inside" });

	if (sharpBlurLevel > 0 && sharpBlurTarget === "placeholder") {
		pipeline = pipeline.blur(sharpBlurLevel);
	}

	let output;
	let contentType;
	if (format === "webp") {
		output = pipeline.webp({
			quality,
			lossless: webpLossless,
			nearLossless: webpNearLossless,
			smartSubsample: webpSmartSubsample,
			smartDeblock: webpSmartDeblock,
			alphaQuality: webpAlphaQuality,
		});
		contentType = "image/webp";
	} else {
		output = pipeline.avif({
			quality,
			lossless: avifLossless,
			chromaSubsampling: avifChromaSubsampling,
			bitdepth: avifBitdepth,
			effort: 4,
		});
		contentType = "image/avif";
	}

	const buffer = await output.toBuffer();
	cache.set(cacheKey, { buffer, contentType });
	await fs.promises.writeFile(cacheFilePath, buffer);

	res.statusCode = 200;
	res.setHeader("Content-Type", contentType);
	res.setHeader("Content-Length", buffer.length);
	res.setHeader("X-Modern-Cache", "miss");
	res.end(buffer);
}

function serveStatic(req, res, url) {
	let pathname = decodeURIComponent(url.pathname);
	if (pathname === "/") pathname = "/index.html";
	const safePath = path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "");
	const filePath = path.join(__dirname, safePath);

	if (!filePath.startsWith(__dirname)) {
		res.statusCode = 403;
		res.end("Forbidden");
		return;
	}

	if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
		res.statusCode = 404;
		res.end("Not found");
		return;
	}

	res.statusCode = 200;
	res.setHeader("Content-Type", contentTypeForPath(filePath));
	fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
	try {
		const url = new URL(req.url, `http://${host}:${port}`);
		if (url.pathname === "/api/modern") {
			await handleModern(req, res, url);
			return;
		}

		serveStatic(req, res, url);
	} catch (error) {
		res.statusCode = 500;
		res.setHeader("Content-Type", "text/plain; charset=utf-8");
		res.end(`Server error: ${error.message}`);
	}
});

server.listen(port, host, () => {
	console.log(`Demo server running at http://${host}:${port}`);
});
