# Banana Pen - Live Text for Web

一个类似 iOS Live Text 的 Web 应用，可以识别图片中的文字并让用户直接选择、复制。

## 功能特性

- 基于 PaddleOCR PP-OCRv4 模型，支持中英文识别
- 完全在浏览器端运行（ONNX Runtime Web），无需后端服务
- 识别后的文字可直接选择、复制，体验如同原生文本
- 支持双击选词、三击选行等浏览器原生选择行为

## 技术栈

- **前端**: React 19 + TypeScript + Vite
- **UI**: Tailwind CSS + shadcn/ui
- **OCR**: [@gutenye/ocr-browser](https://github.com/gutenye/ocr) (PaddleOCR + ONNX Runtime Web)
- **部署**: Cloudflare Workers + Hono

## 工作原理

```
┌─────────────────────────────────────┐
│  图片容器 (relative)                 │
│  ┌───────────────────────────────┐  │
│  │ 透明文本层 (absolute)          │  │
│  │  ┌─────┐ ┌──────────┐        │  │  ← 透明 <span> 精确覆盖在文字位置
│  │  │span │ │  span    │        │  │
│  │  └─────┘ └──────────┘        │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │         <img>                 │  │  ← 底图
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

1. **OCR 检测**: 使用 PaddleOCR 识别图片中的文字及其位置（bounding box）
2. **文本层渲染**: 在图片上覆盖一层透明的 `<span>` 元素，精确对齐每个文字区域
3. **原生选择**: 用户选择的是透明文字，但视觉上像是在选择图片中的文字

## 项目结构

```
src/react-app/
├── App.tsx                      # 主应用
├── hooks/
│   └── useOCR.ts                # OCR Hook (模型加载、检测、结果转换)
├── components/
│   ├── LiveText/
│   │   ├── LiveTextViewer.tsx   # 图片+文本层容器
│   │   └── TextLayer.tsx        # 透明可选文本层
│   └── ui/                      # shadcn/ui 组件
public/
└── models/                      # PaddleOCR ONNX 模型文件
```

## 开始使用

安装依赖：

```bash
npm install
```

启动开发服务器：

```bash
npm run dev
```

打开 http://localhost:5173，点击"开始使用"按钮即可体验 OCR 功能。

## 构建部署

```bash
npm run build
npm run deploy
```

## 模型文件

项目使用以下 PaddleOCR 模型（已包含在 `public/models/` 目录）：

| 文件 | 说明 | 大小 |
|------|------|------|
| `ch_PP-OCRv4_det_infer.onnx` | 文字检测模型 | ~4.7MB |
| `ch_PP-OCRv4_rec_infer.onnx` | 文字识别模型 | ~10.8MB |
| `ppocr_keys_v1.txt` | 字符字典 | ~26KB |

## 参考资源

- [gutenye/ocr](https://github.com/gutenye/ocr) - 跨平台 OCR 库
- [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) - 百度 OCR 模型
- [ONNX Runtime Web](https://onnxruntime.ai/docs/get-started/with-javascript/web.html) - 浏览器端 ML 推理
