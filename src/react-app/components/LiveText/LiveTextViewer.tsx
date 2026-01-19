import { useState, useRef, useEffect } from "react";
import { TextLayer } from "./TextLayer";
import type { OCRResult } from "@/hooks/useOCR";

interface LiveTextViewerProps {
	src: string; // 图片 URL
	alt?: string; // 图片 alt 文本（可选）
	className?: string; // 外部传入的样式类（可选）
	ocrResult: OCRResult | null; // OCR 识别结果，可能为空
}

/**
 * LiveTextViewer - 实时文字查看器
 *
 * 核心逻辑：
 * ┌─────────────────────────────────────┐
 * │  <div> relative container           │
 * │  ┌───────────────────────────────┐  │
 * │  │  <img>                        │  │
 * │  │  原图 2000x1000               │  │
 * │  │  显示 800x400                 │  │
 * │  └───────────────────────────────┘  │
 * │  ┌───────────────────────────────┐  │
 * │  │  <TextLayer> absolute         │  │
 * │  │  根据 scale = 800/2000 = 0.4  │  │
 * │  │  缩放所有文字坐标              │  │
 * │  └───────────────────────────────┘  │
 * └─────────────────────────────────────┘
 *
 * TextLayer 需要知道原图尺寸和显示尺寸，才能正确计算缩放比例，
 * 让透明文字精确覆盖在图片文字上方。
 */
export function LiveTextViewer({
	src,
	alt = "",
	className = "",
	ocrResult,
}: LiveTextViewerProps) {
	// 容器 DOM 引用，用于后续获取尺寸
	const containerRef = useRef<HTMLDivElement>(null);
	// 存储容器实际显示尺寸（响应式更新）
	const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

	// 尺寸同步 Effect
	useEffect(() => {
		// 更新尺寸的函数
		const updateSize = () => {
			if (containerRef.current) {
				// 找到容器内的 img 元素
				const img = containerRef.current.querySelector("img");
				if (img) {
					// 获取图片的实际渲染尺寸（非原始尺寸）
					setContainerSize({
						width: img.clientWidth,
						height: img.clientHeight,
					});
				}
			}
		};

		// 监听图片加载完成事件
		const img = containerRef.current?.querySelector("img");
		if (img) {
			img.addEventListener("load", updateSize);
		}

		// 监听窗口大小变化（图片可能随之缩放）
		window.addEventListener("resize", updateSize);

		// 首次立即执行一次
		updateSize();

		// 清理函数：组件卸载时移除监听器
		return () => {
			window.removeEventListener("resize", updateSize);
			if (img) {
				img.removeEventListener("load", updateSize);
			}
		};
	}, [src]); // src 变化时重新执行（换图片了）

	return (
		// 外层容器：relative 定位，让 TextLayer 能够 absolute 定位叠加
		<div ref={containerRef} className={`relative inline-block ${className}`}>
			{/* 图片本身：block 块级 | max-w-full 最大宽度100% | h-auto 高度自适应 | select-none 禁止选中 | pointer-events-none 禁止鼠标事件 */}
			<img
				src={src}
				alt={alt}
				className="block max-w-full h-auto select-none pointer-events-none"
				draggable={false}
			/>
			{/* 条件渲染：有 OCR 结果且容器尺寸有效时，渲染文字层 */}
			{ocrResult && containerSize.width > 0 && (
				<TextLayer
					lines={ocrResult.lines} // 识别到的文字行
					imageWidth={ocrResult.imageWidth} // 原图宽度
					imageHeight={ocrResult.imageHeight} // 原图高度
					containerWidth={containerSize.width} // 显示宽度
					containerHeight={containerSize.height} // 显示高度
				/>
			)}
		</div>
	);
}
