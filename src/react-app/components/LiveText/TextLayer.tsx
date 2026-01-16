import type { TextLine } from "@/hooks/useOCR";

interface TextLayerProps {
	lines: TextLine[];
	imageWidth: number;
	imageHeight: number;
	containerWidth: number;
	containerHeight: number;
}

export function TextLayer({
	lines,
	imageWidth,
	imageHeight,
	containerWidth,
	containerHeight,
}: TextLayerProps) {
	// Calculate scale factor between original image and displayed size
	const scaleX = containerWidth / imageWidth;
	const scaleY = containerHeight / imageHeight;

	return (
		<div
			className="absolute inset-0 overflow-hidden"
			style={{ pointerEvents: "none" }}
		>
			{lines.map((line, index) => {
				const left = line.frame.left * scaleX;
				const top = line.frame.top * scaleY;
				const width = line.frame.width * scaleX;
				const height = line.frame.height * scaleY;

				// Calculate font size based on the height of the bounding box
				const fontSize = Math.max(height * 0.85, 12);

				return (
					<span
						key={index}
						className="absolute whitespace-nowrap select-text cursor-text"
						style={{
							left: `${left}px`,
							top: `${top}px`,
							width: `${width}px`,
							height: `${height}px`,
							fontSize: `${fontSize}px`,
							lineHeight: `${height}px`,
							color: "transparent",
							pointerEvents: "auto",
							// Uncomment for debugging:
							// backgroundColor: "rgba(255, 0, 0, 0.2)",
							// color: "red",
						}}
					>
						{line.text}
					</span>
				);
			})}
			<style>{`
				.select-text::selection {
					background: rgba(59, 130, 246, 0.35);
				}
			`}</style>
		</div>
	);
}
