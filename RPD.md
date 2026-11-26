# 做饭吧（AICAIPU）项目全解 RPD

> 版本：v1.0 · 整理日期：2026-11-24 · 对应提交：`36d4f2f feat: 修复无法启动问题`
> 仓库：Gitee <https://gitee.com/yueluoshangmu/recipe.git> ｜ GitHub <https://github.com/BliangCen163/Recipe.git>
> 说明：本文档面向「接手 / 答辩 / 云环境重建」三种场景，覆盖项目定位、架构、页面、组件、云函数、数据库、云存储、AI 双链路、配置、部署与已知问题。文内只出现环境变量名，不记录任何真实密钥。

---

## 目录

1. [一页速览](#1-一页速览)
2. [项目定位与核心功能](#2-项目定位与核心功能)
3. [技术栈与整体架构](#3-技术栈与整体架构)
4. [目录结构](#4-目录结构)
5. [页面与路由（15 个页面）](#5-页面与路由15-个页面)
6. [组件与公共模块](#6-组件与公共模块)
7. [云函数详解（14 个）](#7-云函数详解14-个)
8. [数据库设计（8 个集合）](#8-数据库设计8-个集合)
9. [云存储目录](#9-云存储目录)
10. [AI 双链路与任务队列](#10-ai-双链路与任务队列)
11. [配置与环境变量](#11-配置与环境变量)
12. [从零重建 / 部署清单](#12-从零重建--部署清单)
13. [本地开发与联调](#13-本地开发与联调)
14. [数据流速查表](#14-数据流速查表)
15. [已知问题与注意事项](#15-已知问题与注意事项)
16. [维护与扩展建议](#16-维护与扩展建议)
- [附录 A：云函数速查表](#附录-a云函数速查表)
- [附录 B：ai_tasks 字段说明](#附录-bai_tasks-字段说明)
- [附录 C：术语表](#附录-c术语表)

---

## 1. 一页速览

| 项目 | 内容 |
| --- | --- |
| 产品名 | 做饭吧（manifest：AICAIPU） |
| 形态 | 微信小程序（uni-app 编译到 mp-weixin） |
| 技术栈 | uni-app + Vue 3 `<script setup>` + SCSS + 微信云开发（云函数 / 云数据库 / 云存储）+ 本地 Node Worker |
| 小程序 AppID | `wx157c7f6703ae420c`（manifest.json 与 project.config.json） |
| uni-app AppID | `__UNI__7FC01A9` |
| 云环境 | 代码中为 `cloud1-d6gdxrlf5bcb4e41c`；另有一个已释放的旧环境（环境 ID 不在文档中记录，见 §15） |
| 页面数量 | 13（3 个 tabBar + 10 个功能页） |
| 云函数数量 | 14 |
| 数据库集合 | 5：`users`、`menu`、`recipes`、`ai_tasks`、`original_recipes` |
| 云存储目录 | 2：`avatars/`、`original-recipes/` |
| AI 能力 | ① 同步问答：`aiAssistant` 云函数直连 CloudBase AI 网关；② 异步生成：`ai_tasks` 队列 + 本地 `ai-worker` 执行器 |
| 种子数据 | `menu.json`：61.7 MB / 32,055 行，JSON Lines，每行一条菜谱文档 |
| 当前状态 | 云开发资源已于 2026 年上半年过期释放，需按 §12 重建环境后才能完整运行 |

---

## 2. 项目定位与核心功能

「做饭吧」是一个**面向零基础下厨者的 AI 辅助做菜工具**。它不追求社区，而是把「今天做什么、怎么做、缺什么」三件事用 AI 串起来。

### 2.1 六个核心能力

| 能力 | 入口页面 | 说明 |
| --- | --- | --- |
| 找菜谱 | `pages/index/index` → `pages/recipe-list/index` | 浏览内置 3 万+ 菜谱库，按菜系 / 地域 / 类型 / 场景四种维度分类筛选 |
| 搜索 | `pages/index/search` | 关键词搜索，优先走 `search` 云函数，失败时前端本地兜底 |
| 剩菜匹配 | `pages/fridge/index` | 勾选或手输现有食材，让 AI 生成「现在就能做」的菜 |
| 宴客菜单 | `pages/meal-planner/index` → `pages/meal-plan-result/index` | 输入人数、菜数、菜系、忌口、主食材，AI 一次生成一整桌菜 |
| 后厨问答 | `pages/ai-chat/index` | 聊天式「后厨领班」，回答盐放多、油温判断、肉炒老等突发问题 |
| 个人内容 | `pages/user/*` | 收藏、浏览历史、采购单、自创菜谱与发布 |

### 2.2 体验设计约定

- **纯静默登录**：不弹手机号授权。`App.vue` 启动时 `wx.cloud.init` 后调用 `login` 云函数，用 `OPENID` 作为用户唯一标识。
- **视觉风格**：参照「下厨房+」。主色 `#FA6650`（番茄红），页面底色 `#F7F8FA`，卡片纯白，大圆角 `16rpx`，靠阴影与留白分隔内容。
- **量化食材**：AI 生成的菜谱要求食材必须带用量，避免「少许 / 适量」。
- **步骤计时**：`steps[].timerMinute > 0` 时详情页出现「开始倒计时」，启动后可「暂停/继续」或「取消计时」，结束震动提醒。

---

## 3. 技术栈与整体架构

### 3.1 技术栈分层

| 层 | 选型 | 职责 |
| --- | --- | --- |
| 视图层 | uni-app + Vue 3 Composition API | 15 个页面、组件、交互与状态 |
| 状态层 | 轻量 `reactive` store（`stores/user.js`） | 登录态、昵称头像 |
| 工具层 | `utils/recipes.js`、`utils/ai-task.js` | 菜谱分类归一化、AI 任务创建与轮询 |
| 云函数层 | 微信云开发 14 个 Node.js 函数（`wx-server-sdk`） | 登录、CRUD、搜索、任务入队、AI 问答 |
| 数据层 | 云数据库 8 集合 + 云存储 3 目录 | 业务数据与图片 |
| 执行层 | 本地 `ai-worker`（Node + `@cloudbase/node-sdk`） | 轮询 `ai_tasks`，调用大模型，写回 `recipes` |
| 模型层 | CloudBase AI 网关（混元） | 唯一推理出口，云端统一调用 |

### 3.2 架构图

```
┌────────────────── 微信小程序（uni-app 编译产物） ──────────────────┐
│  pages/*.vue  ──►  stores/user.js  ──►  utils/recipes.js          │
│        │                │                utils/ai-task.js          │
│        │                └── wx.cloud.database() 直读 menu/recipes  │
│        └── wx.cloud.callFunction() ─────────────────────────────┐  │
└─────────────────────────────────────────────────────────────────┼──┘
                                                                  ▼
┌────────────────── 微信云开发 ─────────────────────────────────────────┐
│  云函数 ×13  ──►  云数据库：users / menu / recipes / ai_tasks /        │
│                   original_recipes                                  │
│             └──►  云存储：ingredients / avatars / original-recipes    │
│                                                                     │
│  aiAssistant ──HTTPS──► CloudBase AI 网关（同步问答）                  │
└─────────────────────────────────────────────────────────────────────┘
                                                                  ▲
                                    poll ai_tasks (3s)            │
┌────────────────── 本地 ai-worker（Node 进程） ────────────────────┘
│  取 pending 任务 → 置 processing → 调模型 → 解析 JSON                │
│  → 写 recipes → 回填 ai_tasks.result / resultRefs / status          │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.3 为什么是「云函数 + 本地 Worker」而不是纯云函数

- 云函数单次执行时长有限（默认 3～20 秒可调），大模型生成一桌菜经常超过 60 秒，容易超时。
- 把「调用大模型」拆成异步任务：小程序只负责**入队 + 轮询**，真正的长耗时推理放在可长时间运行的本地 Node 进程里。
- 好处：前端不卡、可重试、模型出口统一、任务结果可回溯。
- 代价：`ai-worker` 必须常开，电脑关机或进程挂掉时任务会停在 `pending`。

---

## 4. 目录结构

```
aicaipu/                        ← 真正的源码根目录（外层 Recipe/ 只是容器）
├─ pages/                      页面
│  ├─ index/
│  │  ├─ index.vue             首页（找菜 + 精选 + 入口卡片）
│  │  └─ search.vue            搜索页
│  ├─ recipe-list/index.vue    分类浏览（四种分类模式 + 快捷筛选）
│  ├─ recipe-detail/index.vue  菜谱详情（展示 / AI 生成 / 收藏 / 计时器）
│  ├─ fridge/index.vue         冰箱食材匹配
│  ├─ ai-chat/index.vue        AI 后厨问答
│  ├─ meal-planner/index.vue   宴客菜单表单
│  ├─ meal-plan-result/index.vue 套餐结果 + 一键加采购单
│  ├─ shopping-list/index.vue  采购清单
│  ├─ recipe-favorites/
│  │  └─ recipe-favorites.vue  菜谱收藏（收藏列表 / 取消收藏 / 下拉刷新）
│  ├─ user/
│  │  ├─ index.vue             我的（资料 / 快捷入口）
│  │  ├─ history/index.vue     浏览历史
│  │  ├─ personal_recipese.vue 个人菜谱列表（注意原文件名拼写）
│  │  └─ original_recipes.vue  自创菜谱创建 / 编辑
│  └─ components/
│     ├─ RecipeCard.vue        菜谱卡片（实际使用的版本）
│     └─ StepCard.vue          步骤卡片
├─ components/
│  ├─ RecipeCard.vue           旧版卡片（遗留，未被页面引用）
│  └─ code/
│     ├─ recipe-detail-toggleFavorite.js  收藏封装
│     └─ search.js                        本地搜索兜底
├─ cloudfunctions/             14 个云函数（见 §7）
├─ ai-worker/                  本地 AI 任务执行器
│  ├─ index.js                 主进程（轮询 / 提示词 / 解析 / 写回）
│  ├─ package.json             start = node index.js
│  ├─ package-lock.json
│  ├─ README.md                环境变量与启动说明
│  └─ .env                     本地密钥（已 gitignore，不得提交）
├─ static/                     logo 与 tabBar 图标（7 个 png）
├─ stores/user.js              全局用户状态
├─ utils/
│  ├─ recipes.js               菜谱分类 / 归一化 / 关键词匹配（537 行）
│  └─ ai-task.js               createAiTask / getAiTaskStatus / waitForAiTask
├─ App.vue                     应用入口：云初始化 + 静默登录
├─ main.js                     Vue3 createSSRApp 入口
├─ pages.json                  14 页面 + tabBar + 全局样式
├─ manifest.json               App 信息、mp-weixin 配置、cloudfunctionRoot
├─ uni.scss                    SCSS 设计变量
├─ uni.promisify.adaptor.js    uni API Promise 化
├─ index.html                  H5 端模板（小程序编译不用）
├─ project.config.json         小程序项目配置（cloudfunctionRoot / miniprogramRoot）
├─ project.private.config.json 开发者工具私有配置（含 libVersion）
├─ menu.json                   菜谱种子数据，61.7 MB，JSON Lines
├─ AGENTS.md                   仓库协作约定
├─ test26_10_15.md             答辩问答准备稿
└─ unpackage/                  编译产物（git 忽略）
   └─ dist/dev/mp-weixin/      微信开发者工具实际加载的小程序代码
```

---

## 5. 页面与路由（15 个页面）

### 5.0 总览

| # | 路由 | 标题 | 一句话作用 | 主要云函数 | 直接读集合 |
| --- | --- | --- | --- | --- | --- |
| 1 | `pages/index/index` | 做饭吧 | 首页：搜索、精选菜谱、功能入口 | — | `menu` |
| 2 | `pages/ai-chat/index` | AI 聊菜 | 后厨问答聊天 | `aiAssistant` | — |
| 3 | `pages/user/index` | 我的 | 资料展示、快捷入口 | `login` | `users` |
| 4 | `pages/index/search` | 搜索 | 关键词搜索 + 分页 | `search`（失败走本地兜底） | `menu`（兜底时） |
| 5 | `pages/fridge/index` | 冰箱 | 选食材 → AI 生成菜谱 | `createAiTask`、`getAiTaskStatus` | — |
| 6 | `pages/recipe-list/index` | 菜谱分类 | 四种维度分类浏览 | — | `menu` |
| 7 | `pages/recipe-detail/index` | 菜谱详情 | 展示 / AI 生成 / 收藏 / 计时 | `createAiTask`、`getAiTaskStatus`、`toggleFavorite`、`recordViewHistory` | `menu`、`recipes`、`original_recipes`、`users` |
| 8 | `pages/meal-planner/index` | 宴客菜单 | 填人数 / 菜数 / 偏好 | — | — |
| 9 | `pages/meal-plan-result/index` | 套餐方案 | 生成整桌菜单并加采购单 | `createAiTask`、`getAiTaskStatus`、`manageShoppingList` | `recipes` |
| 10 | `pages/shopping-list/index` | 采购单 | 按菜谱分组、勾选已购、删单条、清空、复制清单 | `manageShoppingList` | `shopping_items` |
| 11 | `pages/user/history/index` | 浏览历史 | 查看 / 单删 / 清空 | `getViewHistory`、`clearViewHistory` | — |
| 12 | `pages/user/personal_recipese` | 个人菜谱 | 自创菜谱列表 / 发布 / 下架 / 删除 | `manageOriginalRecipe` | `original_recipes` |
| 13 | `pages/user/original_recipes` | 自创菜谱 | 创建 / 编辑自创菜谱 | `createOriginalRecipe` | `original_recipes`（编辑时读） |
| 14 | `pages/recipe-favorites/recipe-favorites` | 菜谱收藏 | 收藏列表（分页）、取消收藏、下拉刷新 | `getFavorites`、`toggleFavorite` | —（全部经云函数读取） |
| 15 | `pages/user/profile/index` | 编辑资料 | 头像 / 昵称 / 登录状态 | `updateUserProfile` | `users` |

### 5.1 首页 `pages/index/index.vue`

- **结构**：顶部搜索条 → 两张功能 banner（冰箱匹配 / 宴客菜单）→ 精选菜谱（按菜系各取一道）→「更多」进入分类页。
- **数据**：直接 `wx.cloud.database().collection('menu')` 读取，`field` 只取 `_id,id,title,cover,tags,author,category,categories,cuisine`，减少流量。
- **常量**：`PAGE_SIZE = 20`、`MAX_BATCHES = 12`、`HOME_CUISINE_COUNT = 12`——最多翻 12 批，每种菜系取 1 道，凑出 12 道精选。
- **跳转**：搜索 → `/pages/index/search`；banner → `/pages/fridge/index`、`/pages/meal-planner/index`；更多 → `/pages/recipe-list/index`。
- **卡片**：使用 `pages/components/RecipeCard.vue`，`source="menu"`。

### 5.2 搜索 `pages/index/search.vue`

- 输入关键词后调用云函数 `search`，入参 `{ keyword, page }`。
- 云函数返回 `{ success, data, total, page, pageSize }`，`PAGE_SIZE = 16`，前端按 `totalPages` 翻页。
- **兜底**：云函数调用异常时调用 `components/code/search.js` 的 `searchRecipes(keyword)`——一次性拉取整个 `menu` 集合在前端过滤（标题包含、空格分词、长度 ≥ 2 时允许 1 个字符差异）。数据量大时会明显变慢，属于应急方案。

### 5.3 分类浏览 `pages/recipe-list/index.vue`

- **四种分类模式**（`RECIPE_CLASSIFICATION_MODES`）：按菜系 `cuisine`、按地域 `region`、按类型 `type`、按场景 `scene`。
- 左侧分类导航带数量统计，右侧列表；顶部还有 8 个快捷筛选：全部 / 家常 / 快手 / 早餐 / 聚餐 / 小吃 / 汤羹 / 甜品。
- 支持关键词过滤（`matchesRecipeKeyword`），`PAGE_SIZE = 20`，每个分类最多展示 50 道。
- **依赖字段**：`type` 与 `scene` 模式依赖 `dishCategory` / `sceneCategory`；若导入的 `menu.json` 较旧，这两个模式会提示「需要重新导入菜单数据」。

### 5.4 菜谱详情 `pages/recipe-detail/index.vue`（核心页）

进入方式决定数据来源：

| URL 参数 | 行为 |
| --- | --- |
| `?recipeId=xxx&source=menu` | 从 `menu` 读取（公共菜谱库） |
| `?recipeId=xxx&source=original_recipes` | 从 `original_recipes` 读取（自创菜谱，不显示收藏按钮） |
| `?recipeId=xxx` | 从 `recipes` 读取（AI 生成或用户收藏副本） |
| `?ingredients=[...]` | **不带 recipeId**：走 AI 生成流程 |

AI 生成流程（`fetchRecipe`）：

1. `createAiTask('recipe', { ingredients })`。
2. `waitForAiTask(taskId)` 轮询，回调里根据 `pending / processing` 更新文案（「排队中」「CloudBase AI 正在生成」）。
3. 成功后从 `finalTask.resultRefs.recipeId` 取菜谱 ID，再 `loadFromDB` 读 `recipes`。
4. 页面卸载时 `isPageDisposed = true`，停止轮询（抛 `TASK_POLL_ABORTED`）。

其他能力：

- **收藏**：`toggleFavoriteRecipe(recipe, recipeKind)`，`recipeKind` 为 `menu` / `original` / `recipe`。云函数在 `favorites` 里写一条 `{ recipeId, recipeKind, snapshot }`（文档 id 固定为 `${openid}_${recipeId}`，天然去重），不再往 `recipes` 复制副本；红心状态由 `getFavorites({ recipeId })` 查询。
- **计时器**：每个带 `timerMinute` 的步骤可独立倒计时；启动后按钮换成「暂停/继续 + 取消计时」，暂停保留剩余时间，取消清空状态回到「开始倒计时」，结束 `uni.vibrateLong()` + 弹窗。
- **浏览历史**：加载完成后调用 `recordViewHistory`，传 `{ recipe: { recipeId, title, cover, recipeKind } }`；同一菜谱只保留一条（文档 id 固定）并置顶，超过 100 条裁掉最旧的。
- **加采购单**：食材区支持「份数」减/加（1–10，`scaleAmountText` 按比例缩放数字+单位，`适量/少许` 原样保留）；每个食材前有勾选圈，底部「一键加入全部食材」或「加入已选 N 项」→ `manageShoppingList(append)`，入参 `{ recipeId, recipeTitle, servings, ingredients }`；成功后弹自定义轻提示「已加入采购单」并提供「去采购单 ›」跳转（4 秒自动消失）。

### 5.5 冰箱匹配 `pages/fridge/index.vue`

- 食材按四组展示：肉类蛋白 / 蔬菜菌菇 / 主食碳水 / 调味基础，支持自定义输入。
- 四个快捷搭配：家常小炒、清淡汤羹、下饭硬菜、一人食。
- 该页只做手动选食材，拍照识图已下线。
- 「开始 AI 智能匹配」把食材数组 `JSON.stringify` 后 `encodeURIComponent`，跳到 `/pages/recipe-detail/index?ingredients=...`。

### 5.6 AI 问答 `pages/ai-chat/index.vue`

- 聊天气泡流，4 个快捷问题（盐放多了 / 判断油温 / 肉炒老了 / 去鱼腥味）。
- 每次发送把**完整历史** `messages` 传给 `aiAssistant`，返回 `result.data.reply`。
- 失败时以固定文案兜底（「领班暂时开小差了」/「网络似乎不太好」）。

### 5.7 宴客菜单 `pages/meal-planner/index.vue` → `pages/meal-plan-result/index.vue`

表单页：

- 人数 1–10，菜数 1–8（`clamp` 限制）。
- 菜系：川菜 / 粤菜 / 湘菜 / 鲁菜 / 江浙菜 / 家常菜（单选）。
- 口味：清淡 / 不吃辣 / 低脂 / 下饭 / 老人小孩都能吃 / 海鲜过敏（多选）+ 自定义输入。
- 主打食材：鸡肉 / 牛肉 / 猪肉 / 鸡蛋 / 豆腐 / 虾仁 / 西红柿 / 土豆（多选）+ 自定义输入。
- 提交时把参数拼成 query 跳到结果页。

结果页：

- `createAiTask('meal_plan', { diners, dishCount, cuisine, preferences, availableIngredients })`。
- 轮询成功后从 `resultRefs.recipeIds` 批量读 `recipes`，用 `RecipeCard` 渲染。
- 「一键将全部食材加入采购单」把每道菜的食材摊平（`name/amount/recipeTitle`）后调 `manageShoppingList` 的 `append`。

### 5.8 采购单 `pages/shopping-list/index.vue`

- `onShow` 调 `manageShoppingList` 的 `get`（`shopping_items` 集合，取 200 条，按 `createdAt` 升序）。
- 列表按 `recipeTitle` 分组（缺失时回退 `sources[0]`，再回退「其他食材」），组头显示菜名与「已购/总数」。
- 每行：勾选圈切换 `checked`（已勾选整行置灰+删除线，乐观更新、失败回滚；`pendingIds` 防重复点击）；右侧 `✕` 删除单条（二次确认 → `remove` → 本地过滤）。
- 底部两个按钮：「清空全部」二次确认后调 `clear`（删该用户所有 `shopping_items`）；「一键复制清单」用 `uni.setClipboardData` 复制按组拼好的纯文本（`☐ / ☑ 名称 数量`，末尾附总数与待购数）。
- 空态文案：「你还没有加入任何食材 / 去菜谱页挑选吧」+「去挑菜谱」按钮（`switchTab` 回首页）。

### 5.9 我的 `pages/user/index.vue`

- 资料区**只读**：展示头像、昵称与登录状态；「编辑资料 ›」进入 `pages/user/profile/index.vue`（见 §5.14）修改。
- AI 后端切换已下线，模型固定走 CloudBase AI 网关。
- 快捷入口：菜谱收藏、采购单、个人菜谱、浏览历史。
- 收藏列表已迁到独立页面 `pages/recipe-favorites/recipe-favorites.vue`（见 §5.10），本页只保留入口，不再直接读 `users` / `recipes`。

### 5.10 菜谱收藏 `pages/recipe-favorites/recipe-favorites.vue`

- 收藏数据全部经 `getFavorites` 云函数读取（`favorites` 集合，服务端分页：`PAGE_SIZE = 12`，`onReachBottom` 加载更多），页面不直连数据库。
- `onShow` 与下拉刷新都会重置到第 1 页；已加载过时静默刷新。
- 点击条目按 `recipeKind` 跳详情：`menu` → `?recipeId=&source=menu`，`original` → `?source=original_recipes`，其余 → 只带 `recipeId`。
- 点击「取消收藏」→ 二次确认 → 调 `toggleFavorite { action: 'remove', recipeId, recipeKind }`，成功后按 `favoriteId` 从列表移除并 `total - 1`。
- 云函数不可用时展示错误态与 `errCode`，提示「请确认 cloudfunctions/getFavorites 已上传部署」。

### 5.11 浏览历史 `pages/user/history/index.vue`

- `getViewHistory` 分页拉取 `history` 集合（`PAGE_SIZE = 20`，`onReachBottom` 加载更多），每页返回 `{ items, total, hasMore }`。
- 单条删除与清空都走 `clearViewHistory`（带 `recipeId + recipeKind` 为单删，不带为清空）。
- 点击条目按 `recipeKind` 跳详情：`menu` → `source=menu`，`original` → `source=original_recipes`，其余按 `recipes`。

### 5.12 个人菜谱 `pages/user/personal_recipese.vue`

- 直接查 `original_recipes` 中 `createdBy = openid` 的文档，按 `createdAt` 倒序。
- 操作：编辑（跳 `original_recipes?recipeId=`）、发布 / 下架（`manageOriginalRecipe`，`action = publish / unpublish`）、管理模式下删除（`action = delete`）。
- 发布后 `isPublished = true` 并出现在 `menu`，`author` 记为「用户发布」。

### 5.13 自创菜谱 `pages/user/original_recipes.vue`

- 表单：最多 9 张图（可不上传，第一张为封面）、名称、标签（逗号分隔）、贴士、主食材（名称 + 用量）、配料（常用配料 chip + 自定义）、步骤（描述 + 计时分钟）。
- 图片上传到 `original-recipes/<openid>-<时间戳>-<随机>.<ext>`。
- 提交调 `createOriginalRecipe`：有 `recipeId` 为编辑（校验 `createdBy`），否则新建（`isPublished = false`）。
- 已发布的菜谱编辑后会提示「需要下架后重新发布才能更新公共菜单」。

### 5.14 编辑资料 `pages/user/profile/index.vue`

- 头像：`<button open-type="chooseAvatar">` → `wx.cloud.uploadFile` 到 `avatars/<openid>-<时间戳>.<ext>` → `updateUserProfile({ avatarUrl })`。
- 昵称：`<input type="nickname">`，键盘上方可选「使用微信昵称」；失焦或点「保存」调 `updateUserProfile({ nickname })`。
- 登录状态卡：展示已登录 / 登录中 / 登录失败与 OpenID 脱敏信息，失败可点「微信登录」重试。
- 未登录时禁止修改，所有写操作先校验 `openid`。

---

## 6. 组件与公共模块

### 6.1 `pages/components/RecipeCard.vue`（在用）

| 项 | 说明 |
| --- | --- |
| props | `recipe`、`navigateUrl`、`source` |
| 封面 | 缺封面时回退 `https://picsum.photos/400/300?random=<id 或 title>` |
| footer | `author || mealPlanMeta.cuisine || 'AI 定制'` |
| 点击 | 优先 `navigateUrl`；否则 `/pages/recipe-detail/index?recipeId=<_id>&source=<source>` |

### 6.2 `components/RecipeCard.vue`（遗留）

- 只有 `recipe` 一个 prop，直接绑定 `recipe.cover / tags / author`，点击跳详情**不传 recipeId**。
- 页面均未引用，属于早期重复文件，可删除（删除前全局确认一次）。

### 6.3 `pages/components/StepCard.vue`

步骤卡片组件（步骤号 + 描述 + 计时按钮的展示壳），详情页当前用内联写法渲染步骤，组件主要留作复用。

### 6.4 `components/code/recipe-detail-toggleFavorite.js`

```js
toggleFavoriteRecipe(recipe, recipeKind)
```

组装 `{ action: 'toggle', recipeId: recipe._id, recipeKind, snapshot: { title, cover, tags, sourceIngredients } }` 调 `toggleFavorite`，返回 `{ success, isFavorited, recipeId, recipeKind }`。

### 6.5 `components/code/search.js`

本地搜索兜底：一次 `get` 整个 `menu` 集合，前端做包含匹配、空格分词、以及 `isSimilar`（长度 ≥ 2 时允许 1 个字符差异）。仅在 `search` 云函数不可用时使用。

### 6.6 `stores/user.js`

```js
userStore = {
  openid, userId, nickname, avatarUrl,
  isLoggedIn, loginReady, loginLoading, loginError,
  setUser, updateProfile,
  setLoginPending, setLoginFailed, reset
}
```

小程序的全局单例状态，不做持久化，持久化的是 storage 里的 `openid / nickname / avatarUrl`。收藏、历史、采购单都已迁到独立集合，store 不再缓存 `savedRecipes`。

### 6.7 `utils/recipes.js`（537 行）

菜谱展示层最核心的工具：

- 常量：`EIGHT_MAJOR_CUISINES`、`REGIONAL_CUISINE_ORDER`、`TYPE_CATEGORY_ORDER`、`SCENE_CATEGORY_ORDER`、`DISPLAY_CUISINE_ORDER`。
- `getRecipeClassification(recipe)`：推导 `cuisine / majorCuisine / regionalCuisine / dishCategory / sceneCategory`。
- 归一化：`normalizeRecipeCard`、`normalizeRecipeDetail`、`normalizeIngredients`、`normalizeSteps`、`normalizeCover`。
- 文案与匹配：`buildRecipeIntro`、`matchesRecipeKeyword`、`sortCuisineNames`。

### 6.8 `utils/ai-task.js`

| 函数 | 说明 |
| --- | --- |
| `createAiTask(type, payload)` | 调 `createAiTask`，要求 `result.success && taskId`，否则抛错 |
| `getAiTaskStatus(taskId)` | 调 `getAiTaskStatus`，返回任务对象 |
| `waitForAiTask(taskId, { onUpdate, shouldStop })` | 轮询：`pending/processing` 用快轮询（2000ms），`FAST_POLL_WINDOW = 30000ms` 后转慢轮询（4000ms），`DEFAULT_TIMEOUT = 5min`；页面卸载可中断并抛 `TASK_POLL_ABORTED` |

### 6.9 `uni.promisify.adaptor.js`

uni API 的 Promise 化拦截器（uni-app 默认模板文件），让 `uni.xxx` 在 Promise 风格下可用。

---

## 7. 云函数详解（14 个）

### 7.0 公共约定

- 运行时：Node.js，`require('wx-server-sdk')`，`cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })`——**跟随当前云环境，换环境无需改代码**。
- 用户身份：一律 `cloud.getWXContext().OPENID`，从不由前端传 `openid`。
- 返回结构：统一为 `{ success: boolean, errorMessage?: string, ...业务字段 }`；列表类接口一般返回 `{ items, page, pageSize, total, hasMore }`，`aiAssistant` 把回复包在 `data.reply` 里。前端按各自约定取值。
- 错误处理：`try/catch` 包住主逻辑，`catch` 里返回 `success: false` + 中文错误信息，不抛到前端。
- 首访补建：多数函数会先 `ensureUser(openid)`——不存在就 `set` 一条 `users` 文档，避免 `doc().get()` 报错。

### 7.1 `login`（约 190 行）

- **作用**：静默登录，用 `OPENID` 建立 / 读取 v2 用户档案，并把 v1 内嵌数据迁移到新集合。
- **入参**：无（只用 `OPENID`）。
- **出参**：`{ success, openid, userId, nickname, avatarUrl }`。
- **集合**：`users`（`_id` 等于 `openid`；新用户直接写 `schemaVersion: 2` 档案，含 `stats`）；迁移时读写 `favorites` / `history` / `shopping_items`。
- **要点**：`schemaVersion !== 2` 的老用户会执行一次 `migrateLegacyUser`——`savedRecipes` → `favorites`、`shoppingList` → `shopping_items`、`historyRecipes` → `history`，随后用 `_.remove()` 删掉三个内嵌数组；被 `App.vue` 的 `silentLogin` 调用，超时 20 秒。

### 7.2 `updateUserProfile`（约 60 行）

- **作用**：更新昵称 / 头像。
- **入参**：`{ nickname?, avatarUrl? }`，至少一个。
- **出参**：`{ success, openid, nickname, avatarUrl }`。
- **集合**：`users`（更新对应字段与 `updatedAt`）。

### 7.3 `createAiTask`（约 110 行）

- **作用**：把一次 AI 请求写入任务队列，立即返回任务 ID。
- **入参**：`{ type, payload }`
  - `type` 只能是 `recipe` / `meal_plan`。
  - `payload` 按类型清洗：
    - `recipe`：`{ ingredients: string[] }`（至少 1 个）
    - `meal_plan`：`{ diners 1–10, dishCount 1–8, cuisine, preferences, availableIngredients }`
- **出参**：`{ success: true, taskId, status: 'pending' }`。
- **集合**：`ai_tasks`（写入 `type/status/payload/result/resultRefs/createdBy/createdAt/attemptCount` 等，见附录 B）。
- **要点**：这是「前端 → 队列」的唯一入口，前端不直接触碰大模型。

### 7.4 `getAiTaskStatus`（229 行）

- **作用**：查询任务状态；若 worker 已把结果写进 `recipes` 但 `ai_tasks` 没来得及回填，这里做**结果恢复**。
- **入参**：`{ taskId }`。
- **出参**：`{ success, taskId, status, result?, resultRefs?, errorMessage? }`，状态机 `pending → processing → succeeded / failed`。
- **集合**：`ai_tasks`（按 `_id + createdBy` 校验归属）、`recipes`（按 `taskId` 反查已生成菜谱）。
- **要点**：`resultRefs.recipeId`（单菜谱）/ `resultRefs.recipeIds`（套餐）是前端取结果的关键；有恢复逻辑兜底「结果已写入但任务状态未更新」的窗口期。

### 7.5 `recordViewHistory`（约 80 行）

- **作用**：记录浏览历史。
- **入参**：`{ recipe: { recipeId, title, cover?, recipeKind } }`。
- **出参**：`{ success, recipeId, recipeKind, count }`。
- **集合**：`history`（每条一个文档，id 固定为 `${openid}_${recipeId}`）、`users`（同步 `stats.historyCount`）。
- **要点**：同一菜谱重复浏览用 `set` 更新 `viewedAt`，天然置顶；超过 `MAX_HISTORY_COUNT = 100` 时按 `viewedAt` 升序删掉最旧的（每批 50）。

### 7.6 `getViewHistory`（约 60 行）

- **入参**：`{ page = 1, pageSize = 20 }`（上限 50）。
- **出参**：`{ items: [{ historyId, recipeId, recipeKind, title, cover, viewedAt }], page, pageSize, total, hasMore }`。
- **集合**：`history`。

### 7.7 `clearViewHistory`（约 45 行）

- **作用**：清空历史或删除单条。
- **入参**：`{ recipeId?, recipeKind? }`——传 `recipeId` 删单条，否则清空全部。
- **出参**：`{ success, removed }`。
- **集合**：`history`、`users`（重算 `stats.historyCount`）。

### 7.8 `toggleFavorite`（约 120 行）

- **作用**：收藏 / 取消收藏（幂等）。
- **入参**：`{ action: 'add' | 'remove' | 'toggle', recipeId, recipeKind, snapshot: { title, cover, tags, sourceIngredients } }`。
- **出参**：`{ success, isFavorited, recipeId, recipeKind }`。
- **集合**：`favorites`（写 / 删）、`menu` 与 `users`（仅维护 `favoriteCount` 计数）。
- **要点**：
  - 文档 id 固定为 `${openid}_${recipeId}`，重复点击不会产生多条，也不用先查再写。
  - `snapshot` 只存卡片需要的字段，不复制整条菜谱；`recipeKind` 决定详情页回查哪个集合。
  - 收藏 / 取消时对 `menu.favoriteCount`（仅 `kind = menu`）和 `users.stats.favoriteCount` 做 `_.inc(±1)`。

### 7.9 `search`（105 行）

- **作用**：菜谱关键词搜索（服务端分页）。
- **入参**：`{ keyword, page = 1 }`。
- **出参**：`{ success, data, total, page, pageSize }`，`PAGE_SIZE = 16`。
- **集合**：`menu`。
- **要点**：关键词做正则匹配（标题等字段），空关键词直接返回空结果；页面兜底逻辑见 §5.2。

### 7.10 `manageShoppingList`（约 230 行）

- **作用**：采购单增删改查（每条一个文档，按菜谱归组）。
- **入参**：`{ action, ... }`
  - `get` / `list`：`{ page = 1, pageSize = 100 }`（上限 200），按 `createdAt` 升序返回 `items`
  - `append`：`{ recipeId?, recipeTitle?, servings?, ingredients: [{ name, amount }] }`；请求内先按 `name` 合并（`mergeAmountText` 同单位数值相加），再按 `openid + recipeId + name`（无 `recipeId` 时用 `openid + recipeTitle + name`）upsert——已存在则更新数量、`checked` 复位为 `false`，否则新增
  - `toggle`：`{ itemId, checked? }`，只改这一条的 `checked`
  - `remove`：`{ itemId }`
  - `clear`：删除该用户**全部**采购项（页面「清空全部」用）
  - `clear-checked`：只删除 `checked = true` 的项（保留旧行为）
- **出参**：`get` → `{ success, items, page, pageSize, total, hasMore }`；`append` → `{ success, added, updated, count, total }`；`toggle` → `{ success, item }`；其余 `{ success, removed }`。
- **集合**：`shopping_items`（元素 `{ _id, openid, name, amount, checked, recipeId, recipeTitle, servings, sources[], createdAt, updatedAt }`；`recipeTitle` 决定前端分组）。

### 7.11 `createOriginalRecipe`（135 行）

- **作用**：新建 / 编辑自创菜谱。
- **入参**：`{ recipeId?, recipe: { title, tags, ingredients, steps, tips, images, cover } }`。
- **校验**：标题非空、至少 1 个食材、至少 1 个步骤；编辑时校验 `createdBy === openid`。
- **出参**：`{ success, id }`。
- **集合**：`original_recipes`（新增时补 `isPublished: false`、`publishedMenuId: ''`、`createdAt`；`author: '我的自创'`、`isOriginal: true`）。

### 7.12 `manageOriginalRecipe`（133 行）

- **作用**：自创菜谱的发布 / 下架 / 删除。
- **入参**：`{ action, recipeId }`，`action ∈ publish / unpublish / delete`。
- **出参**：`publish → { success, isPublished: true, publishedMenuId }`；`unpublish → { success, isPublished: false }`；`delete → { success }`。
- **集合**：`original_recipes`、`menu`。
- **要点**：
  - `publish`：把菜谱扁平复制到 `menu`（`author: '用户发布'`、`sourceOriginalRecipeId`、`image = cover`），已有 `publishedMenuId` 则更新而不是新建。
  - `unpublish`：删除 `menu` 中对应文档，清空 `publishedMenuId`。
  - 所有操作先校验 `createdBy`，防止越权。

### 7.13 `aiAssistant`（81 行）

- **作用**：后厨问答（同步调用，不进队列）。
- **入参**：`{ messages: [{ role, content }] }`。
- **出参**：`{ success, data: { reply } }`。
- **外部依赖**：CloudBase AI 网关
  `https://{envId}.api.tcloudbasegateway.com/v1/ai/{provider}/v1/chat/completions`
- **环境变量**：`CLOUDBASE_API_KEY`（必填）、`CLOUDBASE_ENV_ID`（或 `TCB_ENV`）、`CLOUDBASE_AI_PROVIDER`（默认 `hunyuan`）、`CLOUDBASE_MODEL`（默认 `hunyuan-turbos-latest`）、`CLOUDBASE_API_URL`（可覆盖完整地址）。
- **参数**：`temperature: 0.7`、`max_tokens: 500`。
- **System Prompt**：设定为「耐心的后厨领班」，回答控制在 200 字以内，只答做菜相关问题。
- **注意**：它**不用** `wx-server-sdk`（纯 `https`），因此部署时可以不勾选云端安装依赖；但环境变量必须配齐，否则返回「未配置 CLOUDBASE_API_KEY」。

### 7.14 `getFavorites`（约 90 行）

- **作用**：服务端读取「我的收藏」，分页返回收藏卡片数据；也用于查询单条菜谱是否已收藏。
- **入参**：`{ recipeId?, page = 1, pageSize = 12 }`；传 `recipeId` 时只查这一条。
- **出参**：
  - 单查：`{ success, favorited: boolean, recipeId }`
  - 列表：`{ success, items: [{ favoriteId, recipeId, recipeKind, title, cover, tags, sourceIngredients, createdAt }], page, pageSize, total, hasMore }`
- **集合**：`favorites`（按 `openid + createdAt` 倒序）。
- **前端**：`pages/recipe-favorites/recipe-favorites.vue` 用它做分页列表；`pages/recipe-detail/index.vue` 的 `checkFavoriteStatus` 用它判断红心。
- **为什么需要它**：`favorites` 设成「仅创建者可读」后，客户端直读要依赖 `_openid`；统一走云函数还能顺便做分页、按收藏顺序返回，并避免收藏关系散落在客户端。

---

## 8. 数据库设计（8 个集合）

> 微信云数据库是文档型（类 MongoDB），无需建表；集合不存在时首次写入会自动创建（也可在控制台手动新建）。
>
> 2026-11-24 起代码已切到 P2 / v2 结构：8 个集合，收藏、历史、采购单各自独立成集合，`users` 只留档案。完整字段定义、索引、权限矩阵与建库脚本见 [DATABASE.md](DATABASE.md)；本节的 §8.1 / §8.6 已按 v2 描述，§8.2–§8.5 各业务集合与 v2 基本一致。

### 8.1 `users` —— 用户档案（一个 openid 一条）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `_id` | string | 直接使用 `openid` |
| `_openid` | string | 与 `_id` 同值；安全规则「仅创建者」按它判定，缺失会导致本人也读不到 |
| `openid` | string | 微信 openid |
| `nickname` | string | 昵称，默认「美食爱好者」 |
| `avatarUrl` | string | 云存储 fileID 或外链 |
| `stats` | object | `{ favoriteCount, historyCount, recipeCount }` |
| `schemaVersion` | number | 当前为 `2` |
| `createdAt` / `updatedAt` / `lastLoginAt` | date | 时间线 |

**作用**：只放用户档案与偏好；收藏在 `favorites`、浏览历史在 `history`、采购单在 `shopping_items`。写入方：`login`（含 v1→v2 迁移）、`updateUserProfile`、`toggleFavorite`（计数）、`recordViewHistory` / `clearViewHistory`（计数）。

**权限建议**：仅创建者可读（`doc._openid == auth.openid`），客户端只读，写全部走云函数。

### 8.2 `menu` —— 公共菜谱库（种子数据）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `_id` | string | 导入时由 `menu.json` 的 `_id` 决定（从 `"1"` 开始） |
| `id` | string/number | 原始编号（首页 field 里用到） |
| `title` | string | 菜名 |
| `cover` / `image` | string | 封面地址（可能只有其一） |
| `images` | string[] | 多图（发布的自创菜谱会有） |
| `tags` | string[] | 标签，如「快手菜」「微辣」 |
| `category` / `categories` | string/array | 旧分类字段 |
| `cuisine` | string | 菜系（分类查询主字段） |
| `majorCuisine` / `regionalCuisine` | string | 八大菜系 / 地域细分 |
| `dishCategory` | string | 菜品类型（type 模式依赖） |
| `sceneCategory` | string | 用餐场景（scene 模式依赖） |
| `ingredients` | object[] | `{ name, amount, type }`，`type` 为 `main` / `seasoning` |
| `steps` | object[] | `{ stepNum, desc, timerMinute }` |
| `tips` | string | 大厨贴士 |
| `author` | string | 作者；用户发布为「用户发布」 |
| `createdBy` / `openid` | string | 用户发布的作者 openid |
| `sourceOriginalRecipeId` | string | 来自哪条自创菜谱 |
| `createdAt` / `updatedAt` | date | 时间 |

**作用**：整个 App 的「内容底座」。首页精选、分类浏览、搜索、详情、收藏的原料都来自这里。由 `menu.json` 批量导入，用户发布的自创菜谱也会复制进来。

**数据来源**：仓库根 `menu.json`，61,718,577 字节、32,055 行，**JSON Lines**（每行一个完整 JSON 文档），可直接作为「导入」的输入；单文件超过控制台上传上限时需要按行拆分。

**权限建议**：所有用户可读，仅管理端可写。

### 8.3 `recipes` —— AI 生成菜谱 + 收藏副本

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `_id` | string | 自动生成 |
| `_openid` | string | 生成者 / 收藏者 openid，供安全规则判定 |
| `visibility` | string | `private`（默认）/ `public` |
| `title` | string | 菜名 |
| `tags` | string[] | 标签 |
| `ingredients` | object[] | `{ name, amount, type }` |
| `steps` | object[] | `{ stepNum, desc, timerMinute }` |
| `tips` | string | 贴士 |
| `cover` | string | 封面 |
| `sourceIngredients` | string[] | 生成这道菜时用户提供的食材 |
| `sourceMenuId` | string | 若来自公共菜单，记录 menu 的 `_id`（历史来源字段；收藏已改用 `favorites`） |
| `createdBy` | string | 生成者 / 收藏者 openid |
| `taskId` | string | 对应的 `ai_tasks._id`（worker 写回） |
| `mealPlanMeta` | object | 套餐任务附加信息（如菜系），卡片 footer 会用到 |
| `source` | string | 如 `ai_generated` |
| `createdAt` | date | 生成时间 |

**作用**：AI 产出与用户生成结果的落库位置，**不再承担收藏副本职责**（P2 起收藏只存 `favorites` 里的快照）。`visibility` 默认 `private`，只有显式改成 `public` 才允许别人读。

**权限建议**：所有用户可读（详情页直接读），仅创建者可写；实际写入只由云函数 / worker 完成。

### 8.4 `ai_tasks` —— AI 任务队列

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `_id` | string | 自动生成，即 `taskId` |
| `type` | string | `recipe` / `meal_plan` |
| `status` | string | `pending` / `processing` / `succeeded` / `failed` |
| `payload` | object | 清洗后的入参（食材、人数等） |
| `result` | object/array | 模型原始结果 |
| `resultRefs` | object | `{ recipeId }` 或 `{ recipeIds: [] }` |
| `errorMessage` | string | 失败原因 |
| `createdBy` | string | 用户 openid |
| `createdAt` / `startedAt` / `finishedAt` | date | 时间线 |
| `attemptCount` | number | 已尝试次数（重试用） |

**作用**：前后端解耦的「传送带」。写入方是 `createAiTask` 云函数，消费方是本地 `ai-worker`，读取方是 `getAiTaskStatus`。详见附录 B。

**权限建议**：仅创建者可读，写入只允许云函数 / 管理端（客户端不应直接写任务）。

### 8.5 `original_recipes` —— 用户自创菜谱

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `_id` | string | 自动生成 |
| `title` / `tags` / `tips` | string / string[] / string | 基础信息 |
| `ingredients` | object[] | 主食材 + 配料，`type: main / seasoning` |
| `steps` | object[] | `{ stepNum, desc, timerMinute }` |
| `images` | string[] | 最多 9 张云存储 fileID |
| `cover` / `image` | string | 默认第一张 |
| `createdBy` / `openid` | string | 作者 |
| `isPublished` | boolean | 是否已发布到 `menu` |
| `publishedMenuId` | string | 发布后对应 `menu._id` |
| `isOriginal` | boolean | 固定 `true` |
| `author` | string | 「我的自创」 |
| `createdAt` / `updatedAt` | date | 时间 |

**作用**：用户自己的菜谱工作区，发布后镜像到 `menu`。

**权限建议**：所有用户可读（详情页分享/浏览），仅创建者可写。

### 8.6 集合关系图

```
users (openid, _openid)
  ├─ favorites      { recipeId, recipeKind, snapshot }   // 收藏关系 + 卡片快照
  ├─ history        { recipeId, recipeKind, viewedAt }   // 每菜一条，最多 100
  └─ shopping_items { name, amount, checked, recipeId, recipeTitle, servings } // 每条一个文档，按 recipeTitle 分组

menu._id ◄── favorites.recipeId            （kind = menu）
menu._id ◄── original_recipes.publishedMenuId（发布时镜像）
ai_tasks._id ◄── recipes.taskId             （worker 写回）
```

---

## 9. 云存储目录

| 目录 | 写入方 | 用途 | 命名 |
| --- | --- | --- | --- |
| `avatars/` | `pages/user/profile/index.vue` | 用户头像 | `<openid>-<时间戳>.<ext>` |
| `original-recipes/` | `pages/user/original_recipes.vue` | 自创菜谱图片（最多 9 张） | `<openid>-<时间戳>-<随机6位>.<ext>` |

**权限建议**：所有用户可读（展示需要），仅创建者可写。`fileID` 直接存进数据库字段（`cover`、`images`、`avatarUrl`），前端 `<image src>` 可直接渲染。

**注意**：云环境释放后这些文件会一并消失，`menu.json` 里的封面若是外部链接则不受影响，用户上传的图片不可恢复。

---

## 10. AI 双链路与任务队列

### 10.1 模型出口

| 调用方 | 依赖配置 |
| --- | --- |
| `aiAssistant` 云函数 / worker | `CLOUDBASE_API_KEY`、`CLOUDBASE_ENV_ID`、`CLOUDBASE_AI_PROVIDER`、`CLOUDBASE_MODEL` |

所有 AI 调用统一走 CloudBase AI 网关（混元），具体地址与模型由环境变量决定，前端不再提供切换。

### 10.2 同步问答链路（aiAssistant）

```
ai-chat 页 → aiAssistant 云函数 → CloudBase AI 网关 → 返回 reply
```

特点：一次调用一次返回，前端 `isThinking` 控制「正在输入」动画，失败用固定文案兜底。

### 10.3 异步生成链路（任务队列）

```
前端 createAiTask(type,payload)
   → 云函数 createAiTask 写 ai_tasks(status=pending)
   → 前端拿 taskId，每 2s/4s 轮询 getAiTaskStatus
   → ai-worker 每 3s 查 pending
       → where({_id, status:'pending'}).update → processing, attemptCount+1
       → 调 CloudBase AI 网关（混元）
       → 解析 JSON → 写 recipes（taskId, createdBy, ...）
       → 回填 ai_tasks(result, resultRefs, status=succeeded, finishedAt)
       → 失败：status=failed + errorMessage，attemptCount < maxAttempts 时重试
   → 前端轮询到 succeeded → 用 resultRefs 读 recipes → 渲染
```

### 10.4 任务状态机

```
pending ──claim──► processing ──成功──► succeeded
   ▲                   │
   │                   └──失败且可重试──► pending（attemptCount+1）
   │                   └──失败且超限───► failed
   └── worker 重启后 resetStaleProcessingTasks（processing 超过 10 分钟视为僵死）
```

### 10.5 ai-worker 执行细节

| 项 | 值 / 行为 |
| --- | --- |
| 默认 provider / model | `hunyuan` / `hunyuan-turbos-latest` |
| 轮询间隔 | `WORKER_POLL_INTERVAL_MS`，默认 3000ms（当前 `.env` 设为 1000ms） |
| 僵死判定 | `WORKER_STALE_TIMEOUT_MS`，默认 600000ms（10 分钟） |
| 最大尝试 | `WORKER_MAX_ATTEMPTS`，默认 3（当前 `.env` 设为 1） |
| 抢占方式 | `where({ _id, status: 'pending' }).update({ status: 'processing', attemptCount: _.inc(1), startedAt })`，靠更新结果判断是否抢到 |
| 任务类型 | `recipe`（单菜）、`meal_plan`（一桌菜） |
| 成功写回 | `recipes` 文档（`taskId/createdBy/sourceIngredients/createdAt/mealPlanMeta`）+ `ai_tasks.result/resultRefs/status='succeeded'/finishedAt` |
| JSON 容错 | `extractJsonCandidate` 多候选提取：先整体解析，再截取首个 `{...}` / `[...]`，再修复常见尾逗号等 |
| 日志 | `WORKER_TASK_LOG_DETAIL=verbose` 时打印任务明细 |

### 10.6 提示词与推理参数

| 场景 | 提示词构造 | 关键参数 |
| --- | --- | --- |
| 单菜生成 | `buildRecipePrompt`：要求输出严格 JSON（`title/tags/ingredients/steps/tips`），食材必须带用量，步骤 4–8 步，`stepNum` 连续 | `temperature 0.7`（创作）、`top_p 0.8`、`num_predict 1200` |
| 宴客套餐 | `buildMealPlanPrompt`：按人数/菜数/菜系/忌口/主食材设计荤素搭配，每道菜单独成 JSON | 同上 |
| 后厨问答 | 云函数内 `SYSTEM_PROMPT`（后厨领班，200 字以内） | `temperature 0.7`、`max_tokens 500` |

### 10.7 前端轮询参数

| 常量 | 值 | 说明 |
| --- | --- | --- |
| `FAST_POLL_INTERVAL` | 2000ms | 任务刚创建时 |
| `SLOW_POLL_INTERVAL` | 4000ms | 30 秒后降频 |
| `FAST_POLL_WINDOW` | 30000ms | 快轮询窗口 |
| `DEFAULT_TIMEOUT` | 5 分钟 | 超时抛错 |

---

## 11. 配置与环境变量

### 11.1 `App.vue`

```js
wx.cloud.init({ env: 'cloud1-d6gdxrlf5bcb4e41c', traceUser: true })
```

- 换云环境时**必改**这一行。
- `onLaunch` 里紧接着 `silentLogin()`，`LOGIN_TIMEOUT = 20000`。
- 登录成功后写 storage `openid`，并 `userStore.setUser`（收藏不再缓存在 store）。

### 11.2 `manifest.json`

| 配置 | 值 |
| --- | --- |
| `name` | AICAIPU |
| `appid`（uni） | `__UNI__7FC01A9` |
| `vueVersion` | 3 |
| `mp-weixin.appid` | `wx157c7f6703ae420c` |
| `mp-weixin.cloudfunctionRoot` | `cloudfunctions/` |
| `mp-weixin.urlCheck` | `false`（开发期关闭域名校验） |
| `versionName / versionCode` | 1.0.0 / 100 |

### 11.3 `project.config.json`（小程序项目配置）

```json
{
  "miniprogramRoot": "unpackage/dist/dev/mp-weixin/",
  "cloudfunctionRoot": "cloudfunctions/"
}
```

- `cloudfunctionRoot`：让开发者工具在源码根目录看到 14 个云函数。
- `miniprogramRoot`：让开发者工具从**源码根目录**加载编译产物，从而同时看到「小程序代码 + 云函数源码」，避免来回复制目录。
- 这是当前采用的方案；替代方案是把 `cloudfunctions` 复制进 `unpackage/dist/dev/mp-weixin/`，但每次编译都可能被清理。

### 11.4 `ai-worker/.env`（本地，已 gitignore）

| 变量 | 作用 | 备注 |
| --- | --- | --- |
| `CLOUDBASE_ENV_ID` | 云环境 ID | 必须与 `App.vue` 一致 |
| `CLOUDBASE_SECRET_ID` | 腾讯云 SecretId | 用于 `@cloudbase/node-sdk` 连接数据库 |
| `CLOUDBASE_SECRET_KEY` | 腾讯云 SecretKey | 同上 |
| `CLOUDBASE_API_KEY` | CloudBase AI 网关密钥（JWT） | 必须属于**当前环境** |
| `CLOUDBASE_AI_PROVIDER` / `CLOUDBASE_MODEL` | 云端模型 | 如 `hunyuan-exp` / `hunyuan-turbos-latest` |
| `CLOUDBASE_API_URL` | 覆盖网关地址（可选） | 不填则拼 `https://{env}.api.tcloudbasegateway.com/v1/ai/{provider}/v1/chat/completions` |
| `WORKER_POLL_INTERVAL_MS` | 轮询间隔 | 默认 3000 |
| `WORKER_STALE_TIMEOUT_MS` | 僵死判定 | 默认 600000 |
| `WORKER_MAX_ATTEMPTS` | 最大尝试次数 | 默认 3 |
| `WORKER_TASK_LOG_DETAIL` | 日志详细度 | `verbose` 打印任务明细 |
| `AI_*` | 推理参数 | `AI_TEMPERATURE`、`AI_TOP_P`、`AI_TOP_K`、`AI_MIN_P`、`AI_NUM_PREDICT`、`AI_MAX_TOKENS`、`AI_SEED`、`AI_REASONING_EFFORT` 等，未设则用代码默认 |

> `.env` 里的 `AI_*` 是全局默认值，问答走云函数自己的参数。调参时注意优先级：**任务代码里的显式值 > `.env` > 代码默认**。

### 11.5 `aiAssistant` 云函数环境变量（在云开发控制台配置）

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `CLOUDBASE_API_KEY` | 是 | 网关密钥；缺失直接报错 |
| `CLOUDBASE_ENV_ID` | 是（或 `CLOUDBASE_API_URL`） | 用于拼网关地址 |
| `CLOUDBASE_AI_PROVIDER` | 否 | 默认 `hunyuan` |
| `CLOUDBASE_MODEL` | 否 | 默认 `hunyuan-turbos-latest` |
| `CLOUDBASE_API_URL` | 否 | 整体覆盖地址 |

> 安全红线：任何密钥都只放云函数环境变量或本地 `.env`，**不能写进前端代码**，`.env` 已被 `.gitignore` 忽略。

---

## 12. 从零重建 / 部署清单

> 背景：云开发环境已过期释放，以下步骤把项目重新跑起来。顺序不要乱。

### 第 0 步：确认小程序身份

- 登录微信公众平台，确认 `wx157c7f6703ae420c` 仍可用。
- 若已注销：注册新小程序 → 改 `manifest.json` 的 `mp-weixin.appid` 与 `project.config.json` 的 `appid`。

### 第 1 步：重新开通云开发

- 微信开发者工具打开项目根目录（`aicaipu/`）。
- 顶部「云开发」→ 开通 → 新建环境（如 `cloud1-xxxx`），记下**环境 ID**。

### 第 2 步：同步环境 ID

- `App.vue`：`wx.cloud.init({ env: '新环境ID' })`。
- `ai-worker/.env`：`CLOUDBASE_ENV_ID=新环境ID`。
- 云函数用 `DYNAMIC_CURRENT_ENV`，**不用改**。

### 第 3 步：建集合 + 导入菜单

> 2026-11-24 已在 `cloud1-d6gdxrlf5bcb4e41c` 核对：8 个集合齐全（v2 新增的 `favorites` / `history` / `shopping_items` 已建）、`menu` 32,055 条、历史文档已补 `_openid`。换环境时照下面的脚本重做。

```bash
cd ai-worker
npm install
npm run setup-db -- --v2                      # 建 v2 的 8 个集合（已存在跳过）
npm run import-menu -- --file=../menu.json    # 流式分批导入，可中断重跑
npm run db-status                             # 核对各集合数量与字段
npm run backfill-openid                       # 给老数据补 _openid（可重复执行）
```

- `menu.json` 是 61 MB 的 JSON Lines（32,055 行），脚本不需要手工拆分；`--dry-run` 可先试跑。
- 索引（控制台 → 数据库 → 索引管理），v2 至少建这些（完整清单见 DATABASE.md §4）：

| 集合 | 索引字段 | 用途 |
| --- | --- | --- |
| `menu` | `cuisine`、`majorCuisine`、`regionalCuisine`、`dishCategory`、`sceneCategory` | 首页、分类、筛选 |
| `favorites` | `openid + createdAt`（倒序）、`openid + recipeId` | 收藏列表分页、幂等判断 |
| `history` | `openid + viewedAt`（倒序） | 历史分页 |
| `shopping_items` | `openid + checked + createdAt` | 采购单列表 |
| `recipes` | `taskId`；`sourceMenuId`；`createdBy + createdAt` | AI 结果回查、来源追溯、我的菜谱 |
| `ai_tasks` | `status + createdAt`；`createdBy + createdAt` | worker 抢任务、任务列表 |
| `original_recipes` | `createdBy + updatedAt`；`publishedMenuId` | 我的自创、发布校验 |

- 安全规则（控制台 → 数据库 → 权限设置 → 自定义规则）。客户端不直接写库，写操作全部走云函数（管理端身份，不受规则限制）：

| 集合 | 规则 |
| --- | --- |
| `menu` | `{"read": true, "write": false}` |
| `recipes` | `{"read": "doc._openid == auth.openid \|\| doc.visibility == 'public'", "write": false}` |
| `original_recipes` | `{"read": true, "write": false}` |
| `users` | `{"read": "doc._openid == auth.openid", "write": false}` |
| `favorites` | `{"read": "doc._openid == auth.openid", "write": false}` |
| `history` | `{"read": "doc._openid == auth.openid", "write": false}` |
| `shopping_items` | `{"read": "doc._openid == auth.openid", "write": false}` |
| `ai_tasks` | `{"read": "doc._openid == auth.openid", "write": false}` |

> `users` / `recipes` 的读规则依赖 `_openid`：新数据由云函数写入时自带，历史数据用 `npm run backfill-openid` 补齐过一次。

### 第 4 步：部署 14 个云函数

- 资源管理器右键 `cloudfunctions` → 选择云开发环境。
- 逐个右键「上传并部署：云端安装依赖」（11 个需要 `wx-server-sdk`；`aiAssistant` 只用 `https`，也建议一起传）。
- P2 改动的函数（`login`、`toggleFavorite`、`getFavorites`、`recordViewHistory`、`getViewHistory`、`clearViewHistory`、`manageShoppingList`、`updateUserProfile`）必须重新部署，否则前端调用的入参 / 出参会与旧版本对不上。
- 首次部署后等待依赖安装完成（1–3 分钟/个）。

### 第 5 步：配置 `aiAssistant` 环境变量

云开发控制台 → 云函数 → `aiAssistant` → 配置 → 环境变量：`CLOUDBASE_API_KEY`、`CLOUDBASE_ENV_ID`（可选 `CLOUDBASE_AI_PROVIDER`、`CLOUDBASE_MODEL`）。

### 第 6 步：启动 ai-worker

```bash
cd ai-worker
npm install
npm start
```

- 必须用**新环境**的 SecretId / SecretKey / API_KEY 填 `.env`。
- 保持进程常开；关掉后任务会一直停在 `pending`。

### 第 7 步：编译并导入小程序

- HBuilderX：运行 → 运行到小程序模拟器 → 微信开发者工具（或先「发行 → 小程序」）。
- 开发者工具导入目录：**项目根 `aicaipu/`**（依赖 `miniprogramRoot` 指向编译产物）。
- 若提示 `app.json 未找到`：说明 `miniprogramRoot` 没生效，先确认已编译出 `unpackage/dist/dev/mp-weixin/app.json`。

### 第 8 步：功能联调

按顺序自测：静默登录 → 首页精选 → 搜索 → 分类筛选 → 详情 → 冰箱生成菜谱 → 宴客套餐 → 采购单 → 收藏 → 历史 → 自创菜谱 → 发布/下架 → AI 问答。

### 第 9 步：提交

```bash
git add .
git commit -m "chore: 重建云环境配置"
git push gitee main
git push github main
```

> 提交前确认 `git status` 里没有 `.env`；`menu.json` 61 MB 会触发 GitHub 50 MB 警告，可考虑 Git LFS 或移出版本库。

---

## 13. 本地开发与联调

### 13.1 工具链

| 工具 | 用途 | 备注 |
| --- | --- | --- |
| HBuilderX | 编译 uni-app | 需要 uni-app 编译插件；SCSS 需 `compile-dart-sass` 或 `compile-node-sass` |
| 微信开发者工具 | 运行小程序、部署云函数、看云开发控制台 | 导入项目根目录 |
| Node.js | 跑 `ai-worker` | 建议 18+ |

### 13.2 编译产物

- 开发：`unpackage/dist/dev/mp-weixin/`
- 发行：`unpackage/dist/build/mp-weixin/`
- 两者都在 `.gitignore` 的 `unpackage/` 下，不入库。

### 13.3 常见启动问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `app.json 在项目根目录未找到` | 直接打开了源码根目录，但没配 `miniprogramRoot`，或还没编译 | 检查 §11.3 配置；先编译 |
| 云函数没有云图标 | 在 HBuilderX 里看（HBuilderX 不显示云图标），或云开发未开通 | 到微信开发者工具里看；先开通云开发并建环境 |
| 云函数报「未获取到 OPENID」 | 未在云函数环境内调用 / 本地调试 | 用开发者工具的云函数测试能力 |
| 任务一直 `pending` | `ai-worker` 没启动 / 密钥错误 / 环境 ID 不一致 | 看 worker 控制台日志 |
| 任务 `failed`：未配置 CLOUDBASE_API_KEY | 云函数环境变量缺失 | 控制台补配 |
| 收藏后看不到 | 收藏没写进 `favorites` / `openid` 为空 / 云函数未更新 | 看 `toggleFavorite` 返回；确认 `getFavorites` 已部署且入参是 `{ recipeId }` |

---

## 14. 数据流速查表

| 用户动作 | 前端入口 | 云函数 | 读写集合 | 备注 |
| --- | --- | --- | --- | --- |
| 打开小程序 | `App.vue` | `login` | `users` 写 | 静默登录，20s 超时 |
| 改头像 | 我的 | `updateUserProfile` | `users` 写 + 云存储 `avatars/` | |
| 改昵称 | 我的 | `updateUserProfile` | `users` 写 | |
| 首页精选 | 首页 | — | `menu` 读 | 按菜系各取 1 道 |
| 搜索 | 搜索页 | `search` | `menu` 读 | 失败走本地兜底 |
| 分类浏览 | 分类页 | — | `menu` 读 | 4 种模式 |
| 看详情 | 详情页 | `recordViewHistory` | `menu`/`recipes`/`original_recipes` 读，`users` 写 | 记历史 |
| 收藏 | 详情页 | `toggleFavorite` | `favorites` 写、`menu`/`users` 计数写 | 文档 id = openid_recipeId，幂等 |
| 看收藏 | 菜谱收藏 | `getFavorites` | `favorites` 读 | 服务端分页，每页 12 |
| 生成菜谱 | 冰箱 → 详情 | `createAiTask` + `getAiTaskStatus` | `ai_tasks` → `recipes` | worker 文本模型 |
| 宴客套餐 | 表单 → 结果 | `createAiTask` + `getAiTaskStatus` | `ai_tasks` → `recipes` | 一次多道菜 |
| 加采购单 | 详情页 / 结果页 | `manageShoppingList(append)` | `shopping_items` 写 | 详情页带 `recipeId/recipeTitle/servings`，按 `openid+recipeId+name` upsert；结果页按 `recipeTitle` 归类 |
| 勾选采购项 | 采购单 | `manageShoppingList(toggle)` | `shopping_items` 写 | 按 itemId 改一条 |
| 删单条 | 采购单 | `manageShoppingList(remove)` | `shopping_items` 删 | 按 itemId |
| 清空 / 复制 | 采购单 | `manageShoppingList(clear)` / 本地剪贴板 | `shopping_items` 删 | `clear` 删全部；复制在本地拼接文本 |
| 看历史 | 历史页 | `getViewHistory` | `history` 读 | 每页 20，最多 100 条 |
| 删历史 | 历史页 | `clearViewHistory` | `history` 删 | 单删 / 清空 |
| 新建自创菜谱 | 自创菜谱页 | `createOriginalRecipe` | `original_recipes` 写 + 云存储 | |
| 发布菜谱 | 个人菜谱 | `manageOriginalRecipe(publish)` | `original_recipes` 写、`menu` 写 | 镜像到公共库 |
| 下架 / 删除 | 个人菜谱 | `manageOriginalRecipe` | `original_recipes`、`menu` | 先校验作者 |
| AI 问答 | AI 聊菜 | `aiAssistant` | — | 同步，5 分钟内回答 |

---

## 15. 已知问题与注意事项

### 15.1 云环境相关

1. **环境已释放**：旧的云开发环境资源（数据库、存储、函数）已不可用，用户数据不可恢复；按 §12 重建。
2. **API Key 与新环境不匹配**：`ai-worker/.env` 里 `CLOUDBASE_ENV_ID` 已是当前环境，但 `CLOUDBASE_API_KEY` 这个 JWT 的 `aud / project_id` 仍指向那个已释放的旧环境——必须在 CloudBase 控制台**为新环境重新生成** API Key，否则云端模型调用会 401。
3. **SecretId / SecretKey 泄露**：早期提交 `0ffe682` 曾包含 `.env`（已 amend 为 `87242f6` 并强推，但 Gitee 上旧对象可能仍按 SHA 可访问）。到腾讯云控制台轮换这三组密钥（SecretId / SecretKey / API Key）。
4. **前端 env 与函数 env**：云函数用 `DYNAMIC_CURRENT_ENV` 自动跟随部署环境，只有 `App.vue` 与 `.env` 需要手改。

### 15.2 工程相关

5. **`components/RecipeCard.vue` 是重复文件**：页面实际使用 `pages/components/RecipeCard.vue`，删除前记得全局搜索确认。
6. **`menu.json` 体积 61.7 MB**：GitHub 单文件 >50 MB 会警告；可考虑 Git LFS 或 `.gitignore` + 单独分发。
7. **`miniprogramRoot` 覆盖风险**：HBuilderX「运行到微信开发者工具」可能重写产物里的 `project.config.json`；若出现异常，先检查该文件是否仍含 `miniprogramRoot`。
8. **`unpackage/` 不入库**：新环境首次克隆后必须先在 HBuilderX 编译，才有 `mp-weixin` 目录。
9. **文件名拼写**：`pages/user/personal_recipese.vue`（多一个 s）、`pages/index/search.vue` 不在 `pages/search/` 下——路由以 `pages.json` 为准，改动时注意同步。
10. **`search` 的本地兜底**会一次拉全表，菜单数据 3 万条时会卡；只在云函数异常时触发。

### 15.3 业务逻辑相关

11. **收藏不再复制菜谱**：P2 起收藏只写 `favorites`（`recipeId + recipeKind + snapshot`），不再往 `recipes` 复制副本；详情页回查原集合，所以菜单菜谱更新后收藏卡片能看到最新封面，但 `snapshot` 仍保留收藏时的旧值。
12. **任务残留 `processing`**：worker 崩溃会留下 `processing` 任务，靠 `resetStaleProcessingTasks`（10 分钟）恢复；若 worker 长时间不启动，任务会一直不动。
14. **历史 100 条上限**：超过后最旧记录被裁掉；同一菜谱只保留一条（按 `openid_recipeId` 去重），从菜单和收藏进入的是同一条。
15. **`test26_10_15.md`** 是答辩材料，不是运行时文件，可保留作文档。

---

## 16. 维护与扩展建议

| 方向 | 建议 |
| --- | --- |
| 部署简化 | 把 14 个云函数改为「上传并部署：云端安装依赖」+ CI（如 GitHub Actions + CloudBase CLI） |
| 任务可靠性 | worker 改为常驻服务（PM2 / systemd / 云托管），或迁到云函数 + 异步回调（需解决时长限制） |
| 数据治理 | `menu.json` 迁 Git LFS；为 `menu` 建 `cuisine`、`dishCategory`、`sceneCategory` 索引 |
| 安全 | 轮换泄露密钥；给 `.env` 增加 `env.example`；云函数统一校验参数长度 |
| 代码整洁 | 删除 `components/RecipeCard.vue`；把 `pages/components` 合并到根 `components/` |
| 体验 | 首页骨架屏、详情页失败重试、`ai-chat` 流式输出（当前一次性返回） |
| 可观测 | worker 日志落文件并轮转；`ai_tasks` 增加失败聚合统计 |

---

## 附录 A：云函数速查表

| 函数 | 行数 | 触发方 | 集合 | 入参要点 | 出参要点 |
| --- | --- | --- | --- | --- | --- |
| `login` | ~190 | App 启动 | `users`、`favorites`/`history`/`shopping_items`（迁移） | 无 | `openid/nickname/avatarUrl` |
| `updateUserProfile` | ~60 | 编辑资料 | `users` | `nickname?/avatarUrl?` | `nickname/avatarUrl` |
| `createAiTask` | ~110 | 冰箱/详情/套餐 | `ai_tasks` | `type/payload` | `taskId/status` |
| `getAiTaskStatus` | 229 | 三个 AI 页轮询 | `ai_tasks`、`recipes` | `taskId` | `status/result/resultRefs` |
| `recordViewHistory` | ~80 | 详情页 | `history`、`users` | `recipe{recipeId,title,cover,recipeKind}` | `count` |
| `getViewHistory` | ~60 | 历史页 | `history` | `page/pageSize` | `items/total/hasMore` |
| `clearViewHistory` | ~45 | 历史页 | `history`、`users` | `recipeId?/recipeKind?` | `removed` |
| `toggleFavorite` | ~120 | 详情页/收藏页 | `favorites`、`menu`、`users` | `action/recipeId/recipeKind/snapshot` | `isFavorited/recipeId/recipeKind` |
| `getFavorites` | ~90 | 收藏页/详情页 | `favorites` | `recipeId?/page/pageSize` | `favorited` 或 `items/total/hasMore` |
| `search` | 105 | 搜索页 | `menu` | `keyword/page` | `data/total/page/pageSize` |
| `manageShoppingList` | ~230 | 采购单/详情页/套餐 | `shopping_items` | `action(get/append/toggle/remove/clear/clear-checked)` | `items/item/added/updated/total` |
| `createOriginalRecipe` | 134 | 自创菜谱 | `original_recipes` | `recipeId?/recipe` | `id` |
| `manageOriginalRecipe` | 132 | 个人菜谱 | `original_recipes`、`menu` | `action/recipeId` | `isPublished/publishedMenuId` |
| `aiAssistant` | 81 | AI 聊菜 | — | `messages[]` | `data.reply` |

## 附录 B：ai_tasks 字段说明

```jsonc
{
  "_id": "任务ID（= taskId）",
  "type": "recipe | meal_plan",
  "status": "pending | processing | succeeded | failed",
  "payload": {
    // recipe
    "ingredients": ["西红柿", "鸡蛋"],
    // meal_plan
    "diners": 2, "dishCount": 3, "cuisine": "家常菜",
    "preferences": "清淡", "availableIngredients": "鸡肉"
  },
  "result": { "title": "...", "tags": [], "ingredients": [], "steps": [], "tips": "" },
  "resultRefs": { "recipeId": "..." },       // 或用 recipeIds: []
  "errorMessage": "",
  "createdBy": "openid",
  "createdAt": "serverDate",
  "startedAt": "serverDate | null",
  "finishedAt": "serverDate | null",
  "attemptCount": 0
}
```

状态流转：`pending → processing → succeeded / failed`；失败可重试回 `pending`（`attemptCount < maxAttempts`）。

## 附录 C：术语表

| 术语 | 含义 |
| --- | --- |
| 云函数 | 跑在微信云开发上的 Node 函数，免运维，通过 `wx.cloud.callFunction` 调用 |
| 云数据库 | 文档型数据库，本项目 v2 共 8 个集合 |
| 云存储 | 对象存储，存图片，返回 `fileID` |
| `OPENID` | 微信用户在小程序内的唯一标识，本项目作为用户主键 |
| `ai_tasks` | 异步任务队列集合，前端入队、worker 消费 |
| worker | `ai-worker/index.js`，本地 Node 进程，真正调大模型的人 |
| CloudBase AI 网关 | 腾讯云提供的模型聚合 HTTP 接口，`/v1/ai/{provider}/v1/chat/completions` |
| 混元 | 腾讯自研大模型，本项目云端默认 provider |
| `resultRefs` | 任务完成后指向产物的引用，前端据此二次查库 |
| FAST/SLOW 轮询 | 前端 2s/4s 两档轮询，30 秒后降频 |
| `miniprogramRoot` | 开发者工具读取小程序代码的根目录（本项目指向编译产物） |
| `cloudfunctionRoot` | 开发者工具识别云函数源码的目录（本项目指 `cloudfunctions/`） |

---

*本文档由代码静态分析 + 历史对话整理生成；涉及密钥的部分只保留变量名。若代码有更新，请同步维护本文件。*
