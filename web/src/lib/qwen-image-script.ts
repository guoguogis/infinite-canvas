/**
 * 阿里云百炼千问图像生成。它与万相同样走 DashScope 原生端点，而不是 /compatible-mode/v1——
 * 把 qwen-image-3.0-pro 发到兼容路由会返回 url error，而原生路由接受它。
 * POST {baseUrl-root}/api/v1/services/aigc/multimodal-generation/generation
 * body: model + input.messages[].content[] + parameters.{size, n, prompt_extend, watermark}
 * 响应为 output.choices[].message.content[].image。
 * 尺寸用星号：OpenAI 兼容协议是 '1024x1024'，DashScope 原生协议是 '1024*1024'，两者不通用。
 * 参考图放在 content 里，文档确认 qwen-image-3.0 系列支持 1–3 张图生图。
 * 渠道 Base URL 填 https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1（脚本会去掉该后缀）。
 */
export const QWEN_IMAGE_SCRIPT = `
async function call(options) {
    try {
        return await request(options);
    } catch (error) {
        const body = error && error.response && error.response.data;
        const detail = body && (body.error || body);
        throw new Error((detail && (detail.message || detail.code)) || (error && error.message) || "qwen-image 请求失败");
    }
}

// 原生端点要求 '<宽>*<高>'（星号分隔），应用内部是 '1024x1024'，需要替换分隔符。
// 传 1K/2K/4K 预设会返回 InvalidParameter: Expected format: '<width>*<height>'。
const raw = String(params.size || "").trim();
const size = /^\\d+[x*]\\d+$/i.test(raw) ? raw.replace(/x/i, "*") : "1024*1024";

const headers = { "Content-Type": "application/json", Authorization: \`Bearer \${apiKey}\` };

// 官方文档确认支持图生图：qwen-image-3.0 系列可传 1–3 张参考图，按顺序定义图像顺序；
// 空数组会返回 400，所以没有参考图时不能带该条目。
const content = [{ text: prompt || "" }];
for (const dataUrl of images || []) {
    content.push({ image: dataUrl });
}

// 同一 host 同时提供 /compatible-mode/v1 与 /api/v1 两套接口，渠道按兼容端点填 Base URL。
const root = String(baseUrl).replace(/\\/+$/, "").replace(/\\/compatible-mode\\/v1$/i, "");
const created = await call({
    method: "post",
    url: \`\${root}/api/v1/services/aigc/multimodal-generation/generation\`,
    headers,
    data: {
        model: model,
        input: {
            messages: [{ role: "user", content: content }],
        },
        parameters: {
            size: size,
            n: Number(params.count) || 1,
            prompt_extend: true,
            watermark: false,
        },
    },
});

const urls = [];
const choices = (created && created.output && created.output.choices) || [];
for (const choice of choices) {
    const parts = (choice && choice.message && choice.message.content) || [];
    for (const part of parts) {
        if (part && typeof part.image === "string" && part.image) urls.push(part.image);
    }
}
if (!urls.length) throw new Error("qwen-image 接口没有返回图片");
return urls;
`;
