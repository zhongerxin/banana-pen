import { useState, useCallback, useRef } from "react";
// useState: 管理组件状态（loading、error、result）
// useCallback: 缓存函数，避免不必要的重新创建
// useRef: 存储不触发重渲染的数据

import Ocr from "@gutenye/ocr-browser";
// PaddleOCR 的浏览器封装库，提供 OCR 能力

import * as ort from "onnxruntime-web";
// ONNX Runtime Web - 在浏览器中运行神经网络的引擎

/**
 * 配置 ONNX Runtime 从 CDN 加载 WASM 文件
 * 这样做的原因：
 * 1. 避免 Vite 打包 WASM 时的兼容性问题
 * 2. 利用 CDN 缓存，用户可能已从其他网站缓存过
 */
ort.env.wasm.wasmPaths =
	"https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/";

/**
 * OCR 库原始返回的数据结构
 */
interface RawLine {
	text: string; // 识别出的文字
	mean: number; // 置信度分数（OCR 库叫 mean）
	box?: number[][]; // 文字边界框的 4 个角点坐标，可能为空
}

/**
 * 转换后的数据结构，方便 CSS 定位
 */
export interface TextLine {
	text: string; // 识别出的文字
	score: number; // 置信度（重命名自 mean，更语义化）
	frame: {
		// 转换后的矩形框（CSS 友好）
		top: number;
		left: number;
		width: number;
		height: number;
	};
}

/**
 * 最终返回给调用者的完整结果
 */
export interface OCRResult {
	lines: TextLine[]; // 所有识别到的文字行
	imageWidth: number; // 原图宽度
	imageHeight: number; // 原图高度
}

/**
 * 模块级变量，在所有组件实例间共享（单例模式）
 *
 * ocrInstance: 已创建的 OCR 实例
 * ocrPromise: 正在创建中的 Promise（防止重复创建）
 *
 * 类型解释：
 * Awaited<ReturnType<typeof Ocr.create>>
 *   = ReturnType<typeof Ocr.create> 获取 Ocr.create 返回类型（是个 Promise）
 *   = Awaited<...> 提取 Promise 内部的类型
 */
let ocrInstance: Awaited<ReturnType<typeof Ocr.create>> | null = null;
let ocrPromise: Promise<Awaited<ReturnType<typeof Ocr.create>>> | null = null;

/**
 * 单例工厂函数：确保整个应用只创建一个 OCR 实例
 * 为什么用单例？模型加载耗时且占内存，不应重复加载
 */
async function getOCRInstance() {
	// 已有实例，直接返回
	if (ocrInstance) return ocrInstance;

	// 正在创建中，返回同一个 Promise（避免并发时重复创建）
	if (ocrPromise) return ocrPromise;

	// 创建 OCR 实例，从 public/models/ 加载模型文件
	ocrPromise = Ocr.create({
		models: {
			detectionPath: "/models/ch_PP-OCRv4_det_infer.onnx", // 文字检测模型
			recognitionPath: "/models/ch_PP-OCRv4_rec_infer.onnx", // 文字识别模型
			dictionaryPath: "/models/ppocr_keys_v1.txt", // 字符字典
		},
	});

	ocrInstance = await ocrPromise;
	return ocrInstance;
}

/**
 * 将 OCR 返回的 4 角点坐标转换为 CSS 友好的矩形框
 *
 * 输入: box 是 4 个角点的坐标数组
 * [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
 * 通常顺序: 左上、右上、右下、左下
 *
 * 但文字可能是倾斜的，所以不能假设顺序，需要计算外接矩形：
 *
 *  left          right
 *   ↓              ↓
 *   ┌──────────────┐ ← top
 *   │   ╱‾‾‾‾╲     │
 *   │  ╱ 文字 ╲    │
 *   │ ╲____╱      │
 *   └──────────────┘ ← bottom
 */
function boxToFrame(box: number[][]): TextLine["frame"] {
	const xs = box.map((p) => p[0]); // 提取所有 x 坐标: [x1, x2, x3, x4]
	const ys = box.map((p) => p[1]); // 提取所有 y 坐标: [y1, y2, y3, y4]

	const left = Math.min(...xs); // 最左边的 x
	const top = Math.min(...ys); // 最上边的 y
	const right = Math.max(...xs); // 最右边的 x
	const bottom = Math.max(...ys); // 最下边的 y

	return {
		left,
		top,
		width: right - left,
		height: bottom - top,
	};
}

