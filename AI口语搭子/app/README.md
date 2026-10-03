# AI口语搭子 · 开发版

面向有基础、但不敢开口的成年人。微信小程序持续采集声音，通过 Node.js 后端连接千问实时语音模型，支持自然停顿、流式播放、打断、字幕和本次费用估算。初版按你一个人使用设计，同时只允许一通会话。

当前已经实现客户端和真实接口适配；未填写百炼凭证时只显示「服务待配置」。项目中没有伪装成 AI 的演示回复。`test/` 内的模拟服务仅供自动化测试，不会连接阿里云。

## 1. 先在电脑打开

需要 Node.js 22 或更新版本。当前电脑已具备运行环境和依赖。

```sh
cd '/Users/gaowenjie/Desktop/AI学英语小程序/AI口语搭子/app'
npm install
npm start
```

打开 [本地调试页](http://127.0.0.1:8788)。没有 API Key 也能看界面、检查服务配置，以及用「检查麦克风」在本机录制并回放 3 秒声音。该检查不调用 AI。电脑浏览器页是辅助调试入口；微信小程序源码在 `miniprogram/`。

8788 是本项目端口；8787 已有其他服务，不要为了启动本项目而停止它。若 8788 也被占用，可在 `.env` 调整 `PORT`，同步修改小程序连接设置。

### 场景页面与两种通话画面

首页按双列卡片呈现六个场景，点进后查看角色和三条练习目标，再进入通话。浏览器支持本机收藏、分类筛选；「练习过」只在一次真实会话有用户转写时记录，不代表任务评分。小程序保留轻量卡片入口。浏览页面、场景详情和视觉预览都不调用模型。

通话支持「沉浸场景」与「极简语音球」。切换只改变画面，不重连、不重开会话。极简语音入口默认进入认识新朋友的日常场景；也可以在任意场景中切换到语音球。场景人物使用原创 3D 风格图像及轻微呼吸动效，目前不是带口型同步的实时 3D 模型。

角色档案统一维护在 `config/characters.json`，场景通过 `config/scenes.json` 的 `characterId` 引用角色。执行 `npm run sync:catalog` 自动生成网页与小程序目录及[人物档案](docs/角色档案.md)，`npm start` 也会自动同步；不要直接修改生成的 `public/scenes.js` / `miniprogram/utils/scenes.js`。后端提示词、图片与音色使用同一份配置。两端图集为 `assets/scenes-atlas.jpg`（1254×1254，3×2 等分，493,488 字节），原始 PNG 保存在 `.local/artwork/`。顺序：上排 daily / coffee / restaurant，下排 shopping / travel / hotel。

浏览器可以直接打开 `/?view=call&scene=coffee` 或 `/?view=voice-orb&scene=coffee` 比较两种模式，均不会自动开始付费通话。

### 语音动效

小程序与电脑页使用 [Rare UI](https://rareui.com) 的 [Fluid Orb](https://www.rareui.com/components/fluidorb)。保留其原始 WebGL 流体算法及 `#1A73F2` 蓝色，替换 React 生命周期以适配当前网页和小程序。待机流动与官网一致，聆听时跟随麦克风音量，思考时加快流动，说话时跟随实际播放的声音。打断会清除排队音频及对应动效；麦克风静音不会遮住搭子正在说话的动效。页面隐藏后暂停绘制。

无密钥时可在通话页点击「预览通话动效」（小程序为「预览界面」），查看明确标记的视觉预览；它不申请麦克风、不创建模型会话、不生成字幕，也不产生模型费用。浏览器遵循系统的“减少动态效果”，小程序提供「减少动效」开关；WebGL 不可用时显示静态渐变球。

渲染源码位于 `miniprogram/utils/voice-orb.js`。`npm start` / `npm run dev` 会自动将同一文件同步到网页目录；单独修改渲染器后也可运行 `npm run sync:orb`。小程序 WebGL 的手机效果应使用真机预览验收，开发者工具截图不能代表真机性能。

原组件 Copyright (c) 2026 Swami Malode，采用 MIT + Commons Clause License Condition v1.0 + Attribution。版权、完整许可证随渲染源码保留；本项目中作为应用功能使用，并非独立组件库。来源锁定在 [官方仓库 commit 1d572f4](https://github.com/swamimalode07/rare-ui/blob/1d572f4b1862f5f6b1be61bb33380fede433e1df/components/ui/fluid-orb.tsx)，上游文件 SHA256 为 `f5b13769f5e4e64b74bfc7ed7815b8b38e670fef5985b1a991a8ee6186b2be8a`。

## 2. 配置千问：只需要两项

1. 打开[阿里云百炼控制台](https://bailian.console.aliyun.com/)，切换到 **华北 2（北京）**。完成服务开通，确认账号可调用 `qwen3.8-omni-flash-realtime`。
2. 在 API Key 页面创建该地域的 Key，获取它所属的 **业务空间 ID**。注意这是空间的 ID，不是空间名称、Agent ID 或微信 AppID。Key 和空间必须对应，且空间有模型权限。参考[官方获取密钥说明](https://help.aliyun.com/zh/model-studio/get-api-key)。
3. 首次配置时将 `.env.example` 复制为 `.env`，然后用编辑器填写。已有 `.env` 时直接编辑，避免覆盖现有配置。

```sh
cp .env.example .env
chmod 600 .env
```

```dotenv
DASHSCOPE_API_KEY=在这里填北京地域的密钥
DASHSCOPE_WORKSPACE_ID=在这里填对应业务空间ID
```

4. 在运行服务的终端按 Ctrl+C，再执行 `npm start`。浏览器打开「连接设置 → 保存并重新检查连接」。显示已配置，仅代表检测到参数；真正的权限、余额及连通性会在首次通话中验证。
5. 点击「开始聊天」，允许麦克风，先说一句 **Hi!**。本版本由你先开口，服务端检测停顿后，千问开始回答。测试时先用耳机，避免外放声音被再次收录。

后端优先读取小写环境变量 `aliyun`，未填写时兼容 `DASHSCOPE_API_KEY`。Vercel 中已创建 `aliyun` 时不需要改名；变量值应为北京地域百炼 API Key。浏览器版新增了 WebRTC 握手接口，具体仓库根目录、业务空间与应用口令配置见 [Vercel 部署说明](docs/Vercel部署.md)。原静态部署需要改用仓库根目录重新部署，实际连通性仍需首次通话验证。

密钥只在本地 `.env` 或服务器环境变量中使用，不需要发到聊天里，也不要填入小程序代码、前端页面或项目配置。`.env`、`.local/` 均已加入忽略规则。修改提示词、费用阈值、密钥后，需要重启后端。

## 3. 在微信开发者工具中打开

导入这个目录：

```text
/Users/gaowenjie/Desktop/AI学英语小程序/AI口语搭子/app/miniprogram
```

1. 将项目设置中的 `touristappid` 换成你自己的小程序 AppID。暂未写入你的真实 AppID。
2. 本机开发者工具中，小程序「设置 → 服务地址」填 `http://127.0.0.1:8788`。
3. 在电脑浏览器的「连接设置」中，点击「复制小程序连接口令」，粘贴到小程序的「应用访问口令」。它是本项目生成的访问凭证，**不是百炼 API Key**。也可从本地 `.local/access-token` 文件取得；不要公开这个文件。
4. 小程序点击测试连接、保存设置。未配置千问时可以检查页面；配置完成后再开始练习。

小程序没有 npm 构建步骤。项目开启的跳过域名校验仅用于开发者工具本机调试。模拟器不能替代手机音频验收，特别是采样率、同录同播和回声。

## 4. 在手机上试用

手机里的 `127.0.0.1` 指向手机自己，不能填电脑的回环地址。真机联调需要一个手机可访问的 **HTTPS / WSS** 服务地址。可以把这个 Node 服务部署到自己的服务器，或使用你已有的可信 HTTPS 转发服务；当前没有替你发布到公网。

- `.env` 的 `PUBLIC_ORIGIN` 填对外完整地址，例如 `https://voice.example.com`，不要带路径。小程序服务地址填同一地址。
- 如果通过同机 Nginx 代理，可以保留 `HOST=127.0.0.1`、`PORT=8788`。代理需保留外部 Host、转发 WebSocket Upgrade，设置足够的连接超时。如果直接通过局域网测试，才按需要修改监听地址及 `PUBLIC_ORIGIN`；浏览器录音仍要求安全环境。
- 微信公众平台的 request 合法域名填 HTTPS 地址；socket 合法域名填对应 WSS 地址。
- 在微信后台补全隐私保护指引，声明录音用途及将声音发送给模型服务。小程序已实现微信隐私同意和麦克风授权流程。
- 先在真机用耳机测试：开口、停顿、自然插话、手动打断、静音、挂断、切后台、断网；再测外放。Android 和 iOS 分别检查。

反向代理示例（将示例域名换成自己的；证书配置按现有服务器管理方式处理）：

```nginx
location / {
    proxy_pass http://127.0.0.1:8788;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 660s;
}
```

初版访问口令是个人使用方式。公开发布给多人前，需要微信登录、按用户分配额度、限流、用量管理和正式隐私配置，不能把个人口令放进发布包供所有人共用。

## 5. 对话 Agent 在哪里

每个人物有独立的名字、性别、年龄、职业、背景、爱好、性格、声音和稳定 ID。当前六人分别使用 Serena / Evan / Aiden / Jennifer / Raymond / Mione 六种千问预设音色；以 [人物档案](docs/角色档案.md) 的映射为准。服务端按场景选定人物，将人设组装到 instructions，并将音色写入 `session.audio.output.voice`；客户端提交的 voice、character 或 instructions 不会覆盖它。旧 `.env` 即使保留 `QWEN_VOICE=Tina` 也不再影响角色音色。切换画面模式不会更换人物，换人物需开始新会话。

人物详情可查看基础资料、性格和声音方向，通话字幕及复制记录显示角色姓名。当前档案与声音匹配依据图片和官方音色描述，实际听感仍需逐个试听；没有新增声音克隆或跨会话记忆。


不依赖扣子。对话策略由 `server/prompt.mjs` 组装进千问 `session.update` 的 `instructions`：

- 认识新朋友、咖啡点单、街头餐车、商店购物、旅行问路、酒店入住六个场景，两档难度。
- 每次通常 1～2 句、10～30 个英文词，最多问一个问题，让你多说。
- 听不清就请你重说，允许中文求助，解释后鼓励再说一句英语。
- 默认温和提醒一个值得改进的表达；「先尽情聊」模式只在你主动求助时讲解。
- 不编造发音分数，不把表达风格差异说成语法错误，不声称保存学习记录。

提示词决定陪练风格，不能保证模型每次完全遵守。服务端另行强制校验场景、会话时长、音频速率和费用阈值；客户端不能上传任意系统提示词，也不能调用工具或联网搜索。初版没有自动课后报告或发音评分。

实时链路：

```text
小程序 RecorderManager：16 kHz / 单声道 / PCM16
  → 应用后端 WebSocket：验证短期票据、管理会话和费用
  → 千问 Realtime：语义 VAD 判断停顿、理解语音、生成声音
  → 后端转发 24 kHz PCM + 字幕
  → 小程序 WebAudio 连续播放
```

你再次开口时，服务端收到 `speech_started`，向千问发送 `response.cancel`，通知客户端停止排队播放，丢弃旧回复迟到的音频。`response.done` 用于结算，不等于手机已经播放完；客户端在播放完后单独上报。被打断但已经生成的内容仍可能收费。

千问公开协议未提供本实现可用的按已播放毫秒截断上下文能力，所以被打断的未播完内容可能仍在模型上下文中。这需要在真实对话中评估；当前没有使用未经文档确认的截断事件。

## 6. 费用与默认限制

界面费用来自模型每轮 `response.done.usage`，不会按通话秒数假装生成精确账单。当前按 `qwen3.8-omni-flash-realtime` 的文本输入 / 输出 **1.5 / 4.5 元每百万 Token**、音频输入 / 输出 **6 / 12 元每百万 Token** 估算；费率更新时应同步 `server/ledger.mjs`。参考[官方模型价格](https://help.aliyun.com/zh/model-studio/model-pricing)和[服务端用量事件](https://help.aliyun.com/zh/model-studio/server-events)。

| 参数 | 默认值 | 用途 |
| --- | --- | --- |
| `MAX_SESSION_SECONDS` | 600 秒 | 单次最多 10 分钟 |
| `MAX_IDLE_SECONDS` | 60 秒 | 持续无有效对话时结束 |
| `DAILY_BUDGET_YUAN` | 3 元 | 达到当天模型费用估算阈值时结束并禁止新通话 |
| `MONTHLY_BUDGET_YUAN` | 50 元 | 按中国时区自然月累计 |
| `VAD_SILENCE_MS` | 1400 毫秒 | 给英语停顿留一点空间 |
| `ENABLE_INPUT_TRANSCRIPTION` | true | 显示你的语音转写，可关闭 |

费用阈值在收到用量后检查，可能超出一轮；异常断线也可能拿不到完整用量。页面会将已知缺失标为「待核对」。阈值不是阿里云账单的硬封顶。长会话包含历史上下文计费；不要把一分钟单轮价格直接乘以通话时长。估算不包含可能单独结算的输入转写、服务器和网络费用，最终以百炼账单为准。先练几通短对话，再根据真实账单调整预算。

## 7. 数据与检查

本服务不落盘原始录音或字幕。字幕只存在当前会话内存；小程序录音结束后请求删除录音临时文件。你可以在网页主动复制当前字幕。模型供应商侧的数据处理按其服务规则执行。

`.local/usage.json` 只保存每轮 Token 数和费用，重启后累计仍在。请保留 `.local/`；删除它会重置本地账本及自动生成的应用口令。没有 Key 时不会建立模型连接。

以上服务端账本和费用阈值适用于 Node.js WebSocket 模式。Vercel WebRTC 模式的费用与日/月阈值仅在当前浏览器设备中估算和保存，清除数据、换设备或修改客户端会绕过这些限制；它不能代替供应商侧预算与账单。Vercel 模式没有服务端单会话锁，也不为微信小程序提供 WebSocket。详见部署说明。

```sh
npm test
```

测试包括后端真实 HTTP/WebSocket 链路上的本地假模型服务，以及小程序的音频边界、状态和权限逻辑；不会调用真实千问或产生模型费用。测试通过不代表真实模型权限、手机音频效果或最终账单已经验收。

代码结构：`server/` 为后端与提示词；`miniprogram/` 为微信客户端；`public/` 为电脑调试页；`test/` 与 `miniprogram/tests/` 为测试。

接口适配依据：[千问实时对话](https://help.aliyun.com/zh/model-studio/realtime)、[客户端事件](https://help.aliyun.com/zh/model-studio/client-events)、[微信小程序说明](miniprogram/README.md)。

### 场景界面验证（2026-10-02）

`npm test` 包含六场景到上游的角色映射、两端场景目录一致性，以及小程序浏览/预览不创建会话、返回取消启动、切换视觉不重连等用例。浏览器另外运行 `test/browser-check.mjs`、`test/orb-check.mjs`、`test/scenes-browser-check.mjs`；需通过 `PLAYWRIGHT_MODULE` 指向本机安装的 Playwright。三个脚本只使用本地假模型和假麦克风。微信开发工具中的编译和界面检查记录在 `.local/verification/scenes-wechat-report.json`，仍需配置千问后做真实手机音频验收。
