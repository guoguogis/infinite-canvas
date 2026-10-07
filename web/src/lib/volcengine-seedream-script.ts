/**
 * 火山方舟 Seedream 图像生成接口。
 * 端点 POST https://ark.cn-beijing.volces.com/api/v3/images/generations，OpenAI 风格但参数不完全兼容：
 * size 用 1K/2K/3K/4K 预设或受约束的像素串（不是任意 WIDTHxHEIGHT），
 * response_format 用 url 时结果链接 24 小时过期，output_format 只有 5.0 Pro/Lite 支持。
 * 因此 Seedream 必须挂自定义脚本，不走内置的 /images/generations 默认请求。
 */
export const VOLCENGINE_SEEDREAM_SCRIPT = `
const PRESETS = {
    "doubao-seedream-5-0-pro-260628": ["1K", "2K"],
    "doubao-seedream-5-0-260128": ["2K", "3K", "4K"],
    "doubao-seedream-5-0-lite-260128": ["2K", "3K", "4K"],
    "doubao-seedream-4-5-251128": ["2K", "4K"],
    "doubao-seedream-4-0-250828": ["1K", "2K", "4K"],
};
const PIXEL_MIN = {
    "doubao-seedream-5-0-pro-260628": 1280 * 720,
    "doubao-seedream-5-0-260128": 2560 * 1440,
    "doubao-seedream-5-0-lite-260128": 2560 * 1440,
    "doubao-seedream-4-5-251128": 2560 * 1440,
    "doubao-seedream-4-0-250828": 1280 * 720,
};
const SUPPORTS_OUTPUT_FORMAT = /5-0-(pro|lite)-|5-0-260128/;

// 方舟用 400 承载内容策略拦截（如 OutputImageSensitiveContentDetected），axios 会直接抛错，
// 这里统一取出响应体里的真实原因，避免只看到 "Request failed with status code 400"。
async function call(options) {
    try {
        return await request(options);
    } catch (error) {
        const body = error && error.response && error.response.data;
        const detail = body && (body.error || body);
        throw new Error((detail && (detail.message || detail.code)) || (error && error.message) || "Seedream 请求失败");
    }
}

// 请求侧像素串 -> Seedream 预设；超出预设范围时退回最大预设。
const raw = String(params.size || "");
const pixels = /^(\\d+)x(\\d+)$/.exec(raw);
const area = pixels ? Number(pixels[1]) * Number(pixels[2]) : 0;
const presets = PRESETS[model] || ["1K", "2K"];
const order = ["1K", "2K", "3K", "4K"];
const rank = order.findIndex((item) => item === raw.toUpperCase());
const scale = rank >= 0 ? rank : area ? (area <= 1024 * 1024 ? 0 : area <= 2048 * 2048 ? 1 : 2) : -1;
const allowed = presets.map((item) => order.indexOf(item)).filter((index) => index >= 0);
// 请求像素过小（低于该模型显式模式的最小像素积）时按最小预设走，避免落到不被接受的区间。
const floor = PIXEL_MIN[model];
const target = area && floor && area < floor ? -1 : scale;
const size = presets[allowed.reduce((best, index) => (Math.abs(index - target) < Math.abs(best - target) ? index : best), allowed[0])];

const body = {
    model: model,
    prompt: prompt || "",
    size: size,
    response_format: "url",
    watermark: false,
};
if (SUPPORTS_OUTPUT_FORMAT.test(model)) body.output_format = "png";
body.optimize_prompt_options = { mode: "standard" };

const created = await call({
    method: "post",
    url: \`\${baseUrl}/images/generations\`,
    headers: { "Content-Type": "application/json", Authorization: \`Bearer \${apiKey}\` },
    data: body,
});
const failed = created && (created.error || (created.data && created.data.error));
if (failed) throw new Error((failed.message || failed.code) || "Seedream 生成失败");
const urls = [];
const payload = (created && created.data) || [];
for (const item of Array.isArray(payload) ? payload : [payload]) {
    if (item && typeof item.url === "string") urls.push(item.url);
    else if (item && typeof item.b64_json === "string") urls.push(\`data:image/png;base64,\${item.b64_json}\`);
}
if (!urls.length) throw new Error("Seedream 接口没有返回图片");
return urls;
`;
