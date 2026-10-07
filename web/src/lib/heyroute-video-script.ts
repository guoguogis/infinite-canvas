/**
 * heyroute.ai 视频接口。它是 OpenAI 兼容中转，但创建任务要求 JSON 而不是 multipart，
 * 字段用 ratio / resolution，与应用内置的 OpenAI 视频路径（FormData + size / resolution_name）不兼容。
 * 轮询和下载与内置路径一致：GET {baseUrl}/videos/{task_id}、GET {baseUrl}/videos/{task_id}/content。
 * 渠道 Base URL 填 https://heyroute.ai/v1。
 * 注意：seedance-2.0 与 seedance-2.0-fast 只支持 480p / 720p，且只产出 15 秒视频，minimax-h3-* 更慢，文档建议客户端留足 30 分钟。
 */
export const HEYROUTE_VIDEO_SCRIPT = `
const RESOLUTIONS = ["480p", "720p", "1080p"];

// heyroute 用错误码承载失败原因，axios 会直接抛错，这里统一取出响应体里的真实信息。
async function call(options) {
    try {
        return await request(options);
    } catch (error) {
        const body = error && error.response && error.response.data;
        const detail = body && (body.error || body);
        throw new Error((detail && (detail.message || detail.code)) || (error && error.message) || "heyroute 请求失败");
    }
}

const wanted = String(params.resolution || "").trim().toLowerCase();
const pixels = /^(\\d+)x(\\d+)$/.exec(String(params.size || ""));
const target = /^\\d+p$/.test(wanted)
    ? Number(wanted.replace(/p$/, ""))
    : pixels ? Math.min(Number(pixels[1]), Number(pixels[2])) : 720;
const resolution = RESOLUTIONS.reduce((best, value) => (Math.abs(Number(value.replace(/p$/, "")) - target) < Math.abs(Number(best.replace(/p$/, "")) - target) ? value : best), RESOLUTIONS[0]);

const headers = { "Content-Type": "application/json", Authorization: \`Bearer \${apiKey}\` };
const created = await call({
    method: "post",
    url: \`\${baseUrl}/videos\`,
    headers,
    data: {
        model: model,
        prompt: prompt || "",
        ratio: params.ratio || "16:9",
        resolution: resolution,
        duration: Number(params.seconds) || 15,
    },
});

const taskId = created && (created.id || created.task_id || created.taskId);
if (!taskId) throw new Error("视频接口未返回任务 ID");

return await poll(
    async () => {
        const state = await call({ method: "get", url: \`\${baseUrl}/videos/\${encodeURIComponent(taskId)}\`, headers });
        const status = state && state.status;
        if (status === "failed" || status === "cancelled") {
            const detail = state && (state.error || state.fail_code);
            throw new Error((detail && (detail.message || detail)) || "视频生成失败");
        }
        // 直接把地址给出来时不必再下载一次。
        const url = state && (state.video_url || state.url || (state.output && state.output.url));
        if (url) return { url: url };
        if (status === "completed") {
            return await call({ method: "get", url: \`\${baseUrl}/videos/\${encodeURIComponent(taskId)}/content\`, headers, responseType: "blob" });
        }
        return null;
    },
    (result) => result,
    { intervalMs: 15000, timeoutMs: 1800000 },
);
`;
