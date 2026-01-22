import { useState, useRef, useEffect, useCallback } from "react";
import { TextLayer } from "./TextLayer";
import { EditInputDialog } from "./EditInputDialog";
import { SelectionMenu } from "./SelectionMenu";
import type { OCRResult } from "@/hooks/useOCR";

export interface SelectionRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export type EditMode = "text" | "free";

export interface EditRequestParams {
	rect: SelectionRect;
	text: string;
	containerWidth: number;
	containerHeight: number;
	mode: EditMode;
}

interface LiveTextViewerProps {
	src: string;
	alt?: string;
	className?: string;
	ocrResult: OCRResult | null;
	onEditRequest?: (params: EditRequestParams) => void;
	isEditing?: boolean; // 是否正在编辑中（用于显示 loading 状态）
}

/**
 * 裁剪图片选区并转为 base64
 */
async function cropImageToBase64(
	imgElement: HTMLImageElement,
	rect: SelectionRect,
	containerWidth: number,
	containerHeight: number
): Promise<string> {
	// 计算从显示坐标到原图坐标的缩放比例
	const scaleX = imgElement.naturalWidth / containerWidth;
	const scaleY = imgElement.naturalHeight / containerHeight;

	// 转换为原图坐标
	const cropX = rect.x * scaleX;
	const cropY = rect.y * scaleY;
	const cropWidth = rect.width * scaleX;
	const cropHeight = rect.height * scaleY;

	// 创建 canvas 裁剪图片
	const canvas = document.createElement("canvas");
	canvas.width = cropWidth;
	canvas.height = cropHeight;

	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Failed to get canvas context");

	ctx.drawImage(
		imgElement,
		cropX,
		cropY,
		cropWidth,
		cropHeight,
		0,
		0,
		cropWidth,
		cropHeight
	);

	// 转为 base64（去掉前缀）
	const dataUrl = canvas.toDataURL("image/png");
	return dataUrl.split(",")[1];
}

/**
 * 调用 OCR API 识别选区文字
 */
async function recognizeRegion(imageBase64: string): Promise<string> {
	const response = await fetch("/api/ocr", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ image_base64: imageBase64 }),
	});

	if (!response.ok) {
		throw new Error(`OCR API failed: ${response.status}`);
	}

	const result = await response.json();

	if (result.code !== 10000) {
		throw new Error(result.message || "OCR failed");
	}

	// 解析 detail（JSON 字符串）
	let detail = [];
	if (result.data?.detail) {
		if (typeof result.data.detail === "string") {
			detail = JSON.parse(result.data.detail);
		} else {
			detail = result.data.detail;
		}
	}

	// 提取所有文本，按顺序拼接
	const texts: string[] = [];
	for (const page of detail) {
		const textblocks = page.textblocks || [];
		for (const block of textblocks) {
			if (block.text) {
				texts.push(block.text);
			}
		}
	}

	return texts.join(" ");
}

/**
 * LiveTextViewer - 实时文字查看器
 */
