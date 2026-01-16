# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (http://localhost:5173)
npm run build    # TypeScript check + Vite build
npm run lint     # ESLint
npm run deploy   # Deploy to Cloudflare Workers
```

## Architecture

This is a **Live Text for Web** application - like iOS Live Text, it recognizes text in images and makes it selectable/copyable in the browser.

### Tech Stack
- React 19 + TypeScript + Vite
- Tailwind CSS v4 + shadcn/ui
- OCR: @gutenye/ocr-browser (PaddleOCR + ONNX Runtime Web)
- Backend: Cloudflare Workers + Hono

### Core Data Flow

```
User clicks "开始使用"
    ↓
useOCR.ts: detect(imageSrc)
    ↓
1. Load ONNX Runtime WASM from CDN
2. Initialize PaddleOCR models from /public/models/
3. Run OCR detection → returns { text, box[][] }
4. Transform box coordinates to { left, top, width, height }
    ↓
LiveTextViewer receives OCRResult
    ↓
TextLayer renders transparent <span> elements
positioned over each text region
```

### Key Components

| File | Purpose |
|------|---------|
| `src/react-app/hooks/useOCR.ts` | OCR singleton, model loading, coordinate transformation |
| `src/react-app/components/LiveText/LiveTextViewer.tsx` | Container that syncs image display size with text layer |
| `src/react-app/components/LiveText/TextLayer.tsx` | Renders transparent selectable text spans |

### OCR Coordinate System

The OCR library returns `box: number[][]` (4 corner points). The `boxToFrame()` function converts this to `{ left, top, width, height }` for CSS positioning.

Scale factors are calculated as `containerWidth / imageWidth` to map original image coordinates to displayed size.

### ONNX Runtime Configuration

WASM files are loaded from CDN to avoid Vite bundling issues:
```typescript
ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/";
```

### Path Alias

`@/*` maps to `./src/react-app/*` (configured in tsconfig.json and vite.config.ts)
