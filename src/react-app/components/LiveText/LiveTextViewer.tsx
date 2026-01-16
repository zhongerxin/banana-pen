import { useState, useRef, useEffect } from "react";
import { TextLayer } from "./TextLayer";
import type { OCRResult } from "@/hooks/useOCR";

interface LiveTextViewerProps {
	src: string;
	alt?: string;
	className?: string;
	ocrResult: OCRResult | null;
}

export function LiveTextViewer({
	src,
	alt = "",
	className = "",
	ocrResult,
}: LiveTextViewerProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

	useEffect(() => {
		const updateSize = () => {
			if (containerRef.current) {
				const img = containerRef.current.querySelector("img");
				if (img) {
					setContainerSize({
						width: img.clientWidth,
						height: img.clientHeight,
					});
				}
			}
		};

		// Update size when image loads
		const img = containerRef.current?.querySelector("img");
		if (img) {
			img.addEventListener("load", updateSize);
		}

		// Update size on window resize
		window.addEventListener("resize", updateSize);

		// Initial size update
		updateSize();

		return () => {
			window.removeEventListener("resize", updateSize);
			if (img) {
				img.removeEventListener("load", updateSize);
			}
		};
	}, [src]);

	return (
		<div ref={containerRef} className={`relative inline-block ${className}`}>
			<img src={src} alt={alt} className="block max-w-full h-auto" />
			{ocrResult && containerSize.width > 0 && (
				<TextLayer
					lines={ocrResult.lines}
					imageWidth={ocrResult.imageWidth}
					imageHeight={ocrResult.imageHeight}
					containerWidth={containerSize.width}
					containerHeight={containerSize.height}
				/>
			)}
		</div>
	);
}
