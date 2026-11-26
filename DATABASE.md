# 数据库优化设计（v2）

> 状态：**设计 + 建库/导入工具已就绪**；业务代码目前仍是 v1，改造清单见文末 §10。
> 适用：微信云开发（文档型数据库）。云环境释放后数据不可恢复，正好按本文从零建库，不需要迁移脚本。

---

## 0. 现状问题（每条都有代码证据）

| 编号 | 问题 | 证据 | 后果 |
| --- | --- | --- | --- |
| P1 | `users` 一个文档里塞三个数组：`savedRecipes`、`shoppingList`、`historyRecipes` | `cloudfunctions/manageShoppingList/index.js:91-95`、`120-124`、`135-139` 每次都整数组覆盖写回 | 两台设备同时勾采购单 → 后写覆盖先写，丢更新；改一个勾选要重写整个数组 |
| P2 | 云函数写入的文档没有 `_openid` | `cloudfunctions/login/index.js:25-34`、`manageShoppingList/index.js:14-23`、`recordViewHistory/index.js:13-22` | 「仅创建者」安全规则按 `_openid` 判定，客户端 `users.doc(openid).get()` 直接报 `document.get:fail cannot find document`（本次收藏 bug 的根因） |
| P3 | 收藏 = 把 menu 菜谱**整份复制**进 `recipes` | `cloudfunctions/toggleFavorite/index.js` 的复制逻辑 | 一道菜被 1 万人收藏就有 1 万份副本；menu 修正后收藏副本不会更新，内容漂移 |
| P4 | 没有索引，搜索全表扫 | `cloudfunctions/search/index.js:21-29` 用 `db.RegExp` 扫 `title`；再 `.limit(1000)` 取回内存过滤 | 32,055 条菜谱全表正则扫描；超过 1000 条**静默截断**，第 1001 条以后永远搜不到 |
| P5 | 任务表靠时间戳判断僵死 | `ai-worker/index.js` 的 `stale` 逻辑（10 分钟） | worker 崩溃后任务最长卡 10 分钟；多开一个 worker 没有显式租约 |
| P6 | 字段命名与语义不一致 | `users.openid` 与 `_id` 重复；`recipes.createdBy`、`menu.createdBy/openid`、`original_recipes.createdBy/openid` 三种写法 | 写代码时要到处判断字段是否存在 |
| P7 | 权限过宽 | `recipes` 若设「所有用户可读」，他人 AI 生成结果（含输入的食材）可被读到 | 隐私泄露 |
| P8 | 没有生命周期管理 | `ai_tasks` 永不清理；历史靠 50 条数组截断；menu 下架靠物理删除 | 集合无限膨胀；删除后历史/收藏无法展示 |

---

## 1. 设计原则

1. **一个集合一件事**：档案、收藏、历史、采购单、任务各自独立，不再往 `users` 里塞数组。
2. **写只走云函数**：客户端一律 `write: false`。已核对现有代码，**所有写操作本来就都走云函数**（login / toggleFavorite / manageShoppingList / recordViewHistory / updateUserProfile / createOriginalRecipe / manageOriginalRecipe / createAiTask），所以收紧权限不会破坏任何功能。
3. **读按需分配**：公共内容直读（menu），个人数据「本人可读」，需要联表的走云函数。
4. **快照最小化**：只冻结展示必需的 4–6 个字段，不复制整条菜谱。
5. **分页 + 索引**：所有列表都能 `skip/limit`，不为「取全部再前端切」写代码。
6. **幂等**：同一操作重复调用结果一致（收藏、勾选、发布）。
7. **状态位而非物理删**：`isActive` / `status`，保留可恢复与可审计。
8. **计数原子化**：`_.inc(1)`，不做「读出来 +1 再写回」。

---

## 2. 集合总览（8 个）

| 集合 | 职责 | 客户端读 | 写入方 |
| --- | --- | --- | --- |
| `users` | 用户档案、偏好、统计 | 仅本人 | 云函数 |
| `favorites` | 收藏关系 + 最小快照 | 仅本人 | 云函数 |
| `history` | 浏览历史（每菜一条） | 仅本人 | 云函数 |
| `shopping_items` | 采购清单（每条一个文档） | 仅本人 | 云函数 |
| `menu` | 公共菜谱库（种子 + 用户发布） | 所有人 | 导入脚本 / 云函数 |
| `recipes` | AI 生成结果 | 本人或公开 | ai-worker / 云函数 |
| `ai_tasks` | AI 任务队列 | 仅本人 | 云函数 / ai-worker |
| `original_recipes` | 用户自创菜谱工作区 | 所有人 | 云函数 |

