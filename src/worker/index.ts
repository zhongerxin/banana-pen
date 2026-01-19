import { Hono } from "hono";

// 扩展 Env 类型以包含火山引擎凭证
interface WorkerEnv extends Env {
	VOL_ACCESS_KEY_ID: string;
	VOL_SECRET_ACCESS_KEY: string;
}

const app = new Hono<{ Bindings: WorkerEnv }>();

// ============ 火山引擎签名工具函数 ============

/**
 * HMAC-SHA256 签名
 */
async function hmacSHA256(
	key: ArrayBuffer | string,
	data: string
): Promise<ArrayBuffer> {
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		typeof key === "string" ? new TextEncoder().encode(key) : key,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"]
	);
	return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

/**
 * SHA256 哈希（返回十六进制字符串）
 */
async function hashSHA256(data: string): Promise<string> {
	const hash = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(data)
	);
	return Array.from(new Uint8Array(hash))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * ArrayBuffer 转十六进制字符串
 */
function bufferToHex(buffer: ArrayBuffer): string {
	return Array.from(new Uint8Array(buffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * 火山引擎 API 签名 V4
 * 按照官方文档实现：https://www.volcengine.com/docs/6369/67269
 */
async function signVolcengineRequest(
	method: string,
	host: string,
	path: string,
	queryParams: Record<string, string>,
	headers: Record<string, string>,
	body: string,
	accessKeyId: string,
	secretAccessKey: string,
	service: string,
	region: string
): Promise<{ authorization: string; xDate: string; xContentSha256: string }> {
	// 1. 生成时间戳
	const now = new Date();
	const xDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
	const dateStamp = xDate.substring(0, 8); // YYYYMMDD

	// 2. 计算请求体哈希
	const xContentSha256 = await hashSHA256(body);

	// 3. 构建规范请求 (Canonical Request)
	// 3.1 规范化查询字符串
	const sortedParams = Object.keys(queryParams)
		.sort()
		.map(
			(key) =>
				`${encodeURIComponent(key)}=${encodeURIComponent(queryParams[key])}`
		)
		.join("&");

	// 3.2 规范化请求头
	const signedHeaderKeys = ["host", "x-date", "x-content-sha256", "content-type"];
	const canonicalHeaders = signedHeaderKeys
		.map((key) => {
			if (key === "host") return `host:${host}`;
			if (key === "x-date") return `x-date:${xDate}`;
			if (key === "x-content-sha256") return `x-content-sha256:${xContentSha256}`;
			if (key === "content-type") return `content-type:${headers["content-type"] || headers["Content-Type"]}`;
			return "";
		})
		.join("\n") + "\n";

	const signedHeaders = signedHeaderKeys.join(";");

	// 3.3 构建规范请求
	const canonicalRequest = [
		method,
		path,
		sortedParams,
		canonicalHeaders,
		signedHeaders,
		xContentSha256,
	].join("\n");

	// 4. 创建待签名字符串 (String to Sign)
	const credentialScope = `${dateStamp}/${region}/${service}/request`;
	const hashedCanonicalRequest = await hashSHA256(canonicalRequest);
	const stringToSign = [
		"HMAC-SHA256",
		xDate,
		credentialScope,
		hashedCanonicalRequest,
	].join("\n");

	// 5. 计算签名密钥 (Signing Key)
	const kDate = await hmacSHA256(secretAccessKey, dateStamp);
	const kRegion = await hmacSHA256(kDate, region);
	const kService = await hmacSHA256(kRegion, service);
	const kSigning = await hmacSHA256(kService, "request");

	// 6. 计算签名
	const signature = bufferToHex(await hmacSHA256(kSigning, stringToSign));

	// 7. 构建 Authorization Header
	const authorization = `HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

	return { authorization, xDate, xContentSha256 };
}

// ============ API 端点 ============

app.get("/api/", (c) => c.json({ name: "Cloudflare" }));

/**
 * OCR 识别端点
 * 接收 base64 图片，调用火山引擎 OCRPdf API (file_type=image)
 */
app.post("/api/ocr", async (c) => {
	try {
		const { image_base64 } = await c.req.json<{ image_base64: string }>();

		if (!image_base64) {
			return c.json({ error: "image_base64 is required" }, 400);
		}

		// 火山引擎 API 配置
		const host = "visual.volcengineapi.com";
		const path = "/";
		const service = "cv";
		const region = "cn-north-1";
		const action = "OCRPdf";
		const version = "2021-08-23";

		// 查询参数
		const queryParams = {
			Action: action,
			Version: version,
		};

		// 请求体 (application/x-www-form-urlencoded)
		const bodyParams = new URLSearchParams();
		bodyParams.append("image_base64", image_base64);
		bodyParams.append("file_type", "image"); // 指定为图片类型，默认是 pdf
		bodyParams.append("version", "v3"); // 版本号
		const body = bodyParams.toString();

		// 请求头
		const headers: Record<string, string> = {
			"content-type": "application/x-www-form-urlencoded",
		};

		// 获取环境变量中的 AK/SK
		const accessKeyId = c.env.VOL_ACCESS_KEY_ID;
		const secretAccessKey = c.env.VOL_SECRET_ACCESS_KEY;

		if (!accessKeyId || !secretAccessKey) {
			return c.json({ error: "Missing Volcengine credentials" }, 500);
		}

		// 生成签名
		const { authorization, xDate, xContentSha256 } =
			await signVolcengineRequest(
				"POST",
				host,
				path,
				queryParams,
				headers,
				body,
				accessKeyId,
				secretAccessKey,
				service,
				region
			);

		// 构建完整 URL
		const queryString = Object.entries(queryParams)
			.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
			.join("&");
		const url = `https://${host}${path}?${queryString}`;

		// 发起请求
		const response = await fetch(url, {
			method: "POST",
			headers: {
				...headers,
				Host: host,
				"X-Date": xDate,
				"X-Content-Sha256": xContentSha256,
				Authorization: authorization,
			},
			body: body,
		});

		const result = await response.json();

		// 返回火山引擎的响应
		return c.json(result);
	} catch (error) {
		console.error("OCR API error:", error);
		return c.json(
			{
				error: "OCR request failed",
				details: error instanceof Error ? error.message : String(error),
			},
			500
		);
	}
});

export default app;
