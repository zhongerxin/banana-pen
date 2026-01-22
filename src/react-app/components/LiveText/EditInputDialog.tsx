import { useRef, useEffect, useCallback } from "react";
import type { EditMode } from "./LiveTextViewer";

interface EditInputDialogProps {
	inputText: string;
	onInputChange: (text: string) => void;
	isRecognizing: boolean;
	onSend: () => void;
	onCancel: () => void;
	position: { left: number; top: number };
	editMode: EditMode;
}

/**
 * 编辑输入对话框组件
 */
export function EditInputDialog({
	inputText,
	onInputChange,
	isRecognizing,
	onSend,
	onCancel,
	position,
	editMode,
}: EditInputDialogProps) {
	const inputRef = useRef<HTMLTextAreaElement>(null);

	// 非识别状态时自动聚焦
	useEffect(() => {
		if (!isRecognizing && inputRef.current) {
			inputRef.current.focus();
		}
	}, [isRecognizing]);

	// 键盘事件处理
	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				onSend();
			} else if (e.key === "Escape") {
				onCancel();
			}
		},
		[onSend, onCancel]
	);

	return (
		<div
			className="edit-input-container absolute z-50 bg-white rounded-xl shadow-xl border border-gray-200 p-4"
			style={{
				left: position.left,
				top: position.top,
				width: 400,
			}}
		>
			{/* 关闭按钮 */}
			<button
				onClick={onCancel}
				className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					className="h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M6 18L18 6M6 6l12 12"
					/>
				</svg>
			</button>

			{/* 标题 */}
			<div className="text-sm text-gray-500 mb-3 pr-6">
				{isRecognizing
					? "正在识别文字..."
					: editMode === "text"
						? "输入想要替换的文本："
						: "描述想要的修改效果："}
			</div>

			{/* 输入区域 */}
			<div className="flex items-stretch gap-3">
				<div className="flex-1 relative">
					<textarea
						ref={inputRef}
						value={inputText}
						onChange={(e) => onInputChange(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder={
							isRecognizing
								? "识别中..."
								: editMode === "text"
									? "输入替换文本..."
									: "描述修改效果，如：删除这个区域、换成蓝色背景..."
						}
						disabled={isRecognizing}
						rows={2}
						className="w-full h-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm disabled:bg-gray-50 disabled:text-gray-400 resize-none leading-relaxed"
					/>
					{isRecognizing && (
						<div className="absolute right-3 top-3">
							<svg
								className="animate-spin h-4 w-4 text-blue-500"
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
						</div>
					)}
				</div>
				<button
					onClick={onSend}
					disabled={!inputText.trim() || isRecognizing}
					className="self-end px-5 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm font-medium whitespace-nowrap"
				>
					发送
				</button>
			</div>
		</div>
	);
}
