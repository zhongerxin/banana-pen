import { useState, useCallback } from "react";
import type { EditMode } from "@/components/LiveText";

interface SelectionRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface BananaResult {
	success: boolean;
	newImageUrl?: string;
	error?: string;
}

/**
 * 将图片转为 base64
 */
async function imageToBase64(imageSrc: string): Promise<string> {
	const response = await fetch(imageSrc);
	const blob = await response.blob();

	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => {
			const dataUrl = reader.result as string;
			const base64 = dataUrl.split(",")[1];
			resolve(base64);
		};
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});
}

/**
 * 从 OpenRouter 响应中提取图片
 * 实际返回结构: choices[0].message.images[0].image_url.url
 */
function extractImageFromResponse(result: unknown): string | null {
	try {
		const res = result as {
			choices?: Array<{
				message?: {
					images?: Array<{
						image_url?: { url?: string };
					}>;
				};
			}>;
		};

		// 从 images 数组中获取第一张图片
		const imageUrl = res?.choices?.[0]?.message?.images?.[0]?.image_url?.url;

		if (imageUrl) {
			return imageUrl;
		}

		return null;
	} catch {
		return null;
	}
}

/**
 * useBanana - 图片文字替换 Hook
 *
 * 使用 OpenRouter + Gemini 3 Pro Image Preview 模型
 * 替换图片中指定区域的文字
 */
export function useBanana() {
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	/**
	 * 编辑图片中的文字
	 * @param imageSrc 原图 URL
	 * @param rect 选区坐标（显示坐标）
	 * @param text 要替换成的新文字或修改描述
	 * @param containerWidth 容器显示宽度
	 * @param containerHeight 容器显示高度
	 * @param mode 编辑模式: "text"(替换文本) 或 "free"(任意修改)
	 */
	const editImage = useCallback(
		async (
			imageSrc: string,
			rect: SelectionRect,
			text: string,
			containerWidth: number,
			containerHeight: number,
			mode: EditMode = "text"
		): Promise<BananaResult> => {
			setIsLoading(true);
			setError(null);

			try {
				// 加载图片获取原始尺寸
				const img = new Image();
				await new Promise<void>((resolve, reject) => {
					img.onload = () => resolve();
					img.onerror = () => reject(new Error("Failed to load image"));
					img.src = imageSrc;
				});

				const imageWidth = img.naturalWidth;
				const imageHeight = img.naturalHeight;

				// 将显示坐标转换为原图坐标
				const scaleX = imageWidth / containerWidth;
				const scaleY = imageHeight / containerHeight;

				const originalRect: SelectionRect = {
					x: rect.x * scaleX,
					y: rect.y * scaleY,
					width: rect.width * scaleX,
					height: rect.height * scaleY,
				};

				// 转换图片为 base64
				const imageBase64 = await imageToBase64(imageSrc);

				// 调用后端 API
				const response = await fetch("/api/banana", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						image_base64: imageBase64,
						rect: originalRect,
						text,
						imageWidth,
						imageHeight,
						mode,
					}),
				});

				if (!response.ok) {
					const errorData = await response.json();
					throw new Error(errorData.error || `API request failed: ${response.status}`);
				}

				const result = await response.json();

				console.log("Banana API response:", result);

				// 从响应中提取新图片
				const newImageUrl = extractImageFromResponse(result);

				if (newImageUrl) {
					// 调试：检查生成图片的尺寸
					const debugImg = new Image();
					debugImg.onload = () => {
						console.log(`原图尺寸: ${imageWidth}x${imageHeight}`);
						console.log(`生成图尺寸: ${debugImg.naturalWidth}x${debugImg.naturalHeight}`);
					};
					debugImg.src = newImageUrl;

					return { success: true, newImageUrl };
				} else {
					// 如果没有提取到图片，返回原始响应供调试
					console.warn("Could not extract image from response:", result);
					return {
						success: false,
						error: "模型未返回图片，请查看控制台了解详情",
					};
				}
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : "Image editing failed";
				console.error("Banana error:", err);
				setError(errorMessage);
				return { success: false, error: errorMessage };
			} finally {
				setIsLoading(false);
			}
		},
		[]
	);

	return {
		editImage,
		isLoading,
		error,
	};
}
