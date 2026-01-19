import { useState, useCallback, useRef } from "react";

/**
 * 火山引擎 MultiLanguageOCR API 响应结构
 */
interface VolcengineOCRResponse {
	code?: number;
	message?: string;
	request_id?: string;
	data?: {
		line_texts?: Array<{
			text: string;
			confidence: number;
			polygons: Array<{ x: number; y: number }>;
		}>;
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
 * 将火山引擎返回的多边形坐标转换为 CSS 友好的矩形框
 *
 * 输入: polygons 是多个点的坐标数组 [{ x, y }, { x, y }, ...]
 * 通常是 4 个角点：左上、右上、右下、左下
 *
 * 输出: 外接矩形 { left, top, width, height }
 */
function polygonsToFrame(
	polygons: Array<{ x: number; y: number }>
): TextLine["frame"] {
	const xs = polygons.map((p) => p.x);
	const ys = polygons.map((p) => p.y);

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

/**
 * 将图片 URL 转换为 base64 字符串
 */
async function imageUrlToBase64(imageUrl: string): Promise<string> {
	// 加载图片
	const response = await fetch(imageUrl);
	const blob = await response.blob();

	// 转换为 base64
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
 * 火山引擎 OCR Hook - 提供图片文字识别能力
 *
 * 与 useOCR 保持相同的接口，方便切换使用
 *
 * 数据流：
 * ```
 * 调用 detect("/image.png")
 *         │
 *         ▼
 * ┌───────────────────┐
 * │ imageUrlToBase64  │ ← 将图片转为 base64
 * └───────────────────┘
 *         │
 *         ▼
 * ┌───────────────────┐
 * │ POST /api/ocr     │ ← 调用后端 API
 * └───────────────────┘
 *         │
 *         ▼
 * ┌───────────────────┐
 * │ 火山引擎 OCR API  │ ← 后端调用火山引擎
 * └───────────────────┘
 *         │
 *         ▼
 * ┌───────────────────┐
 * │ polygonsToFrame   │ ← 坐标转换
 * └───────────────────┘
 *         │
 *         ▼
 * ┌───────────────────┐
 * │ setResult()       │ ← 触发 React 重渲染
 * └───────────────────┘
 * ```
 */
export function useVolOCR() {
	// 是否正在进行 OCR
	const [isLoading, setIsLoading] = useState(false);
	// 是否正在初始化（火山引擎方案不需要加载模型，设为 false）
	const [isInitializing, setIsInitializing] = useState(false);
	// 错误信息
	const [error, setError] = useState<string | null>(null);
	// OCR 结果
	const [result, setResult] = useState<OCRResult | null>(null);
	// 存储图片尺寸
	const imageRef = useRef<{ width: number; height: number } | null>(null);

	/**
	 * 执行 OCR 识别
	 */
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
			setIsInitializing(true); // 复用此状态表示"准备中"
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

			// 检查 API 响应
			if (apiResult.code && apiResult.code !== 0) {
				throw new Error(apiResult.message || "OCR API returned error");
			}

			// 转换数据格式
			const lineTexts = apiResult.data?.line_texts || [];
			const lines: TextLine[] = lineTexts
				.filter((item) => item.polygons && item.polygons.length >= 4)
				.map((item) => ({
					text: item.text,
					score: item.confidence,
					frame: polygonsToFrame(item.polygons),
				}));

			// 设置结果
			setResult({
				lines,
				imageWidth: img.naturalWidth,
				imageHeight: img.naturalHeight,
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