`users` 从「什么都装」变成纯档案；`recipes` 不再是收藏的实体表；采购单/历史/收藏各自可无限增长且可分页。

---

## 3. 字段定义

### 3.1 `users` —— 纯档案

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `_id` | string | ✔ | 直接等于 `openid` |
| `_openid` | string | ✔ | 与 `_id` 同值；**必须写入**，否则本人读自己被规则拒绝 |
| `openid` | string | ✔ | 冗余一份，兼容旧代码与 `where` 查询 |
| `nickname` | string | ✔ | 默认「美食爱好者」 |
| `avatarUrl` | string | ✔ | 云存储 fileID 或外链，默认 `''` |
| `stats.favoriteCount` | number |  | 收藏数，云函数 `_.inc` 维护 |
| `stats.historyCount` | number |  | 历史条数（上限 100） |
| `stats.recipeCount` | number |  | 自创菜谱数 |
| `schemaVersion` | number | ✔ | 固定 `2`，方便以后迁移 |
| `createdAt` / `updatedAt` / `lastLoginAt` | date | ✔ | |

**不再包含**：`savedRecipes`、`shoppingList`、`historyRecipes`。

### 3.2 `favorites` —— 收藏关系（新）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `_id` | string | 自动生成 |
| `_openid` / `openid` | string | 收藏人 |
| `recipeId` | string | **目标**菜谱 id（`menu._id` / `recipes._id` / `original_recipes._id`） |
| `recipeKind` | string | `menu` / `recipe` / `original`，决定详情页从哪个集合取 |
| `snapshot.title` | string | 列表展示用 |
| `snapshot.cover` | string | 列表展示用 |
| `snapshot.tags` | string[] | 列表展示用 |
| `snapshot.sourceIngredients` | string[] | 「AI 定制」角标用，可空 |
| `createdAt` | date | 收藏时间（排序键） |

**去重键**：`(openid, recipeId)`。收藏时先 `where({ openid, recipeId }).count()`，存在则直接返回成功（幂等）。
**为什么必须有快照**：menu 可能下架、自创菜谱可能被删；快照保证收藏列表永远能渲染卡片，详情页取不到时用快照兜底。

### 3.3 `history` —— 浏览历史（新）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `_openid` / `openid` | string | 用户 |
| `recipeId` | string | 菜谱 id |
| `recipeKind` | string | `menu` / `recipe` / `original` |
| `title` / `cover` | string | 展示冗余 |
| `viewedAt` | date | 排序键 |

**写入逻辑**：先 `where({openid, recipeId}).remove()`，再 `add`（等价于置顶）；随后统计超过 100 条的最旧记录并删除（按 `viewedAt` 升序 `limit(20)` 批量删）。
**索引**：`(openid, viewedAt desc)`。

### 3.4 `shopping_items` —— 采购清单（新）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `_openid` / `openid` | string | 用户 |
| `name` | string | 食材名 |
| `amount` | string | 用量，如「200g」（详情页按份数缩放后传入） |
| `checked` | boolean | 是否已购 |
| `recipeId` / `recipeTitle` | string | 来源菜谱；`recipeTitle` 决定列表分组（缺失时回退 `sources[0]`） |
| `servings` | number | 加入时的份数（1–20） |
| `sources` | string[] | 来源菜品名（去重，兼容旧数据） |
| `createdAt` / `updatedAt` | date | |

**并发安全**：勾选只 `doc(itemId).update({ checked })`，不再整数组覆盖。
**去重键**：有 `recipeId` 时 `(openid, recipeId, name)`，否则 `(openid, recipeTitle, name)`；append 时按此 upsert——已存在则更新数量并把 `checked` 复位，请求内同名食材先按 `name` 合并（同单位数值相加）。

### 3.5 `menu` —— 公共菜谱库

在 v1 字段基础上**只增不改**：

| 新增字段 | 类型 | 说明 |
| --- | --- | --- |
| `searchKey` | string | `title + tags` 的小写归一化串，搜索走它 |
| `isActive` | boolean | 下架用，查询一律带 `isActive: true` |
| `source` | string | `seed`（导入）/ `user`（用户发布） |
| `sourceOriginalRecipeId` | string | 用户发布来源 |
| `viewCount` / `favoriteCount` | number | 原子 `inc`，可做「热门」排序 |
| `updatedAt` | date | |

