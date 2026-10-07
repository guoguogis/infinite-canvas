/**
 * 秘塔 metaso 的 MiniMax 视频接口不是 OpenAI 兼容协议：创建走 POST {baseUrl}/video_generation（JSON），
 * 查询走 GET {baseUrl}/query/video_generation/{task_id}，结果地址在 task.content.url。
 * 因此这三个视频模型必须挂自定义脚本，渠道 Base URL 填 https://metaso.cn/api/minimax/v2。
 * API 版本由用户在 Base URL 里填写，脚本只拼资源路径。
 */
export const METASO_VIDEO_SCRIPT = `
const RESOLUTIONS = {
    "MiniMax-H3": ["480p", "512p", "768P", "2K"],
    "seedance-2.0": ["480p", "720p", "1080p"],
    // mini 档不支持 1080p，实测传入会返回「Seedance resolution 不支持」。
    "seedance-2.0-mini": ["480p", "720p"],
};
const HEIGHTS = { "480p": 480, "512p": 512, "720p": 720, "768P": 768, "1080p": 1080, "2K": 2160 };

async function call(options) {
    try {
        return await request(options);
    } catch (error) {
        const body = error && error.response && error.response.data;
        throw new Error((body && body.error && body.error.message) || (body && body.message) || (error && error.message) || "视频生成请求失败");
    }
}

const allowed = RESOLUTIONS[model] || ["480p", "720p", "1080p"];
const pixel = /^(\\d+)x(\\d+)$/.exec(String(params.size || ""));
const want = pixel ? Math.max(Number(pixel[1]), Number(pixel[2])) : Number(String(params.resolution || "720p").replace(/p$/i, "")) || 720;
const resolution = allowed.reduce((best, value) => (Math.abs(HEIGHTS[value] - want) < Math.abs(HEIGHTS[best] - want) ? value : best), allowed[0]);

const content = [{ type: "text", text: prompt || "" }];
// 参考图限制随模型不同：MiniMax-H3 只接受 1 张（传 2 张即「输入媒体数量超过限制」），
// seedance 系列实测 10 张仍通过，但每张必须用与 type 同级的 role 声明用途，
// 否则返回「Seedance image role 必须明确为 first_frame、last_frame 或 reference_image」。
// 参考图本身还需满足 256–5760 像素。
const seedance = /^seedance/i.test(model);
const refs = images || [];
const used = seedance ? refs : refs.slice(0, 1);
// 应用在首尾帧模式下最多给 2 张图，此时按首帧/尾帧声明，其余场景统一作为参考图。
const frames = params.mode === "frames" && used.length <= 2;
used.forEach((dataUrl, index) => {
    const entry = { type: "image_url", image_url: { url: dataUrl } };
    if (seedance) entry.role = frames ? (index === 0 ? "first_frame" : "last_frame") : "reference_image";
    content.push(entry);
});

const headers = { "Content-Type": "application/json", Authorization: \`Bearer \${apiKey}\` };
const created = await call({
    method: "post",
    url: \`\${baseUrl}/video_generation\`,
    headers,
    data: {
        model: model,
        content: content,
        resolution: resolution,
        // 三个模型都要求 4–15 的整数，而应用的时长滑杆是 4–30，超出时按上限封顶。
        duration: Math.min(15, Math.max(4, Math.round(Number(params.seconds) || 6))),
        ratio: params.ratio || "16:9",
    },
});

const taskId = created && (created.task_id || created.taskId);
if (!taskId) throw new Error("视频生成接口未返回 task_id");

return await poll(
    async () => {
        const state = await call({ method: "get", url: \`\${baseUrl}/query/video_generation/\${encodeURIComponent(taskId)}\`, headers });
        const task = (state && state.task) || {};
        if (task.status === "failed" || task.status === "cancelled") {
            throw new Error((task.error && (task.error.message || task.error)) || task.detail || "视频生成失败");
        }
        const url = (task.content && task.content.url) || task.video_url || task.url;
        return url ? { url: url } : null;
    },
    (result) => result,
    { intervalMs: 4000, timeoutMs: 900000 },
);
`;
