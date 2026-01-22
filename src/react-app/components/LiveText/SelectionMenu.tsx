interface SelectionMenuProps {
	position: { left: number; top: number };
	onSelectTextEdit: () => void;
	onSelectFreeEdit: () => void;
}

/**
 * 选区操作菜单
 */
export function SelectionMenu({
	position,
	onSelectTextEdit,
	onSelectFreeEdit,
}: SelectionMenuProps) {
	return (
		<div
			className="selection-menu absolute z-50 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[120px]"
			style={{
				left: position.left,
				top: position.top,
			}}
		>
			<button
				onClick={onSelectTextEdit}
				className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors"
			>
				修改文本
			</button>
			<button
				onClick={onSelectFreeEdit}
				className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors"
			>
				任意修改
			</button>
		</div>
	);
}
