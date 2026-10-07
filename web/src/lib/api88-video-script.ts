/**
 * 88api.ai 的 MiniMax 视频模型。该站是 new-api 系中转（响应头 X-New-Api-Version），
 * 视频模型不走上传式 /videos，而是用 chat/completions 提交，地址随回复内容返回：
 * POST https://88api.ai/v1/chat/completions
 * body: { model, messages: [{ role: "user", content: prompt }], temperature: 0.7 }
 * 渠道 Base URL 填 https://88api.ai/v1。
 * 注意：该模型需要密钥所属分组有可用渠道，否则返回 503 model_not_found；
 * 回复里视频地址的具体字段未经验证，这里从文本内容中提取首个 http 链接。
 */
export const API88_VIDEO_SCRIPT = `
async function call(options) {
    try {
        return await request(options);
    } catch (error) {
        const body = error && error.response && error.response.data;
        const detail = body && ((body.error && (body.error.message || body.error.code)) || body.message || body);
        throw new Error((typeof detail === "string" ? detail : "") || (error && error.message) || "88api 请求失败");
    }
}

const headers = { "Content-Type": "application/json", Authorization: \`Bearer \${apiKey}\` };
const created = await call({
    method: "post",
    url: \`\${baseUrl}/chat/completions\`,
    headers,
    data: {
        model: model,
        messages: [{ role: "user", content: prompt || "" }],
        temperature: 0.7,
    },
});

const choices = (created && created.choices) || [];
const text = choices
    .map((choice) => choice && choice.message && choice.message.content)
    .filter((value) => typeof value === "string")
    .join("\\n");

// 不写成 /https?:\\/\\/.../，避免斜杠在模板字符串里被转义。
const found = text.match(/https?:[^\\s"')]+/);
if (!found) throw new Error("88api 回复里没有找到视频地址：" + text.slice(0, 200));
return { url: found[0] };
`;
