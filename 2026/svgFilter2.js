// simple svg blur
// https://blur-up-thumbs.vercel.app
export function svgBlurImage(blurDataURL, width, height, blurStd = 20) {
	const std = Math.max(0, Number.isFinite(blurStd) ? blurStd : 20);
	const svg = /*html*/ `<svg xmlns="http://www.w3.org/2000/svg" ${width ? `width="${width}"` : ""} ${height ? `height="${height}"` : ""}><filter id="b" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${std}"/><feComponentTransfer><feFuncA type="discrete" tableValues="1 1"/></feComponentTransfer></filter><g filter="url(#b)"><image width="100%" height="100%" href="${blurDataURL}"/></g></svg>`;
	return svg.replace(/#/g, "%23");
}

if (typeof window !== "undefined") {
	/** @type {any} */ (window).svgBlurImage = svgBlurImage;
}
