import { Button } from "@/components/ui/button";
import { LiveTextViewer } from "@/components/LiveText";
import type { EditRequestParams } from "@/components/LiveText";
import { useVolOCR } from "@/hooks/useVolOCR";
import { useBanana } from "@/hooks/useBanana";
import { useEffect, useState, useCallback } from "react";

function App() {
	const { detect, result, isLoading, isInitializing, error } = useVolOCR();
	const { editImage, isLoading: isEditing, error: editError } = useBanana();
	const [imageSrc, setImageSrc] = useState("/report.png");
	const [originalSrc, setOriginalSrc] = useState<string | null>(null); // 保存原图
	const [isComparing, setIsComparing] = useState(false); // 对比模式

	const handleClick = () => {
		detect(imageSrc);
	};

	// 处理图片编辑请求
	const handleEditRequest = useCallback(
		async (params: EditRequestParams) => {
			const { rect, text, containerWidth, containerHeight, mode } = params;

			// 保存当前图片作为原图（用于对比）
			const currentSrc = imageSrc;

			const editResult = await editImage(
				imageSrc,
				rect,
				text,
				containerWidth,
				containerHeight,
				mode
			);

			if (editResult.success && editResult.newImageUrl) {
				// 保存原图用于对比
				setOriginalSrc(currentSrc);
				// 更新图片为编辑后的新图片
				setImageSrc(editResult.newImageUrl);
				// 关闭对比模式
				setIsComparing(false);
			} else {
				console.error("图片编辑失败:", editResult.error);
			}
		},
		[imageSrc, editImage]
	);

	// 切换对比模式
	const toggleCompare = () => {
		setIsComparing(!isComparing);
	};

	useEffect(() => {
		if (result) {
			console.log("OCR 结果:", result);
		}
	}, [result]);

	return (
		<div className="min-h-screen flex flex-col items-center justify-center gap-8 p-8">
			{/* 图片显示区域 */}
			<div className="relative max-w-6xl w-full inline-flex justify-center rounded-lg">
				<LiveTextViewer
					src={imageSrc}
					alt="Report"
					className="shadow-md rounded-lg"
					ocrResult={result}
					onEditRequest={handleEditRequest}
					isEditing={isEditing}
				/>

				{/* 对比模式：原图叠加层 */}
				{isComparing && originalSrc && (
					<img
						src={originalSrc}
						alt="Original"
						className="absolute inset-0 w-full h-full object-fill opacity-50 pointer-events-none rounded-lg"
					/>
				)}
			</div>

			<div className="flex flex-col items-center gap-2">
				<div className="flex gap-2">
					<Button onClick={handleClick} disabled={isLoading}>
						{isInitializing
							? "加载模型中..."
							: isLoading
								? "识别中..."
								: result
									? "重新识别"
									: "开始使用"}
					</Button>

					{/* 对比按钮：仅在编辑过图片后显示 */}
					{originalSrc && (
						<Button
							variant={isComparing ? "default" : "outline"}
							onClick={toggleCompare}
						>
							{isComparing ? "关闭对比" : "对比"}
						</Button>
					)}
				</div>

				{error && <p className="text-red-500 text-sm">{error}</p>}
				{editError && <p className="text-red-500 text-sm">{editError}</p>}

				{result && (
					<div className="flex flex-col items-center gap-2">
						<p className="text-muted-foreground text-sm">
							识别到 {result.lines.length} 行文字，可直接选择复制
						</p>
						<p className="text-muted-foreground text-sm">
							{result.toString()}
						</p>
					</div>
				)}
			</div>
		</div>
	);
}

export default App;
