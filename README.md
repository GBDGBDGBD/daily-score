# 每日评分

一款面向 iPhone 的本地优先 PWA。每天为自定义事项打 0～10 分，自动计算得分率、连续打卡和长期趋势。

## 数据原则

- 打卡项目、评分和备注只保存在当前设备的 IndexedDB 中。
- Service Worker 缓存应用资源，断网后仍可使用。
- 用户可主动导出完整 JSON，并通过系统分享面板保存到 iCloud Drive。
- 应用没有账号、云数据库、广告、第三方统计或行为追踪。

## 本地运行

需要 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

## 验证

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run build:pages
```

## Cloudflare Pages

该应用不依赖服务端，`npm run build:pages` 会生成可直接部署到 Cloudflare
Pages 的静态文件。

- 框架预设：`Next.js (Static HTML Export)`
- 构建命令：`npm run build:pages`
- 构建输出目录：`out`
- 生产分支：`main`

Cloudflare Pages 会自动提供 `CF_PAGES_URL`，用于生成社交分享图片的完整地址。
如绑定自定义域名，可额外设置 `NEXT_PUBLIC_SITE_URL` 为正式网址。

首次在 iPhone 上使用时，请先用 Safari 打开网址，选择“分享 → 添加到主屏幕”，再从桌面图标启动并创建正式数据。建议至少每 7 天备份一次。
