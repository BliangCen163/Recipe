# AI Worker

本地异步 AI Worker，负责消费 `ai_tasks` 集合中的任务，调用 CloudBase AI 网关生成菜谱，并将结果写回 `recipes` 与 `ai_tasks.resultRefs`。

支持的任务类型：`recipe`（单道菜谱）、`meal_plan`（一桌菜单）。

## 必填环境变量

```text
CLOUDBASE_ENV_ID=cloud1-xxxx
CLOUDBASE_SECRET_ID=你的 SecretId
CLOUDBASE_SECRET_KEY=你的 SecretKey
CLOUDBASE_API_KEY=CloudBase AI 网关的 API Key
```

`CLOUDBASE_AI_PROVIDER`（默认 `hunyuan`）与 `CLOUDBASE_MODEL`（默认 `hunyuan-turbos-latest`）可按需覆盖；`CLOUDBASE_API_URL` 可绕过自动拼接的网关地址。

## 推理参数

```text
AI_TEMPERATURE=0.2
AI_MIN_P=0.05
AI_TOP_P=0.85
AI_TOP_K=40
AI_REPEAT_PENALTY=1.1
AI_NUM_PREDICT=1200
```

## .env 文件

`ai-worker` 启动时会自动读取当前目录下的：

```text
.env
.env.local
```

优先级规则：

- 已经存在的系统环境变量优先
- `.env` 其次
- `.env.local` 只补充尚未设置的变量

把真实值写进 `.env` 后执行：

```text
npm start
```

## 启动

```text
cd ai-worker
npm start
```

## 可选 Worker 参数

```text
WORKER_POLL_INTERVAL_MS=3000
WORKER_STALE_TIMEOUT_MS=600000
WORKER_MAX_ATTEMPTS=3
```
