# 阶段反省评分表（完整版）

一款面向 iPhone 的本地优先 PWA。内置 7 个方向、22 个任务，满分 220 分。按 0、3、6、10 四档评分，按钮直接展示对应标准；“～”保留为待细化、自主评分。自动计算得分率、连续打卡和长期趋势。

升级时自动归档旧项目并保留历史日期的原项目清单、评分和备注。新日期使用新版阶段表；已有记录继续使用当时清单。自媒体拍摄按近期发布频率自评，重叠区间按原表展示，由用户选择。

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