保留原有 `cuisine` / `majorCuisine` / `regionalCuisine` / `dishCategory` / `sceneCategory` / `ingredients` / `steps` / `tips`，它们已是分类浏览的索引字段。

### 3.6 `recipes` —— AI 生成结果（不再是收藏副本）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `_openid` / `createdBy` | string | 生成者 |
| `visibility` | string | `private`（默认）/ `public` |
| `title` / `tags` / `ingredients` / `steps` / `tips` / `cover` | | 同 v1 |
| `sourceIngredients` | string[] | 用户提供食材 |
| `sourceMenuId` | string | 若由公共菜谱改写而来 |
| `taskId` | string | 对应 `ai_tasks._id` |
| `mealPlanMeta` | object | 套餐任务附加信息 |
| `createdAt` | date | |

**变化**：收藏不再复制菜谱，`recipes` 只存 AI 产出；`toggleFavorite` 不再往这里写。

### 3.7 `ai_tasks` —— 任务队列

在 v1 基础上增加：

| 新增字段 | 类型 | 说明 |
| --- | --- | --- |
| `_openid` | string | 任务归属，供客户端读自己任务 |
| `errorCode` | string | 机器可读错误码（`MODEL_TIMEOUT` / `PARSE_ERROR` / `RATE_LIMIT` …） |
| `maxAttempts` | number | 建任务时固化（默认 3），避免改环境变量影响在途任务 |
| `leaseOwner` | string | 领取任务的 worker 标识（主机名+pid） |
| `leaseUntil` | date | 租约到期时间，过期可被重新领取 |

**领取逻辑**（替代 10 分钟时间戳猜测）：

```js
const leaseUntil = new Date(Date.now() + 5 * 60 * 1000)
const res = await db.collection('ai_tasks')
  .where({ _id: taskId, $or: [{ status: 'pending' }, { status: 'processing', leaseUntil: _.lt(new Date()) }] })
  .update({ data: { status: 'processing', leaseOwner, leaseUntil, attemptCount: _.inc(1), startedAt: new Date() } })
```

**生命周期**：`succeeded` / `failed` 且 `finishedAt` 早于 7 天的任务由清理脚本删除。

### 3.8 `original_recipes` —— 自创菜谱

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `_openid` / `createdBy` | string | 作者 |
| `author` | string | 展示名「我的自创」 |
| `title` / `tags` / `tips` | | |
| `ingredients` / `steps` | object[] | 结构同 menu |
| `images` | string[] | ≤9 张云存储 fileID |
| `cover` | string | 默认第一张 |
| `status` | string | `draft` / `published`（替代 `isPublished`） |
| `publishedMenuId` | string | 发布后镜像的 `menu._id` |
| `isOriginal` | boolean | 固定 `true` |
| `createdAt` / `updatedAt` | date | |

---

## 4. 索引清单

> 微信云开发只能在**控制台 → 数据库 → 索引管理**建索引（Node SDK 不提供建索引 API）。下面按表给出，字段顺序不要改。

| 集合 | 索引名 | 字段（升/降） | 用途 |
| --- | --- | --- | --- |
| `menu` | `idx_cuisine` | `cuisine` 升 | 首页按菜系取精选 |
| `menu` | `idx_major` | `majorCuisine` 升 | 分类页八大菜系 |
| `menu` | `idx_region` | `regionalCuisine` 升 | 地域筛选 |
| `menu` | `idx_dish` | `dishCategory` 升 | type 模式 |
| `menu` | `idx_scene` | `sceneCategory` 升 | scene 模式 |
| `menu` | `idx_active_created` | `isActive` 升 + `createdAt` 降 | 「最新菜谱」列表 |
| `favorites` | `idx_user_time` | `openid` 升 + `createdAt` 降 | 收藏列表翻页 |
| `favorites` | `idx_user_recipe` | `openid` 升 + `recipeId` 升 | 收藏查重 / 红心状态 |
| `history` | `idx_user_time` | `openid` 升 + `viewedAt` 降 | 历史列表 |
| `shopping_items` | `idx_user_checked` | `openid` 升 + `checked` 升 + `createdAt` 升 | 待购/已购两段 |
| `recipes` | `idx_creator_time` | `createdBy` 升 + `createdAt` 降 | 我的 AI 菜谱 |
| `recipes` | `idx_task` | `taskId` 升 | 任务回查 |
| `recipes` | `idx_source_menu` | `sourceMenuId` 升 | 去重与追溯 |
| `ai_tasks` | `idx_status_created` | `status` 升 + `createdAt` 升 | worker 领取（FIFO） |
| `ai_tasks` | `idx_lease` | `status` 升 + `leaseUntil` 升 | 僵死任务回收 |
| `ai_tasks` | `idx_creator_time` | `createdBy` 升 + `createdAt` 降 | 用户任务列表 |
| `original_recipes` | `idx_creator_time` | `createdBy` 升 + `updatedAt` 降 | 个人菜谱列表 |
| `original_recipes` | `idx_published` | `publishedMenuId` 升 | 发布回查 |

