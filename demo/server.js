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
const AVIF_HASH_HEADER_BASE64 =
	"AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUEAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAACcAAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAgAAAAIAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgSAAAAAAABNjb2xybmNseAABAA0ABoAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAAC9tZGF0EgAKCDgIv+UBDQaQMhkcgAAAQAA=";
const AVIF_HASH_HEADER = Buffer.from(AVIF_HASH_HEADER_BASE64, "base64");
const AVIF_HASH_FIXED_PREFIX_BYTES = AVIF_HASH_HEADER.length;

const originalDir = path.join(__dirname, "original");
const processedDir = path.join(__dirname, "processed1");
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

	if (format === "avif" || format === "avifhash") {
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
	if (ext === ".avifhash") return "application/octet-stream";
	return "application/octet-stream";
}

function qindexToReducedBits(qindex) {
	switch (qindex) {
		case 28:
			return 0;
		case 27:
			return 1;
		case 26:
			return 2;
		case 25:
			return 3;
		default:
			return 0;
	}
}

function stripAvifToHash(avifBuffer) {
	if (avifBuffer.length <= AVIF_HASH_FIXED_PREFIX_BYTES) {
		throw new Error("AVIF too small to strip to avifhash payload");
	}

	// These offsets are from the PoC 8x8 AVIF layout used in hydrateAvif.js.
	const qindexByte = avifBuffer[296];
	const reducedQIndex = qindexToReducedBits(qindexByte);
	const txModeSelect = (avifBuffer[301] & 0b0100_0000) !== 0;
	const hashHeader = (reducedQIndex & 0b11) | (txModeSelect ? 0b100 : 0);
	return Buffer.concat([
		Buffer.from([hashHeader]),
		avifBuffer.subarray(AVIF_HASH_FIXED_PREFIX_BYTES),
	]);
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
	if (!format || !["webp", "avif", "avifhash"].includes(format)) {
		res.statusCode = 400;
		res.end("Invalid format");
		return;
	}

	const requestedSize = clampNumber(url.searchParams.get("size"), 1, 64, 16);
	const size = format === "avifhash" ? 8 : requestedSize;
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

	const avifLossless =
		format === "avifhash"
			? false
			: parseBool(url.searchParams.get("avifLossless"), false);
	const avifChromaSubsampling =
		format === "avifhash"
			? "4:2:0"
			: url.searchParams.get("avifChromaSubsampling") === "444"
				? "4:4:4"
				: "4:2:0";
	const avifBitdepthParam = Number(url.searchParams.get("avifBitdepth"));
	const avifBitdepth = /** @type {8 | 10 | 12} */ (
		format === "avifhash"
			? 8
			: [8, 10, 12].includes(avifBitdepthParam)
				? avifBitdepthParam
				: 8
	);

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
		if (format === "avif") {
			res.setHeader(
				"X-Avif-Stripped-Bytes",
				String(stripAvifToHash(cached.buffer).length),
			);
		}
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
		if (format === "avif") {
			res.setHeader(
				"X-Avif-Stripped-Bytes",
				String(stripAvifToHash(buffer).length),
			);
		}
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
		contentType =
			format === "avifhash" ? "application/octet-stream" : "image/avif";
	}

	let buffer = await output.toBuffer();
	if (format === "avif") {
		const strippedBytes = stripAvifToHash(buffer).length;
		res.setHeader("X-Avif-Stripped-Bytes", String(strippedBytes));
	}

	if (format === "avifhash") {
		const fullAvifBytes = buffer.length;
		buffer = stripAvifToHash(buffer);
		res.setHeader("X-Avif-Stripped-Bytes", String(buffer.length));
		res.setHeader("X-AvifHash-Bytes", String(buffer.length));
		res.setHeader("X-Avif-Bytes", String(fullAvifBytes));
	}
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
