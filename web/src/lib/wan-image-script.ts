/**
 * 阿里云百炼万相图像生成（wan2.7-image / wan2.7-image-pro）。
 * 走业务空间专属 host 的 DashScope 原生端点：
 * POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
 * body: model + input.messages[].content[] + parameters.{size, n, watermark, thinking_mode}。
 * 与 qwen-image 的 OpenAI 兼容端点不同：这里 size 用 1K/2K/4K 预设（应用内部传的是像素串，需要换算），
 * content 数组里用 { text } 和 { image } 两种条目，同步返回，结果在 output.choices[].message.content[].image。
 * 渠道 Base URL 填 https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com（不带 /api/v1）。
 */
export const WAN_IMAGE_SCRIPT = `
async function call(options) {
    try {
        return await request(options);
    } catch (error) {
        const body = error && error.response && error.response.data;
        const detail = body && (body.error || body);
        throw new Error((detail && (detail.message || detail.code)) || (error && error.message) || "wan2.7-image 请求失败");
    }
}

// 应用内部传像素串（如 1024x1024），该接口要 1K/2K/4K 预设。
const pixels = /^(\\d+)x(\\d+)$/.exec(String(params.size || ""));
const area = pixels ? Number(pixels[1]) * Number(pixels[2]) : 0;
// 应用 1K / 2K / 4K 预设的面积区间分别是 0.79–1.74M、2.36–4.19M、6.33–8.29M，
// 取 2M 与 5M 作分界可覆盖尺寸表全部 18 个预设。
// 但文档规定 wan2.7-image 只支持 1K/2K，wan2.7-image-pro 在有参考图时同样只到 2K，
// 所以超出支持范围时按该模型最高档封顶，避免发出它不认的 4K。
const presets = model === "wan2.7-image" || (images && images.length) ? ["1K", "2K"] : ["1K", "2K", "4K"];
const wanted = !area ? 1 : area <= 2000000 ? 0 : area <= 5000000 ? 1 : 2;
const size = presets[Math.min(wanted, presets.length - 1)];

const content = [{ text: prompt || "" }];
for (const dataUrl of images || []) {
    content.push({ image: dataUrl });
}

const headers = { "Content-Type": "application/json", Authorization: \`Bearer \${apiKey}\` };
// 同一 host 同时提供 /compatible-mode/v1 与 /api/v1 两套接口，
// 渠道 Base URL 按兼容端点填写，这里去掉该后缀再拼 DashScope 原生路径。
const root = String(baseUrl).replace(/\\/+$/, "").replace(/\\/compatible-mode\\/v1$/i, "");
const created = await call({
    method: "post",
    url: \`\${root}/api/v1/services/aigc/multimodal-generation/generation\`,
    headers,
    data: {
        model: model,
        input: { messages: [{ role: "user", content: content }] },
        parameters: {
            size: size,
            n: Number(params.count) || 1,
            watermark: false,
            thinking_mode: true,
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
if (!urls.length) throw new Error("wan2.7-image 接口没有返回图片");
return urls;
`;
