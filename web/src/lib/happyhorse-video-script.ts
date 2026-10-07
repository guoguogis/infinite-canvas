/**
 * 阿里云百炼 happyhorse 视频接口。它走 DashScope 原生异步协议，不是 OpenAI 兼容：
 * 创建 POST {baseUrl}/api/v1/services/aigc/video-generation/video-synthesis，必须带 X-DashScope-Async: enable，
 * 请求体是 model + input.prompt + parameters.{resolution, ratio, duration}，
 * 查询 GET {baseUrl}/api/v1/tasks/{task_id}，结果地址在 output.video_url。
 * 注意 host 是业务空间专属域名 https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com，
 * 与 TokenPlan 的 token-plan.cn-beijing.maas.aliyuncs.com 不是同一个入口，后者不提供这些模型。
 * 渠道 Base URL 填 https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com，不要带 /api/v1。
 */
export const HAPPYHORSE_VIDEO_SCRIPT = `
async function call(options) {
    try {
        return await request(options);
    } catch (error) {
        const body = error && error.response && error.response.data;
        const detail = body && (body.error || body);
        throw new Error((detail && (detail.message || detail.code)) || (error && error.message) || "happyhorse 请求失败");
    }
}

const headers = { "Content-Type": "application/json", Authorization: \`Bearer \${apiKey}\` };
// 同一 host 同时提供 /compatible-mode/v1 与 /api/v1 两套接口，
// 渠道 Base URL 按兼容端点填写，这里去掉该后缀再拼 DashScope 原生路径。
const root = String(baseUrl).replace(/\\/+$/, "").replace(/\\/compatible-mode\\/v1$/i, "");

const input = { prompt: prompt || "" };
// 图生视频的参考图。字段名按 DashScope 惯例写成 img_url，文生视频接口文档未涉及，尚未验证。
if (images && images.length) input.img_url = images[0];

const created = await call({
    method: "post",
    url: \`\${root}/api/v1/services/aigc/video-generation/video-synthesis\`,
    headers: { ...headers, "X-DashScope-Async": "enable" },
    data: {
        model: model,
        input: input,
        parameters: {
            // 应用内部是 "720p"，DashScope 要 "720P"。
            resolution: String(params.resolution || "720p").toUpperCase(),
            ratio: params.ratio || "16:9",
            duration: Number(params.seconds) || 5,
        },
    },
});

const output = (created && created.output) || {};
const taskId = output.task_id || output.taskId || (created && created.task_id);
if (!taskId) throw new Error("视频接口未返回 task_id");

return await poll(
    async () => {
        const state = await call({ method: "get", url: \`\${root}/api/v1/tasks/\${encodeURIComponent(taskId)}\`, headers });
        const result = (state && state.output) || {};
        const status = result.task_status;
        if (status === "FAILED" || status === "CANCELED") {
            throw new Error(result.message || result.code || "视频生成失败");
        }
        const url = result.video_url || (result.results && result.results[0] && result.results[0].url);
        return url ? { url: url } : null;
    },
    (result) => result,
    { intervalMs: 10000, timeoutMs: 1800000 },
);
`;
