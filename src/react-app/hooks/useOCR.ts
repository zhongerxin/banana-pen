import { useState, useCallback, useRef } from "react";
import Ocr from "@gutenye/ocr-browser";
import * as ort from "onnxruntime-web";

// Configure ONNX Runtime to load WASM from CDN
ort.env.wasm.wasmPaths =
	"https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/";

// Raw line from OCR library
interface RawLine {
	text: string;
	mean: number;
	box?: number[][];
}

// Transformed line with frame coordinates
export interface TextLine {
	text: string;
	score: number;
	frame: {
		top: number;
		left: number;
		width: number;
		height: number;
	};
}

export interface OCRResult {
	lines: TextLine[];
	imageWidth: number;
	imageHeight: number;
}

let ocrInstance: Awaited<ReturnType<typeof Ocr.create>> | null = null;
let ocrPromise: Promise<Awaited<ReturnType<typeof Ocr.create>>> | null = null;

async function getOCRInstance() {
	if (ocrInstance) return ocrInstance;
	if (ocrPromise) return ocrPromise;

	ocrPromise = Ocr.create({
		models: {
			detectionPath: "/models/ch_PP-OCRv4_det_infer.onnx",
			recognitionPath: "/models/ch_PP-OCRv4_rec_infer.onnx",
			dictionaryPath: "/models/ppocr_keys_v1.txt",
		},
	});

	ocrInstance = await ocrPromise;
	return ocrInstance;
}

// Convert box coordinates (4 corners) to frame (left, top, width, height)
function boxToFrame(box: number[][]): TextLine["frame"] {
	// box is array of 4 points: [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
	// Usually: top-left, top-right, bottom-right, bottom-left
	const xs = box.map((p) => p[0]);
	const ys = box.map((p) => p[1]);

	const left = Math.min(...xs);
	const top = Math.min(...ys);
	const right = Math.max(...xs);
	const bottom = Math.max(...ys);

	return {
		left,
		top,
		width: right - left,
		height: bottom - top,
	};
}

export function useOCR() {
	const [isLoading, setIsLoading] = useState(false);
	const [isInitializing, setIsInitializing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<OCRResult | null>(null);
	const imageRef = useRef<{ width: number; height: number } | null>(null);

	const detect = useCallback(async (imageSrc: string) => {
		setIsLoading(true);
		setError(null);

		try {
			setIsInitializing(true);
			const ocr = await getOCRInstance();
			setIsInitializing(false);

			// Get image dimensions
			const img = new Image();
			await new Promise<void>((resolve, reject) => {
				img.onload = () => resolve();
				img.onerror = () => reject(new Error("Failed to load image"));
				img.src = imageSrc;
			});

			imageRef.current = { width: img.naturalWidth, height: img.naturalHeight };

			// Run OCR detection
			const rawLines = (await ocr.detect(imageSrc)) as RawLine[];

			// Transform raw lines to our TextLine format
			const lines: TextLine[] = rawLines
				.filter((line) => line.box && line.box.length === 4)
				.map((line) => ({
					text: line.text,
					score: line.mean,
					frame: boxToFrame(line.box!),
				}));

			setResult({
				lines,
				imageWidth: img.naturalWidth,
				imageHeight: img.naturalHeight,
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : "OCR detection failed");
		} finally {
			setIsLoading(false);
			setIsInitializing(false);
		}
	}, []);

	return {
		detect,
		result,
		isLoading,
		isInitializing,
		error,
	};
}
