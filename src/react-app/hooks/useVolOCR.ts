import { useState, useCallback, useRef } from "react";

/**
 * 火山引擎 OCRPdf API 响应结构
 * 参考文档: https://www.volcengine.com/docs/6369/1288730
 */
interface TextBlock {
	text: string;
	box: {
		x0: number;
		y0: number;
		x1: number;
		y1: number;
	};
	label: string;
	norm_box?: {
		x0: number;
		y0: number;
		x1: number;
		y1: number;
	};
	font_size?: number;
	is_bold?: boolean;
	is_italic?: boolean;
	url?: string;
}

interface PageResult {
	page_id: number;
	page_md: string;
	page_image_hw: {
		h: number;
		w: number;
	};
	textblocks: TextBlock[];
}

interface VolcengineOCRResponse {
	code: number;
	message: string;
	request_id: string;
	time_elapsed?: string;
	status?: number;
	data?: {
		markdown: string;
		detail: string | PageResult[]; // API 返回的是 JSON 字符串
	};
}

/**
 * 转换后的数据结构，与 useOCR 保持一致
 */
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

/**
 * OCR 结果结构，与 useOCR 保持一致
 */
export interface OCRResult {
	lines: TextLine[];
	imageWidth: number;
	imageHeight: number;
}

/**
 * 将 OCRPdf 的 box 坐标转换为 CSS 友好的矩形框
 *
 * 输入: box = { x0, y0, x1, y1 } 左上角和右下角坐标
 * 输出: { left, top, width, height }
 */
function boxToFrame(box: TextBlock["box"]): TextLine["frame"] {
	return {
		left: box.x0,
		top: box.y0,
		width: box.x1 - box.x0,
		height: box.y1 - box.y0,
	};
}

/**
 * 将图片 URL 转换为 base64 字符串
 */
async function imageUrlToBase64(imageUrl: string): Promise<string> {
	const response = await fetch(imageUrl);
	const blob = await response.blob();

	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => {
			const dataUrl = reader.result as string;
			// 移除 data:image/xxx;base64, 前缀
			const base64 = dataUrl.split(",")[1];
			resolve(base64);
		};
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});
}

/**
 * 火山引擎 OCRPdf Hook
 */
export function useVolOCR() {
	const [isLoading, setIsLoading] = useState(false);
	const [isInitializing, setIsInitializing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<OCRResult | null>(null);
	const imageRef = useRef<{ width: number; height: number } | null>(null);

	const detect = useCallback(async (imageSrc: string) => {
		setIsLoading(true);
		setError(null);

		try {
			// 加载图片获取尺寸
			const img = new Image();
			await new Promise<void>((resolve, reject) => {
				img.onload = () => resolve();
				img.onerror = () => reject(new Error("Failed to load image"));
				img.src = imageSrc;
			});

			imageRef.current = { width: img.naturalWidth, height: img.naturalHeight };

			// 将图片转换为 base64
			setIsInitializing(true);
			const imageBase64 = await imageUrlToBase64(imageSrc);
			setIsInitializing(false);

			// 调用后端 API
			const response = await fetch("/api/ocr", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ image_base64: imageBase64 }),
			});

			if (!response.ok) {
				throw new Error(`API request failed: ${response.status}`);
			}

			const apiResult: VolcengineOCRResponse = await response.json();

			// 打印响应以便调试
			console.log("OCRPdf API response:", apiResult);

			// 检查 API 响应 (10000 表示成功)
			if (apiResult.code !== 10000) {
				throw new Error(apiResult.message || "OCR API returned error");
			}

			// 解析 OCRPdf 响应格式
			// data.detail 是 JSON 字符串，需要先解析
			let detail: PageResult[] = [];
			if (apiResult.data?.detail) {
				if (typeof apiResult.data.detail === "string") {
					detail = JSON.parse(apiResult.data.detail);
				} else {
					detail = apiResult.data.detail;
				}
			}
			const lines: TextLine[] = [];

			for (const page of detail) {
				const textblocks = page.textblocks || [];
				for (const block of textblocks) {
					if (block.box) {
						lines.push({
							text: block.text,
							score: 1, // OCRPdf 不返回置信度，默认为 1
							frame: boxToFrame(block.box),
						});
					}
				}
			}

			// 从第一页获取图片尺寸（如果有）
			let imageWidth = img.naturalWidth;
			let imageHeight = img.naturalHeight;
			if (detail.length > 0 && detail[0].page_image_hw) {
				imageWidth = detail[0].page_image_hw.w;
				imageHeight = detail[0].page_image_hw.h;
			}

			setResult({
				lines,
				imageWidth,
				imageHeight,
			});
		} catch (err) {
			console.error("OCR error:", err);
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
