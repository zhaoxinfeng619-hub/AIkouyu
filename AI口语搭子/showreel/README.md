# AI口语搭子 · 30 秒产品展示片

成片为 `video.mp4`，1920×1080 / 30fps / 900 帧，含原创电子配乐。打开 `preview.html` 或直接播放视频。片中对白是脚本演示，不是已接通的真实云端通话录像。

影片沿一条产品任务链展开：选咖啡场景 → 认识 Alex → 开口点单 → 回答冷热 → 自然插话 → 切换语音球 → 复制记录 → 回到生活场景集合。同一 Alex 卡与同一字幕载体跨段延续，七处交接保留八帧重叠；阅读结果有四处明确登记的短窗口。

## 可编辑工程

需要 Node.js 22+、Chrome、Python 3 与 NumPy。依赖固定在 lockfile，不依赖外部视频服务。

```sh
npm ci
npm run studio
```

主画面在 `src/ProductShowreel.tsx`，运动坐标在 `src/motion.ts`，真实项目人物图在 `public/`。导演与参考说明在 `frame-motion-description.md`、`reference-analysis-plan.md`、`reference-application-plan.md`。产品范围和演示边界在 `product-facts.json`。

完整导出：

```sh
npx remotion render src/index.tsx ProductShowreel silent-preview.mp4 --codec h264 --crf 19 --scale 1.5 --concurrency 4 --muted
python3 scripts/make-audio.py
node scripts/finalize-audio.mjs
```

`MotionAudit` composition 关闭背景色场，用于检查产品动作。`npm run stills` 导出六个主关键帧、结束帧与七组五帧交接证据；`product-motion-map.json` 登记 17 项动作，`handoff-map.json` 登记交接对象和状态。验证记录见 `verification-report.json`。这些工程检查不等于真实 AI 连接或微信真机音频验收。

修改坐标后运行 `node scripts/make-plans.mjs` 同步动作表和导演方案。运行 `python3 scripts/make-contact-sheets.py` 合成关键帧与交接联系表（需要 Pillow）。

## 参考例外与署名

按用户确认，使用 skill 包已有案例图继续制作。包内没有指定的 72 张参考联系表，因此没有声称分析 1800 张参考帧，也没有宣称逐条达到原始参考视频的完整硬门槛。阅读收据与文件哈希保存在 `skill-read-receipt.json`。

语音球采用真实产品中的 [Rare UI Fluid Orb](https://www.rareui.com/components/fluidorb) 流体算法。Copyright (c) 2026 Swami Malode，MIT + Commons Clause License Condition v1.0 + Attribution；完整许可证保留在 `src/voice-orb.js`。人物图来自本项目现有原创角色资产；配乐由 `scripts/make-audio.py` 原创合成，不包含第三方歌曲。

成片、证据帧和本地渲染缓存不进入 Git；交付包包含成片、证据和可编辑源码，不包含依赖、密钥或用户录音。
