// simple svg blur
// https://blur-up-thumbs.vercel.app
function svgBlurImage(blurDataURL, width, height) {
	const svg = /*html*/ `<svg xmlns="http://www.w3.org/2000/svg" ${width ? `width="${width}"` : ""} ${height ? `height="${height}"` : ""}><filter id="b" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="20"/><feComponentTransfer><feFuncA type="discrete" tableValues="1 1"/></feComponentTransfer></filter><g filter="url(#b)"><image width="100%" height="100%" href="${blurDataURL}"/></g></svg>`;
	return svg.replace(/#/g, "%23");
}