---

## 5. 权限（安全规则）

### 5.1 矩阵

| 集合 | 读 | 写 |
| --- | --- | --- |
| `menu` | 所有人（`isActive == true`） | 禁止（导入脚本走管理端密钥） |
| `recipes` | 本人 或 `visibility == 'public'` | 禁止 |
| `users` / `favorites` / `history` / `shopping_items` / `ai_tasks` | 仅本人 | 禁止 |
| `original_recipes` | 所有人 | 禁止 |

### 5.2 规则 JSON

`menu`：

```json
{ "read": "doc.isActive == true", "write": false }
```

`recipes`：

```json
{ "read": "doc._openid == auth.openid || doc.visibility == 'public'", "write": false }
```

`users` / `favorites` / `history` / `shopping_items` / `ai_tasks`：

```json
{ "read": "doc._openid == auth.openid", "write": false }
```

`original_recipes`：

```json
{ "read": true, "write": false }
```

> **前提**：所有云函数/worker 写入时必须带 `_openid`。这是 v1 最大的坑（P2），改造时逐个写入点补上。

---

## 6. 并发与查询范式

**原子计数**

```js
await db.collection('menu').doc(menuId).update({ data: { favoriteCount: _.inc(1) } })
```

**并发安全的勾选**（替代整数组覆盖）

```js
await db.collection('shopping_items').doc(itemId).update({
  data: { checked: nextChecked, updatedAt: new Date() }
})
```

**收藏幂等**

```js
const existed = await db.collection('favorites')
  .where({ openid, recipeId }).count()
if (existed.total > 0) return { success: true, already: true }
```

**分页**

```js
const pageSize = 20
const page = Math.max(1, Number(event.page) || 1)
const { data } = await db.collection('favorites')
  .where({ openid })
  .orderBy('createdAt', 'desc')
  .skip((page - 1) * pageSize)
  .limit(pageSize)
  .get()
```

**历史置顶 + 截断**

```js
await db.collection('history').where({ openid, recipeId }).remove()
await db.collection('history').add({ data: { _openid: openid, openid, recipeId, recipeKind, title, cover, viewedAt: new Date() } })
const stale = await db.collection('history').where({ openid }).orderBy('viewedAt', 'asc').skip(100).limit(20).get()
for (const doc of stale.data) await db.collection('history').doc(doc._id).remove()
```

---

## 7. v1 → v2 字段映射

| v1 | v2 |
| --- | --- |
| `users.savedRecipes: string[]` | `favorites` 集合（`openid` + `recipeId` + `snapshot`） |
| `users.savedRecipes` 里的 id 指向 `recipes` 副本 | `favorites.recipeId` 指向 `menu._id` / `recipes._id` / `original_recipes._id`，`recipeKind` 区分 |
| `users.shoppingList: object[]` | `shopping_items` 集合，每条一个文档 |
| `users.historyRecipes: object[]`（上限 50） | `history` 集合（上限 100，可翻页） |
| `toggleFavorite` 复制 menu → `recipes` | 只写 `favorites`，不再复制 |
| `getSavedRecipes` 云函数（按 id 批量查 recipes） | 直接读 `favorites` + 快照（或 join 目标集合补全） |
| `recipes.createdBy`（无 `_openid`） | `recipes._openid` + `createdBy` |
| `original_recipes.isPublished: boolean` | `original_recipes.status: 'draft' \| 'published'` |
| `ai_tasks` 无租约 | `leaseOwner` + `leaseUntil` |
| `menu` 无生命周期字段 | `isActive` + `viewCount` / `favoriteCount` + `searchKey` |

---

## 8. 从零建库（新环境按此执行）

前置：已开通云开发并记下环境 ID；`ai-worker/.env` 里已填 `CLOUDBASE_ENV_ID` / `CLOUDBASE_SECRET_ID` / `CLOUDBASE_SECRET_KEY`。

