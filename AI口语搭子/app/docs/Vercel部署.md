# Vercel 浏览器语音部署

该模式适用于个人浏览器练习。Vercel Function 接收浏览器 SDP，用服务端密钥向百炼建立 WebRTC；媒体与会话事件直接在浏览器和百炼间传输。永久 API Key 不进入前端。原微信小程序仍需要持续运行的 Node.js WebSocket 后端。

## 部署设置

在当前 GitHub 仓库对应的 Vercel 项目中设置：

- Root Directory：仓库根目录，留空。不能继续使用 `AI口语搭子/app/public`。
- Framework Preset：Other。
- Node.js：22.x。
- Build Command 和 Output Directory 使用仓库根 `vercel.json` 的值。

在 Vercel Environment Variables 中配置 Production（需要预览时也配置 Preview）：

| 变量 | 内容 |
| --- | --- |
| `aliyun` | 北京地域百炼 API Key；兼容 `DASHSCOPE_API_KEY`，前者优先 |
| `DASHSCOPE_WORKSPACE_ID` | 同一 Key 对应业务空间 ID，具有 `qwen3.8-omni-flash-realtime` 权限 |
| `APP_ACCESS_TOKEN` | 自己生成的随机应用访问口令，至少 24 字符；不是百炼 Key |
| `PUBLIC_ORIGIN` | 可选，完整站点 origin；通常留空按当前部署域名校验 |

保存后重新部署。浏览器打开自己的 Vercel 域名，在「连接设置」中填写 `APP_ACCESS_TOKEN`，保存并检查连接。浏览器通过 HTTPS 授权麦克风，戴耳机先说一句 Hi。健康检查只验证参数存在，实际权限、网络与音频需这一步验证。不要把 API Key 填到网页或聊天里。

## 行为与费用边界

六场景、角色音色、人设、难度与提醒方式由服务端目录校验。麦克风直到 `session.updated` 才开始传输；自然插话取消旧回答、丢弃迟到字幕并计入已生成用量。`response.done` 结算后仍等待实际播放静默再回到倾听。切換场景画面和语音球只改变视觉。

单次 10 分钟与空闲 60 秒由客户端执行。用量按每轮 Token 明细估算，缺失时标为待核对；取消回复已经生成的内容仍可能收费。当前设备日估算 3 元、月估算 50 元到达后结束会话；设备账本损坏或无法保存时停止聊天。

这些限制存储在浏览器本地，清除网站数据、换设备、多标签或修改客户端会绕过它们，也没有服务端并发锁。Vercel 模式不具备 Node.js 持久账本与统一预算控制，个人口令不得公开共享；最终费用以百炼账单为准。

当前完成了本地模拟测试，未调用真实云端模型或验证线上部署。Vercel 环境变量缺失时页面保持服务待配置。

## 验证

在 `AI口语搭子/app` 运行 `npm test`。52 项测试使用本地假模型或注入的假 WebRTC Peer，不产生模型费用。另有三个浏览器回归脚本验证原 WebSocket 通道和视觉交互；`test/rtc-browser-check.mjs` 验证浏览器 WebRTC 分支的握手、麦克风门控、字幕、本机费用记录、模式切换、静音和挂断，Peer 仍为模拟对象。脚本均通过 `PLAYWRIGHT_MODULE` 指向安装的 Playwright。真实部署需检查：开口、字幕、双方声音、插话、静音、挂断、断网和实际账单；微信真机验收独立进行。

协议依据：[阿里云 WebRTC 实时对话](https://help.aliyun.com/en/model-studio/best-practice-webrtc-omni-realtime)、[实时对话文档](https://help.aliyun.com/zh/model-studio/realtime)、[Vercel WebSocket 限制](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections)。