export function LiveTextViewer({
	src,
	alt = "",
	className = "",
	ocrResult,
	onEditRequest,
	isEditing = false,
}: LiveTextViewerProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const imgRef = useRef<HTMLImageElement>(null);
	const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

	// 选区相关状态
	const [isSelecting, setIsSelecting] = useState(false);
	const [selectionStart, setSelectionStart] = useState({ x: 0, y: 0 });
	const [selectionEnd, setSelectionEnd] = useState({ x: 0, y: 0 });
	const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);

	// 菜单和输入框相关状态
	const [showMenu, setShowMenu] = useState(false);
	const [showInput, setShowInput] = useState(false);
	const [inputText, setInputText] = useState("");
	const [isRecognizing, setIsRecognizing] = useState(false);
	const [editMode, setEditMode] = useState<EditMode>("text");

	// 尺寸同步 Effect
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

		const img = containerRef.current?.querySelector("img");
		if (img) {
			img.addEventListener("load", updateSize);
		}

		window.addEventListener("resize", updateSize);
		updateSize();

		return () => {
			window.removeEventListener("resize", updateSize);
			if (img) {
				img.removeEventListener("load", updateSize);
			}
		};
	}, [src]);


	// 获取鼠标在容器内的相对坐标
	const getRelativePosition = useCallback((e: React.MouseEvent) => {
		if (!containerRef.current) return { x: 0, y: 0 };
		const rect = containerRef.current.getBoundingClientRect();
		return {
			x: e.clientX - rect.left,
			y: e.clientY - rect.top,
		};
	}, []);

	// 计算选区矩形
	const calculateRect = useCallback(
		(start: { x: number; y: number }, end: { x: number; y: number }): SelectionRect => {
			const x = Math.min(start.x, end.x);
			const y = Math.min(start.y, end.y);
			const width = Math.abs(end.x - start.x);
			const height = Math.abs(end.y - start.y);
			return { x, y, width, height };
		},
		[]
	);

	// 对选区进行 OCR 识别
	const recognizeSelection = useCallback(
		async (rect: SelectionRect) => {
			if (!imgRef.current || containerSize.width === 0) return;

			setIsRecognizing(true);
			try {
				const base64 = await cropImageToBase64(
					imgRef.current,
					rect,
					containerSize.width,
					containerSize.height
				);
				const text = await recognizeRegion(base64);
				setInputText(text);
			} catch (err) {
				console.error("Region OCR failed:", err);
				// 识别失败不做处理，用户可以手动输入
			} finally {
				setIsRecognizing(false);
			}
		},
		[containerSize]
	);

	// 鼠标按下开始选择
	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			if ((e.target as HTMLElement).closest(".edit-input-container") ||
				(e.target as HTMLElement).closest(".selection-menu")) {
				return;
			}

			if (showInput || showMenu) {
				setShowInput(false);
				setShowMenu(false);
				setInputText("");
				setSelectionRect(null);
			}

			const pos = getRelativePosition(e);
			setIsSelecting(true);
			setSelectionStart(pos);
			setSelectionEnd(pos);
		},
		[getRelativePosition, showInput, showMenu]
	);

	// 鼠标移动更新选区
	const handleMouseMove = useCallback(
		(e: React.MouseEvent) => {
			if (!isSelecting) return;
			const pos = getRelativePosition(e);
			setSelectionEnd(pos);
		},
		[isSelecting, getRelativePosition]
	);

	// 鼠标松开完成选择
	const handleMouseUp = useCallback(() => {
		if (!isSelecting) return;
		setIsSelecting(false);

		const rect = calculateRect(selectionStart, selectionEnd);

		if (rect.width < 10 || rect.height < 10) {
			return;
		}

		setSelectionRect(rect);
		setShowMenu(true); // 显示菜单而不是直接显示输入框
	}, [isSelecting, selectionStart, selectionEnd, calculateRect]);

	// 选择"修改文本"模式
	const handleSelectTextEdit = useCallback(() => {
		setEditMode("text");
		setShowMenu(false);
		setShowInput(true);
		// 对选区进行 OCR 识别
		if (selectionRect) {
			recognizeSelection(selectionRect);
		}
	}, [selectionRect, recognizeSelection]);

	// 选择"任意修改"模式
	const handleSelectFreeEdit = useCallback(() => {
		setEditMode("free");
		setShowMenu(false);
		setShowInput(true);
		// 不进行 OCR，用户直接输入
	}, []);

	// 发送编辑请求
	const handleSend = useCallback(() => {
		if (!selectionRect || !inputText.trim()) return;

		if (onEditRequest) {
			onEditRequest({
				rect: selectionRect,
				text: inputText.trim(),
				containerWidth: containerSize.width,
				containerHeight: containerSize.height,
				mode: editMode,
			});
		}

		console.log("Edit request:", {
			rect: selectionRect,
			text: inputText.trim(),
			containerSize,
			mode: editMode,
		});

		setShowInput(false);
		setInputText("");
		setSelectionRect(null);
	}, [selectionRect, inputText, onEditRequest, containerSize, editMode]);

	// 取消选择
	const handleCancel = useCallback(() => {
		setShowMenu(false);
		setShowInput(false);
		setInputText("");
		setSelectionRect(null);
		setIsRecognizing(false);
	}, []);

	const currentDragRect = isSelecting
		? calculateRect(selectionStart, selectionEnd)
		: null;

	return (
		<div
			ref={containerRef}
			className={`relative inline-block ${className}`}
			onMouseDown={handleMouseDown}
			onMouseMove={handleMouseMove}
			onMouseUp={handleMouseUp}
			onMouseLeave={() => isSelecting && setIsSelecting(false)}
			style={{ cursor: isSelecting ? "crosshair" : "default" }}
		>
			<img
				ref={imgRef}
				src={src}
				alt={alt}
				className="block max-w-full h-auto select-none pointer-events-none"
				draggable={false}
				crossOrigin="anonymous"
			/>

			{/* OCR 文字层 */}
			{ocrResult && containerSize.width > 0 && (
				<TextLayer
					lines={ocrResult.lines}
					imageWidth={ocrResult.imageWidth}
					imageHeight={ocrResult.imageHeight}
					containerWidth={containerSize.width}
					containerHeight={containerSize.height}
				/>
			)}

			{/* 拖拽中的选区 */}
			{currentDragRect && currentDragRect.width > 0 && currentDragRect.height > 0 && (
				<div
					className="absolute border-2 border-blue-500 bg-blue-500/20 pointer-events-none"
					style={{
						left: currentDragRect.x,
						top: currentDragRect.y,
						width: currentDragRect.width,
						height: currentDragRect.height,
					}}
				/>
			)}

			{/* 已确定的选区 */}
			{selectionRect && !isSelecting && (
				<div
					className="absolute border-2 border-blue-500 bg-blue-500/10"
					style={{
						left: selectionRect.x,
						top: selectionRect.y,
						width: selectionRect.width,
						height: selectionRect.height,
						pointerEvents: "none",
					}}
				/>
			)}

			{/* 选择菜单 */}
			{showMenu && selectionRect && (
				<SelectionMenu
					position={{
						left: selectionRect.x + selectionRect.width + 10,
						top: selectionRect.y,
					}}
					onSelectTextEdit={handleSelectTextEdit}
					onSelectFreeEdit={handleSelectFreeEdit}
				/>
			)}

			{/* 输入框 */}
			{showInput && selectionRect && (
				<EditInputDialog
					inputText={inputText}
					onInputChange={setInputText}
					isRecognizing={isRecognizing}
					onSend={handleSend}
					onCancel={handleCancel}
					position={{
						left: Math.min(selectionRect.x, containerSize.width - 420),
						top: selectionRect.y + selectionRect.height + 10,
					}}
					editMode={editMode}
				/>
			)}

			{/* 编辑中的遮罩层 */}
			{isEditing && (
				<div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
					<div className="bg-white rounded-lg px-6 py-4 flex items-center gap-3 shadow-xl">
						<svg
							className="animate-spin h-5 w-5 text-blue-500"
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
						>
							<circle
								className="opacity-25"
								cx="12"
								cy="12"
								r="10"
								stroke="currentColor"
								strokeWidth="4"
							/>
							<path
								className="opacity-75"
								fill="currentColor"
								d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
							/>
						</svg>
						<span className="text-gray-700 font-medium">正在生成新图片...</span>
					</div>
				</div>
			)}
		</div>
	);
}