```bash
cd ai-worker
npm install              # 已有 node_modules 可跳过

# 1) 建集合：P2 之后统一建 v2 的 8 个（已存在自动跳过）；只有旧代码才需要建 v1 的 5 个
npm run setup-db -- --v2
# npm run setup-db          # 仅 v1 过渡期使用（5 个集合）

# 2) 导入 32,055 条菜谱（分批 100，可中断重跑，重跑自动跳过重复 _id）
npm run import-menu -- --file=../menu.json

# 先试导入 200 条看看格式：
npm run import-menu -- --file=../menu.json --limit=200 --dry-run
```

3）在云开发控制台按 §4 建索引（v2 全量清单）。
4）按 §5 给每个集合配安全规则。
5）给 `aiAssistant` 配环境变量（`CLOUDBASE_API_KEY` / `CLOUDBASE_ENV_ID` / `CLOUDBASE_AI_PROVIDER` / `CLOUDBASE_MODEL`）。
6）部署 14 个云函数（云端安装依赖）。
7）启动 `ai-worker`：`npm start`。
8）按 §9 验收。

> 辅助脚本：`npm run db-status` 体检各集合数量与字段、`npm run backfill-openid` 给历史文档补 `_openid`；`npm run check-functions` 可探测云函数是否已部署（其中 `getSavedRecipes` 一行已过时——该函数已删除，探测会显示未部署，属预期）。

> `menu.json` 是 JSON Lines（每行一条完整文档），脚本逐行流式读取，不会把 61 MB 一次性读进内存。

---

## 9. 验收清单

- [ ] `menu` 文档数 = 32,055（脚本结束会打印 `count()`）
- [ ] 首页 12 个菜系各取到 1 条；「更多」能翻页
- [ ] 搜索「番茄」「西红柿」都有结果，且不止 1000 条上限内的结果
- [ ] 收藏一道 menu 菜：`favorites` 多一条、`menu.favoriteCount` +1、`recipes` **没有**新增副本
- [ ] 重复点收藏两次：只有一条 `favorites`（幂等）
- [ ] 两台设备同时勾采购单：互不覆盖
- [ ] 浏览 101 道菜：`history` 只剩 100 条，最旧的被删
- [ ] 用户 A 读不到用户 B 的 `recipes`（`visibility: private`）
- [ ] worker 被 kill 后重启：`leaseUntil` 过期的任务能被重新领取
- [ ] 客户端直读 `users` 自己的文档成功（`_openid` 已写入）

---

## 10. 实施计划（代码改造）

| 阶段 | 内容 | 涉及文件 | 风险 |
| --- | --- | --- | --- |
| **P0（本次已交付）** | 设计文档、建集合脚本、menu 分批导入脚本、索引与权限清单 | `DATABASE.md`、`ai-worker/scripts/setup-db.js`、`ai-worker/scripts/import-menu.js` | 无，纯新增 |
| **P1 低风险（代码部分已完成）** | 所有写入点补 `_openid`（login / manageShoppingList / recordViewHistory / toggleFavorite / createAiTask / createOriginalRecipe / manageOriginalRecipe / ai-worker）；`recipes` 增加 `visibility: 'private'`。剩余：控制台按 §5 收紧权限、`menu` 查询统一带 `isActive` | 同上 | 低，需重新部署云函数 + 重启 worker |
| **P2 中风险（2026-11-24 代码已完成）** | 新建 `favorites` / `history` / `shopping_items` 三个集合的读写云函数（`toggleFavorite` 重写、新增 `getFavorites`、`manageShoppingList` 拆文档、`recordViewHistory`/`getViewHistory`/`clearViewHistory` 改造、`login` 负责 v1→v2 迁移），前端 4 个页面跟着改 | 8 个云函数 + `pages/recipe-favorites/recipe-favorites.vue`、`pages/shopping-list/index.vue`、`pages/user/history/index.vue`、`pages/recipe-detail/index.vue` | 中，已通过 `node --check` 与页面脚本校验，待联调 |
| **P3 收尾** | `search` 改用 `searchKey` + 分词、热门排序 `favoriteCount`、`ai_tasks` 7 天清理脚本、历史 100 条截断 | `cloudfunctions/search`、`ai-worker/scripts/cleanup.js` | 低 |

> P2 已完成：`getSavedRecipes` 已删除（收藏列表改由 `getFavorites` 分页读取），云函数总数从 14 降到 13。剩余待办：控制台建 §4 索引、按 §5 配安全规则、重新部署 8 个改动过的云函数。