/**
 * OCR Hook - 提供图片文字识别能力
 *
 * 整体数据流：
 * ```
 * 调用 detect("/image.png")
 *         │
 *         ▼
 * ┌───────────────────┐
 * │ getOCRInstance()  │ ← 单例，首次加载模型，后续复用
 * └───────────────────┘
 *         │
 *         ▼
 * ┌───────────────────┐
 * │  new Image()      │ ← 加载图片获取原始尺寸
 * └───────────────────┘
 *         │
 *         ▼
 * ┌───────────────────┐
 * │  ocr.detect()     │ ← PaddleOCR 执行识别
 * └───────────────────┘
 *         │
 *         ▼
 * ┌───────────────────┐
 * │  RawLine[]        │ ← 原始结果 { text, mean, box[][] }
 * └───────────────────┘
 *         │
 *         ▼
 * ┌───────────────────┐
 * │  boxToFrame()     │ ← 坐标转换
 * └───────────────────┘
 *         │
 *         ▼
 * ┌───────────────────┐
 * │  TextLine[]       │ ← 转换后 { text, score, frame }
 * └───────────────────┘
 *         │
 *         ▼
 * ┌───────────────────┐
 * │  setResult()      │ ← 触发 React 重渲染
 * └───────────────────┘
 * ```
 */
export function useOCR() {
	// 是否正在进行 OCR（包括初始化 + 识别）
	const [isLoading, setIsLoading] = useState(false);
	// 是否正在初始化模型（用于显示"加载模型中..."）
	const [isInitializing, setIsInitializing] = useState(false);
	// 错误信息
	const [error, setError] = useState<string | null>(null);
	// OCR 结果
	const [result, setResult] = useState<OCRResult | null>(null);
	// 存储图片尺寸（目前未被外部使用，可能是预留）
	const imageRef = useRef<{ width: number; height: number } | null>(null);

	/**
	 * 执行 OCR 识别
	 *
	 * useCallback 包裹：确保函数引用稳定，不会因组件重渲染而变化
	 * 这对于作为 props 传递或作为 useEffect 依赖很重要
	 *
	 * 依赖数组为空 []：函数永远不会因依赖变化而重建
	 * 因为内部使用的都是外部函数（getOCRInstance, boxToFrame）或 setter
	 */
	const detect = useCallback(async (imageSrc: string) => {
		setIsLoading(true); // 开始加载
		setError(null); // 清除之前的错误

		try {
			// 获取 OCR 实例（首次会加载模型，后续直接返回缓存）
			setIsInitializing(true);
			const ocr = await getOCRInstance();
			setIsInitializing(false);

			// 加载图片获取尺寸
			// 用 Promise 包装图片加载，使其可 await
			// 图片加载是异步的，必须等 onload 后才能读取尺寸
			const img = new Image();
			await new Promise<void>((resolve, reject) => {
				img.onload = () => resolve();
				img.onerror = () => reject(new Error("Failed to load image"));
				img.src = imageSrc;
			});

			// naturalWidth/Height: 图片原始尺寸（非显示尺寸）
			imageRef.current = { width: img.naturalWidth, height: img.naturalHeight };

			// 调用 OCR 引擎进行检测，返回原始结果
			// as RawLine[] 是类型断言
			const rawLines = (await ocr.detect(imageSrc)) as RawLine[];

			// 转换数据格式
			const lines: TextLine[] = rawLines
				// 过滤：只保留有完整 4 点坐标的结果
				.filter((line) => line.box && line.box.length === 4)
				.map((line) => ({
					text: line.text,
					score: line.mean, // 重命名字段
					frame: boxToFrame(line.box!), // 转换坐标格式，! 是非空断言（filter 已保证存在）
				}));

			// 设置结果，触发组件重渲染
			setResult({
				lines,
				imageWidth: img.naturalWidth,
				imageHeight: img.naturalHeight,
			});
		} catch (err) {
			// 错误处理：提取错误消息或使用默认文案
			setError(err instanceof Error ? err.message : "OCR detection failed");
		} finally {
			// 无论成功失败，都重置 loading 状态
			setIsLoading(false);
			setIsInitializing(false);
		}
	}, []);

	return {
		detect, // 执行 OCR 的函数
		result, // OCR 结果
		isLoading, // 是否加载中
		isInitializing, // 是否初始化模型中
		error, // 错误信息
	};
}
