/**
 * A shared function, used on both client and server, to generate a SVG blur placeholder.
 * https://github.com/vercel/next.js/blob/9b6e563f7fb64d1ec6225306b17acabe741a5098/packages/next/src/shared/lib/image-blur-svg.ts#L33
 */
export function getImageBlurSvg({
	widthInt,
	heightInt,
	blurWidth,
	blurHeight,
	blurDataURL,
	objectFit,
	blurStd = 20,
}) {
	const std = Math.max(0, Number.isFinite(blurStd) ? blurStd : 20);
	const useFullScale =
		blurWidth != null &&
		blurHeight != null &&
		blurWidth >= widthInt &&
		blurHeight >= heightInt;
	const scale = useFullScale ? 1 : 40;
	const svgWidth = blurWidth != null ? blurWidth * scale : widthInt;
	const svgHeight = blurHeight != null ? blurHeight * scale : heightInt;

	const viewBox =
		svgWidth && svgHeight ? `viewBox='0 0 ${svgWidth} ${svgHeight}'` : "";
	const preserveAspectRatio = viewBox
		? "none"
		: objectFit === "contain"
			? "xMidYMid"
			: objectFit === "cover"
				? "xMidYMid slice"
				: "none";

	return /*html*/ `<svg xmlns='http://www.w3.org/2000/svg' ${viewBox}><filter id='b' color-interpolation-filters='sRGB'><feGaussianBlur stdDeviation='${std}'/><feColorMatrix values='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 100 -1' result='s'/><feFlood x='0' y='0' width='100%' height='100%'/><feComposite operator='out' in='s'/><feComposite in2='SourceGraphic'/><feGaussianBlur stdDeviation='${std}'/></filter><image width='100%' height='100%' x='0' y='0' preserveAspectRatio='${preserveAspectRatio}' style='filter: url(#b);' href='${blurDataURL}'/></svg>`;
}
