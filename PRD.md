# 微信小程序项目 PRD：做饭吧（AI辅助做菜工具）

## 0. 角色与任务背景
你现在是一位资深的前端全栈开发工程师（精通 uni-app + Vue3 + Vite + 微信云开发 CloudBase + 大模型 API 接入）。
本 PRD 描述了一个名为“做饭吧”的小程序 MVP（V1.0）版本。请严格按照本文档提供的数据结构、路由、功能逻辑来生成代码，确保项目能顺利编译为【微信小程序】。

## 1. 项目基础配置
*   **项目名称：** 做饭吧
*   **技术栈：** uni-app (基于 Vue 3 `<script setup>` 语法 + Vite) + Pinia (状态管理) + 微信云开发 (云函数)
*   **UI/UX 风格规范：** 参照“下厨房+”小程序。
    *   **样式预处理器：** SCSS / SASS
    *   **主色调：** 温暖食欲色（例如：`#FA6650` 番茄红）。
    *   **背景色：** 极简灰白（`#F7F8FA` 页面底色，卡片纯白 `#FFFFFF`）。
    *   **排版：** 大圆角（`border-radius: 16rpx`），无多余边框，依赖阴影和留白（Padding）做内容分割；大字号粗体标题，清晰的层级。
*   **账号体系：** 采用纯静默登录。通过 `uni.login` 获取 `code`，交由云函数换取 `OpenID` 作为唯一用户标识，**绝对不弹窗索要手机号**。

## 2. 页面路由树 (pages.json 配置参考)
*   **Tabbar 页面 (在 pages.json 中配置 tabBar)：**
    *   `pages/index/index` (首页：找菜谱 / 剩菜盲盒)
    *   `pages/ai-chat/index` (AI 烹饪台：对话式助手)
    *   `pages/user/index` (我的：个人中心与收藏)
*   **核心功能页 (非 tabBar，可作为分包或主包)：**
    *   `pages/fridge/index` (剩菜匹配：输入现有食材)
    *   `pages/recipe-detail/index` (菜谱详情页：结构化展示做法)
    *   `pages/shopping-list/index` (购物清单生成页)

## 3. 云数据库 Schema 设计 (CloudDB)
云数据库无需复杂建表，但建议包含以下集合（Collections）：

### 3.1 `users` 集合
*   `_id`: String (系统默认，可存 OpenID)
*   `openId`: String
*   `createdAt`: Date
*   `savedRecipes`: Array<String> (收藏的菜谱 ID 数组)
*   `history`: Array<String> (最近浏览的菜谱 ID 数组)

### 3.2 `recipes` 集合 (用于缓存 AI 生成的菜谱，避免重复调用浪费 API 额度)
*   `_id`: String
*   `title`: String (菜名)
*   `tags`: Array<String> (如：["快手菜", "微辣", "低脂"])
*   `ingredients`: Array<Object> `[{ name: "猪肉", amount: "200克", type: "main" }]`
*   `steps`: Array<Object> `[{ stepNum: 1, desc: "切块", timerMinute: 0 }]`
*   `aiTips`: String (AI的避坑提示)
*   `source`: String (值为 "ai_generated")

## 4. 核心功能模块详细逻辑

### 模块一：剩菜盲盒匹配 (触发点：首页 `pages/index` -> 进入 `pages/fridge`)
*   **UI 交互：** 提供常见食材标签供快速点击，同时支持输入框手动输入。
*   **业务逻辑：** 
    1. 收集用户选中的食材列表。
    2. 调用微信云开发云函数 `callAiRecipe`。
    3. 云函数内向 LLM 发送 System Prompt，强制要求大模型返回 **JSON 格式**的菜谱列表。
    4. 前端拿到响应后，使用 Vue 3 的 `v-for` 渲染 2-3 个推荐菜谱卡片。

### 模块二：AI 菜谱详情页 (`pages/recipe-detail`)
*   **UI 组成：** 
    *   顶部大图。
    *   **精准食材表：** 抛弃传统“少许/适量”，要求 AI 必须量化。提供一键【加入购物清单】按钮。
    *   **步骤展示区：** 每一步作为一个独立卡片组件 `<StepCard />`。
*   **特色功能 1：内置计时器。** 
    *   如果 `steps[x].timerMinute > 0`，前端在该步骤旁渲染“开始倒计时”按钮。使用 Vue 3 的 `ref` 或 `reactive` 管理倒计时状态，结束时调用 `uni.vibrateLong()` 震动提醒。
*   **特色功能 2：AI 救场悬浮窗。** 
    *   页面右下角固定 FAB 按钮：“翻车求救”。
    *   点击弹出半屏弹窗（可自定义 `<HalfScreenDialog />` 组件），用户输入求救信息，调用 AI 问答接口给出挽救方案。

### 模块三：AI 烹饪台 (`pages/ai-chat`)
*   **UI 交互：** 类似微信聊天的气泡流。底部为输入框区（MVP 版本先实现纯文本输入，预留语音输入接口）。
*   **业务设定：** 调用云函数时注入 System Prompt：“你是一个30年经验的米其林大厨，正在指导零基础小白。回答必须极其通俗，禁止专业术语。拒绝与烹饪无关的问题。”

## 5. 接口与开发规范
1.  **架构划分：** 严格按照 Vue 3 组合式 API (`<script setup>`) 编写，复用逻辑提取为 `hooks` (如 `useTimer.ts`, `useWechatLogin.ts`)。
2.  **安全性：** 所有与大模型通信的 API Key 必须放在**微信云函数**的环境变量中，绝不能写在 uni-app 前端代码里。
3.  **状态管理：** 用户的基础信息、系统配置项建议通过 Pinia 管理。

## 6. 第一阶段（MVP）开发任务指令
请按照以下顺序开始干活：
1.  **初始化项目：** 帮我搭建基于 `uni-app` (Vue 3 + Vite) 的项目结构，生成 `pages.json`，并配置好基础的 SCSS 变量。
2.  **UI 骨架构建：** 编写三个 Tabbar 页面（首页、AI聊天、我的）的 `.vue` 文件，使用 mock 数据和占位组件，先把界面渲染出来，让我确认“下厨房+”的视觉风格是否还原到位。
3.  等待我确认静态 UI 无误后，再进行云函数体系搭建和 AI 接口的对接。