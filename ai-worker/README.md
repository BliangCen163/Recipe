# AI Worker

本地异步 AI Worker，负责消费 `ai_tasks` 集合中的任务，并将结果写回 `recipes` 与 `ai_tasks.resultRefs`。

## 必填环境变量

```text
CLOUDBASE_ENV_ID=cloud1-xxxx
CLOUDBASE_SECRET_ID=你的 SecretId
CLOUDBASE_SECRET_KEY=你的 SecretKey
AI_BACKEND=cloudbase
```

或切到本地模型：

```text
AI_BACKEND=openai_compatible
OPENAI_COMPAT_API_URL=http://127.0.0.1:11434/v1/chat/completions
OPENAI_COMPAT_MODEL=deepseek-r1:8b
OPENAI_COMPAT_API_KEY=
OPENAI_COMPAT_DISABLE_RESPONSE_FORMAT=true
```

推理参数继续复用项目现有变量，例如：

```text
AI_TEMPERATURE=0.2
AI_MIN_P=0.05
AI_TOP_P=0.85
AI_TOP_K=40
AI_REPEAT_PENALTY=1.1
AI_NUM_PREDICT=1200
```

## .env 文件

`ai-worker` 现在会在启动时自动读取当前目录下的：

```text
.env
.env.local
```

优先级规则：

- 已经存在的系统环境变量优先
- `.env` 其次
- `.env.local` 只补充尚未设置的变量

最简单的做法是在 [ai-worker/.env.example](/E:/code/AICAIPU/ai-worker/.env.example) 基础上复制一份 `.env`：

```text
cd ai-worker
copy .env.example .env
```

然后把真实值填进去，再执行：

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
