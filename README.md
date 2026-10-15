# Dragonlee

Dragonlee 的独立作品集，包含 Work、About、简历入口、项目连续浏览和视频演示。运行时、字体、图片和视频均由本站本地提供。

本地预览：http://127.0.0.1:4174/

活动源码目录为 `dragonlee-portfolio/`。先运行 `npm run build`，再运行 `npm run preview:persistent`；日志及 PID 位于 `.preview/`。项目保留当前作品及交互，用户要求快速修改，已完成内容无需重复浏览器验收。

## 内容与资源

- `index.html`：Dragonlee 页面元数据、字体预加载及根节点。
- `src/main.jsx`：加载已有应用，由该应用挂载 React。
- `public/assets/`：本地运行时、样式、字体和作品媒体。
- `content/content-data.json`、`content/editable-content.json`：可读项目、首页条目及文字。
- `content/user-media.json`：用户素材来源、播放版本、尺寸及校验信息。
- `content/capture-manifest.json`：2026-10-15 统一品牌后建立的当前资源基线。
- `content/runtime-overrides.json`：基线之后的运行时替换记录。

旧来源记录、历史替换日志和已移除参考作品保留在工作区 `evidence/branding-migration-20261015/`，不作为当前网站内容提供。较早的 `portfolio-prototype/` 保持完整。

## Sites

站点已注册，尚未上线；用户已于 2026-10-15 恢复发布。保留 `.openai/hosting.json` 中同一个项目 ID、访问权限及首次上传进度。此目录的 `scripts/prepare-sites-checkout.mjs` 可刷新本地 `../sites/dragonlee-portfolio/` 源码镜像，不能从镜像自身运行。

Sites 原生归档上传目前失败，既有项目、源码历史和恢复记录继续保留。恢复上传前读取 `../sites/dragonlee-upload-progress.json`，保留已验证的 Git 祖先关系和分批上传计划；不要发布未完成的恢复归档，也不要创建替代站点。

`npm run build` 生成预览及 Sites 包装文件；`npm run test:sites` 用于发布前检查；`npm run verify:assets` 核对当前资源基线及之后的明确替换。

## GitHub 与 Cloudflare

当前发布方式为公开的 [`liyunlong625188-sys/dragonlee-portfolio`](https://github.com/liyunlong625188-sys/dragonlee-portfolio) 仓库连接 Cloudflare Workers Builds。在 Cloudflare 连接同一仓库的 `main` 分支，根目录选择仓库根目录，构建命令使用 `npm run build:cloudflare`，部署命令使用 `npm run deploy:cloudflare`。GitHub Pages 自动部署工作流已移除。

`wrangler.jsonc` 固定 Cloudflare 账号 `31990bc162ad9fdbb0a772be37790419` 和 Worker 名称 `dragonlee-portfolio`。`npm ci` 后运行 `npm run build:cloudflare`，生成 `dist/server/index.js` 和 `dist/client/`；部署时通过 `ASSETS` 绑定交给 Worker 处理原始图片地址及视频范围请求。`npm run deploy:cloudflare` 固定使用 Wrangler 4.151.0。构建后运行 `npm run test:sites` 和 `npm run verify:assets` 验证源码与资源。

本地构建请在 `/private/tmp` 的隔离副本执行，避免 Documents 目录出现重复文件。先用 `scripts/prepare-sites-checkout.mjs` 刷新 `../sites/dragonlee-portfolio/`，再从新镜像导出 GitHub 源码。依赖、构建输出、预览日志及临时副本不纳入 GitHub 仓库；Sites 项目 ID、历史和 Cloudflare 准备记录继续保留。GitHub 使用官方 CLI 浏览器授权及系统钥匙串，Cloudflare 使用已连接账号；不记录凭据，连接源码期间不修改域名注册、续费或 DNS。

`npm run build:github` 保留为可选的纯静态兼容构建，默认输出 `dist/github/` 并使用 `/dragonlee-portfolio/` 路径；可通过 `GITHUB_PAGES_BASE_PATH`、`GITHUB_PAGES_URL` 覆盖。该命令不再负责当前网站发布，原始媒体和端口 4174 的预览保持不变。

2026-10-15：精选新增 Customize Air Jordan Web、Volog、Video Editing 三个 Dribbble 项目，保留六张原图并穿插在现有 Work 中。Video Editing 与其 UI Kit 合并为一个项目；Volog 的重复封面附图不重复展示。新项目详情顺序与 Work 保持一致，出处和年份状态见 `content/dribbble-selection.json`。

2026-10-15：新增 Alibaba Design（id67），位于 Alibaba 公司卡片之后。按 1.png–11.png 顺序展示十一张 1920 × 1080 原图，封面使用原始标题页，并在正方形卡片中保留 16:9 内容与黑色留白。年份待用户补充。

2026-10-15：Resume 入口改为用户提供的 Dragonlee-site-latest 3 网站，继续通过 `/resume.html` 在新标签页打开。保留内嵌动态效果、章节定位和完整长页面；页面图片及原 PDF 均复制到本地 `public/resume-site/assets/`。原单图简历页记录保存在工作区 `evidence/resume-website-20261015/before/`。

2026-10-15：新增 AI Full Stack Design Methodology（id68），年份按用户文件夹标注为 2026，位于 Work 第五位。51 张 1920 × 1080 原图按 1.png–51.png 顺序展示；封面复用首图，在正方形卡片中保留原始 16:9 内容及黑色留白。详情导航与 Work 顺序同步。

2026-10-15：新增 Other Work（id69），放在 Work 末尾。七张 1920 × 1080 原图按 1.png–7.png 顺序展示，封面复用首图。用户明确要求该项目不写时间：Work、详情与可读内容中的年份均保持空值，不再询问该项目年份。

2026-10-15：新增 Momcozy Probation Plan（id70），年份 2026，位于 AI 方法论之后。Work 与详情复用包内 Momcozy 海报和 App 3.0 标题页，详情提供 Open interactive plan 新标签页入口。完整 H5 位于 `public/projects/momcozy-work-plan/index.html`，保留本地字体、交互与 341 帧序列；参考人物 OG 图已离线归档，当前分享图使用 Momcozy 素材。
