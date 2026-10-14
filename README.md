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

站点已注册，尚未上线；发布按用户指示暂停。保留 `.openai/hosting.json` 中同一个项目 ID、访问权限及首次上传进度。此目录的 `scripts/prepare-sites-checkout.mjs` 可刷新本地 `../sites/dragonlee-portfolio/` 源码镜像，不能从镜像自身运行。

只有用户明确恢复发布后，才可使用 Sites 工作流上传、推送、保存版本和部署。恢复前读取 `../sites/dragonlee-upload-progress.json`，保留已验证的 Git 祖先关系和分批上传计划；不要发布未完成的恢复归档，也不要创建替代站点。

`npm run build` 生成预览及 Sites 包装文件；`npm run test:sites` 用于发布前检查；`npm run verify:assets` 核对当前资源基线及之后的明确替换。

2026-10-15：精选新增 Customize Air Jordan Web、Volog、Video Editing 三个 Dribbble 项目，保留六张原图并穿插在现有 Work 中。Video Editing 与其 UI Kit 合并为一个项目；Volog 的重复封面附图不重复展示。新项目详情顺序与 Work 保持一致，出处和年份状态见 `content/dribbble-selection.json`。

2026-10-15：新增 Alibaba Design（id67），位于 Alibaba 公司卡片之后。按 1.png–11.png 顺序展示十一张 1920 × 1080 原图，封面使用原始标题页，并在正方形卡片中保留 16:9 内容与黑色留白。年份待用户补充。

2026-10-15：Resume 入口改为用户提供的 Dragonlee-site-latest 3 网站，继续通过 `/resume.html` 在新标签页打开。保留内嵌动态效果、章节定位和完整长页面；页面图片及原 PDF 均复制到本地 `public/resume-site/assets/`。原单图简历页记录保存在工作区 `evidence/resume-website-20261015/before/`。

2026-10-15：新增 AI Full Stack Design Methodology（id68），年份按用户文件夹标注为 2026，位于 Work 第五位。51 张 1920 × 1080 原图按 1.png–51.png 顺序展示；封面复用首图，在正方形卡片中保留原始 16:9 内容及黑色留白。详情导航与 Work 顺序同步。

2026-10-15：新增 Other Work（id69），放在 Work 末尾。七张 1920 × 1080 原图按 1.png–7.png 顺序展示，封面复用首图。用户明确要求该项目不写时间：Work、详情与可读内容中的年份均保持空值，不再询问该项目年份。

2026-10-15：新增 Momcozy Probation Plan（id70），年份 2026，位于 AI 方法论之后。Work 与详情复用包内 Momcozy 海报和 App 3.0 标题页，详情提供 Open interactive plan 新标签页入口。完整 H5 位于 `public/projects/momcozy-work-plan/index.html`，保留本地字体、交互与 341 帧序列；参考人物 OG 图已离线归档，当前分享图使用 Momcozy 素材。
