import fs from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "node:url";
import globby from "globby";
import sharp from "sharp";
import colorthief from "colorthief";
import gip from "cssgip";
import { encode as encodeBlurhash } from "blurhash";
import { blurhashToCssGradientString } from "@unpic/placeholder";
import blurhashToCssPkg from "blurhash-to-css";

const { blurhashToCss } = blurhashToCssPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputGlob = path.join(__dirname, "original/*.{jpg,jpeg,png,webp,avif}");
const processedDir = path.join(__dirname, "processed");
const outputPath = path.join(__dirname, "dataset.json");

const MODERN_SIZES = [8, 16, 32];
const QUALITY_OPTIONS = [20, 50, 70, 80, 90, 100];
const BLUR_LEVELS = [
	{ id: "0", label: "none", sharpSigma: 0 },
	{ id: "1", label: "low", sharpSigma: 1 },
	{ id: "2", label: "medium", sharpSigma: 2 },
	{ id: "3", label: "high", sharpSigma: 3 },
];
const BLUR_TARGETS = ["placeholder", "original"];

function gcd(a, b) {
	return b ? gcd(b, a % b) : a;
}

function ratioString(width, height) {
	const divisor = gcd(width, height);
	return `${width / divisor}:${height / divisor}`;
}

function camelToKebab(name) {
	return name.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function cssObjectToInlineStyle(cssObject) {
	return Object.entries(cssObject)
		.map(([key, value]) => `${camelToKebab(key)}:${value}`)
		.join(";");
}

function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

function rgbToOkLab(rgb) {
	const r = gammaInv(rgb[0] / 255);
	const g = gammaInv(rgb[1] / 255);
	const b = gammaInv(rgb[2] / 255);

	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

	return [
		l * 0.2104542553 + m * 0.793617785 - s * 0.0040720468,
		l * 1.9779984951 - m * 2.428592205 + s * 0.4505937099,
		l * 0.0259040371 + m * 0.7827717662 - s * 0.808675766,
	];
}

function gammaInv(x) {
	return x >= 0.04045 ? Math.pow((x + 0.055) / 1.055, 2.4) : x / 12.92;
}

function bitsToLab(ll, aaa, bbb) {
	const L = (ll / 0b11) * 0.6 + 0.2;
	const a = (aaa / 0b1000) * 0.7 - 0.35;
	const b = ((bbb + 1) / 0b1000) * 0.7 - 0.35;
	return { L, a, b };
}

function scaleComponentForDiff(x, chroma) {
	return x / (1e-6 + Math.pow(chroma, 0.5));
}

function findOklabBits([targetL, targetA, targetB]) {
	const targetChroma = Math.hypot(targetA, targetB);
	const scaledTargetA = scaleComponentForDiff(targetA, targetChroma);
	const scaledTargetB = scaleComponentForDiff(targetB, targetChroma);

	let bestBits = [0, 0, 0];
	let bestDifference = Number.POSITIVE_INFINITY;

	for (let lli = 0; lli <= 0b11; lli += 1) {
		for (let aaai = 0; aaai <= 0b111; aaai += 1) {
			for (let bbbi = 0; bbbi <= 0b111; bbbi += 1) {
				const { L, a, b } = bitsToLab(lli, aaai, bbbi);
				const chroma = Math.hypot(a, b);
				const scaledA = scaleComponentForDiff(a, chroma);
				const scaledB = scaleComponentForDiff(b, chroma);

				const difference = Math.hypot(
					L - targetL,
					scaledA - scaledTargetA,
					scaledB - scaledTargetB,
				);

				if (difference < bestDifference) {
					bestDifference = difference;
					bestBits = [lli, aaai, bbbi];
				}
			}
		}
	}

	return {
		ll: bestBits[0],
		aaa: bestBits[1],
		bbb: bestBits[2],
	};
}

async function encodeCssLqip(input) {
	// Ported from 2026/cssLQIP.js for demo dataset generation.
	const image = sharp(input).rotate();
	const dominant = (
		await colorthief.getPalette(await image.toBuffer(), 4, 10)
	)[0];
	const dominantOkLab = rgbToOkLab(dominant);
	const { ll, aaa, bbb } = findOklabBits(dominantOkLab);
	const base = bitsToLab(ll, aaa, bbb);

	const previewBuffer = await sharp(input)
		.rotate()
		.gamma(2)
		.resize(3, 2, { fit: "fill" })
		.sharpen({ sigma: 0.5 })
		.removeAlpha()
		.raw()
		.toBuffer();

	const values = [];
	for (let index = 0; index < 6; index += 1) {
		const rgb = [
			previewBuffer.readUInt8(index * 3),
			previewBuffer.readUInt8(index * 3 + 1),
			previewBuffer.readUInt8(index * 3 + 2),
		];
		const cellOkLab = rgbToOkLab(rgb);
		values.push(clamp(0.5 + cellOkLab[0] - base.L, 0, 1));
	}

	const [ca, cb, cc, cd, ce, cf] = values.map((value) =>
		Math.round(value * 0b11),
	);

	return (
		-(2 ** 19) +
		((ca & 0b11) << 18) +
		((cb & 0b11) << 16) +
		((cc & 0b11) << 14) +
		((cd & 0b11) << 12) +
		((ce & 0b11) << 10) +
		((cf & 0b11) << 8) +
		((ll & 0b11) << 6) +
		((aaa & 0b111) << 3) +
		(bbb & 0b111)
	);
}

async function ensureThumbnail(sourceBuffer, filename) {
	const outputName = `${filename}-thumbnail.jpg`;
	const outPath = path.join(processedDir, outputName);
	const buffer = await sharp(sourceBuffer)
		.rotate()
		.resize(300)
		.jpeg({ quality: 72, mozjpeg: true })
		.toBuffer();

	await fs.writeFile(outPath, buffer);

	const info = await sharp(buffer).metadata();
	return {
		variantName: "thumbnail",
		kind: "image",
		name: outputName,
		sizeBytes: buffer.length,
		width: info.width,
		height: info.height,
	};
}

async function generate() {
	await fs.ensureDir(processedDir);
	const inputPaths = globby.sync(inputGlob).sort();
	const images = [];

	for (const filePath of inputPaths) {
		const sourceBuffer = await fs.readFile(filePath);
		const sourceMeta = await sharp(sourceBuffer).metadata();

		const filename = path.basename(filePath, path.extname(filePath));
		const sourceWidth = sourceMeta.width;
		const sourceHeight = sourceMeta.height;

		if (!sourceWidth || !sourceHeight) {
			throw new Error(`Invalid image metadata for ${filePath}`);
		}

		const thumbnail = await ensureThumbnail(sourceBuffer, filename);
		const results = [];

		{
			const gipResult = await gip(filePath);
			results.push({
				variantName: "gip",
				kind: "css",
				css: gipResult.css,
				sizeBytes: Buffer.byteLength(gipResult.css),
			});
		}

		{
			const lqipValue = await encodeCssLqip(sourceBuffer);
			const lqipString = String(lqipValue);
			results.push({
				variantName: "css-lqip",
				kind: "css-lqip",
				lqip: lqipString,
				sizeBytes: Buffer.byteLength(lqipString),
			});
		}

		{
			const pixelData = await sharp(sourceBuffer)
				.rotate()
				.ensureAlpha()
				.resize(32, 32, { fit: "inside" })
				.raw()
				.toBuffer({ resolveWithObject: true });
			const blurhash = encodeBlurhash(
				new Uint8ClampedArray(pixelData.data),
				pixelData.info.width,
				pixelData.info.height,
				4,
				3,
			);

			const gradientCss = `background-image:${blurhashToCssGradientString(
				blurhash,
			)};background-size:cover;background-position:center;background-repeat:no-repeat`;
			results.push({
				variantName: "blurhash-as-css-gradient",
				kind: "css",
				css: gradientCss,
				sizeBytes: Buffer.byteLength(gradientCss),
			});

			const blurhashCss = cssObjectToInlineStyle(blurhashToCss(blurhash));
			results.push({
				variantName: "blurhash-as-css",
				kind: "css",
				css: blurhashCss,
				sizeBytes: Buffer.byteLength(blurhashCss),
			});
		}

		images.push({
			filename,
			sourcePath: filePath,
			dimensions: {
				width: sourceWidth,
				height: sourceHeight,
				ratio: ratioString(sourceWidth, sourceHeight),
			},
			thumbnail,
			results,
		});
	}

	const dataset = {
		controls: {
			modernSizes: MODERN_SIZES,
			qualityOptions: QUALITY_OPTIONS,
			blurLevels: BLUR_LEVELS,
			blurTargets: BLUR_TARGETS,
			defaults: {
				webpQuality: 50,
				avifQuality: 70,
				sharpBlurLevel: "2",
				blurMode: "css",
				sharpBlurTarget: "placeholder",
				cssBlurPx: 20,
				avifLossless: false,
				avifChromaSubsampling444: false,
				webpSmartSubsample: true,
				webpSmartDeblock: false,
				webpAlphaQuality: false,
				webpLossless: false,
				webpNearLossless: false,
			},
		},
		images,
	};

	await fs.writeFile(outputPath, JSON.stringify(dataset, null, 2));
	console.log(
		`Generated comparison dataset for ${images.length} images at ${outputPath}`,
	);
}

generate().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
