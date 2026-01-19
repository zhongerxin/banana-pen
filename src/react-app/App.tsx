import { Button } from "@/components/ui/button";
import { LiveTextViewer } from "@/components/LiveText";
import { useOCR } from "@/hooks/useOCR";
import { useEffect } from "react";                                                             

function App() {
	const { detect, result, isLoading, isInitializing, error } = useOCR();

	const handleClick = () => {
		detect("/report.png");
	};

	useEffect(() => {
		if (result) {
			console.log("OCR 结果:", result);
		}
	}, [result]);   

	return (
		<div className="min-h-screen flex flex-col items-center justify-center gap-8 p-8">
			<LiveTextViewer
				src="/report.png"
				alt="Report"
				className="max-w-6xl w-full shadow-md rounded-lg overflow-hidden"
				ocrResult={result}
			/>

			<div className="flex flex-col items-center gap-2">
				<Button onClick={handleClick} disabled={isLoading}>
					{isInitializing
						? "加载模型中..."
						: isLoading
							? "识别中..."
							: result
								? "重新识别"
								: "开始使用"}
				</Button>

				{error && <p className="text-red-500 text-sm">{error}</p>}

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
