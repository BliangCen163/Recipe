const fs = require('fs')
const path = require('path')
const http = require('http')
const https = require('https')
const { URL } = require('url')
const cloudbase = require('@cloudbase/node-sdk')

const DEFAULT_PROVIDER = 'hunyuan'
const DEFAULT_MODEL = 'hunyuan-turbos-latest'
const DEFAULT_OPENAI_COMPAT_MODEL = 'gpt-4o-mini'
const DEFAULT_POLL_INTERVAL_MS = 3000
const DEFAULT_STALE_TIMEOUT_MS = 10 * 60 * 1000
const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_TASK_LOG_DETAIL = 'verbose'
const DEFAULT_OLLAMA_API_URL = 'http://127.0.0.1:11434/api/generate'
const DEFAULT_OLLAMA_VISION_MODEL = 'qwen3.5:4b'
const IMAGE_RECOGNITION_PROMPT = '你是一个专业的后厨食材识别专家。请识别提供的图片中包含的所有原始烹饪食材。必须仅输出一个 JSON 格式的字符串数组，例如 ["西红柿", "鸡蛋", "五花肉"]。绝对不要输出任何其他解释性文字或 Markdown 标记。'

function stripWrappingQuotes(value) {
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1)
	}

	return value
}

function loadEnvFile(filePath) {
	if (!fs.existsSync(filePath)) {
		return
	}

	const content = fs.readFileSync(filePath, 'utf8')
	const lines = content.split(/\r?\n/)

	for (const line of lines) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith('#')) {
			continue
		}

		const separatorIndex = trimmed.indexOf('=')
		if (separatorIndex <= 0) {
			continue
		}

		const key = trimmed.slice(0, separatorIndex).trim()
		if (!key || process.env[key] !== undefined) {
			continue
		}

		const rawValue = trimmed.slice(separatorIndex + 1).trim()
		process.env[key] = stripWrappingQuotes(rawValue)
	}
}

function bootstrapEnv() {
	const cwd = process.cwd()
	loadEnvFile(path.join(cwd, '.env'))
	loadEnvFile(path.join(cwd, '.env.local'))
}

bootstrapEnv()

function readTextEnv(...keys) {
	for (const key of keys) {
		const raw = process.env[key]
		if (raw === undefined || raw === null) {
			continue
		}

		const value = String(raw).trim()
		if (value) {
			return value
		}
	}

	return ''
}

function readNumberEnv(...keys) {
	for (const key of keys) {
		const raw = process.env[key]
		if (raw === undefined || raw === null || raw === '') {
			continue
		}

		const value = Number(raw)
		if (!Number.isNaN(value)) {
			return value
		}
	}

	return undefined
}

function formatBytes(bytes) {
	const value = Number(bytes) || 0
	if (value < 1024) {
		return `${value} B`
	}

	if (value < 1024 * 1024) {
		return `${(value / 1024).toFixed(1)} KB`
	}

	return `${(value / (1024 * 1024)).toFixed(2)} MB`
}

function createTaskLogger(task) {
	const startedAt = Date.now()
	const checkpoints = new Map()
	const detail = readTextEnv('WORKER_TASK_LOG_DETAIL') || DEFAULT_TASK_LOG_DETAIL
	const prefix = `[worker][${task.type}][${task._id}]`

	return {
		point(name, extra = '') {
			const now = Date.now()
			const elapsed = now - startedAt
			checkpoints.set(name, now)
			if (detail === 'silent') {
				return
			}
			console.log(`${prefix} ${name} +${elapsed}ms${extra ? ` | ${extra}` : ''}`)
		},
		step(name, fromName, extra = '') {
			const now = Date.now()
			const from = checkpoints.get(fromName) || startedAt
			const elapsed = now - from
			if (detail === 'silent') {
				return
			}
			console.log(`${prefix} ${name} ${elapsed}ms${extra ? ` | ${extra}` : ''}`)
		},
		total(extra = '') {
			const elapsed = Date.now() - startedAt
			console.log(`${prefix} total ${elapsed}ms${extra ? ` | ${extra}` : ''}`)
		}
	}
}

function truncateForLog(value, maxLength = 400) {
	const text = typeof value === 'string'
		? value
		: JSON.stringify(value)

	if (!text) {
		return ''
	}

	return text.length > maxLength
		? `${text.slice(0, maxLength)}...(truncated)`
		: text
}

function parseThinkValue(raw) {
	if (!raw) {
		return undefined
	}

	const normalized = String(raw).trim().toLowerCase()
	if (!normalized) {
		return undefined
	}

	if (normalized === 'true') {
		return true
	}

	if (normalized === 'false') {
		return false
	}

	return normalized
}

function buildInferenceOptions() {
	const options = {
		temperature: readNumberEnv('AI_TEMPERATURE', 'OPENAI_COMPAT_TEMPERATURE')
	}

	const optionalMappings = [
		['min_p', ['AI_MIN_P', 'OPENAI_COMPAT_MIN_P']],
		['top_p', ['AI_TOP_P', 'OPENAI_COMPAT_TOP_P']],
		['top_k', ['AI_TOP_K', 'OPENAI_COMPAT_TOP_K']],
		['repeat_penalty', ['AI_REPEAT_PENALTY', 'OPENAI_COMPAT_REPEAT_PENALTY']],
		['presence_penalty', ['AI_PRESENCE_PENALTY', 'OPENAI_COMPAT_PRESENCE_PENALTY']],
		['frequency_penalty', ['AI_FREQUENCY_PENALTY', 'OPENAI_COMPAT_FREQUENCY_PENALTY']],
		['num_predict', ['AI_NUM_PREDICT', 'OPENAI_COMPAT_NUM_PREDICT']],
		['max_tokens', ['AI_MAX_TOKENS', 'OPENAI_COMPAT_MAX_TOKENS']],
		['seed', ['AI_SEED', 'OPENAI_COMPAT_SEED']]
	]

	for (const [field, keys] of optionalMappings) {
		const value = readNumberEnv(...keys)
		if (value !== undefined) {
			options[field] = value
		}
	}

	if (options.temperature === undefined) {
		options.temperature = 0.7
	}

	const think = parseThinkValue(readTextEnv('AI_THINK', 'OPENAI_COMPAT_THINK'))
	if (think !== undefined) {
		options.think = think
	}

	const reasoningEffort = readTextEnv('AI_REASONING_EFFORT', 'OPENAI_COMPAT_REASONING_EFFORT')
	if (reasoningEffort) {
		options.reasoning_effort = reasoningEffort
	}

	return options
}

function resolveVisionConfig() {
	return {
		apiUrl: readTextEnv('OLLAMA_VISION_API_URL', 'OLLAMA_API_URL') || DEFAULT_OLLAMA_API_URL,
		model: readTextEnv('OLLAMA_VISION_MODEL') || DEFAULT_OLLAMA_VISION_MODEL
	}
}

function resolveAiConfig(backendOverride) {
	const backend = String(backendOverride || '').trim()

	if (!backend) {
		throw new Error('任务未指定 AI 后端')
	}

	if (backend === 'openai_compatible') {
		return {
			backend,
			apiUrl: readTextEnv('OPENAI_COMPAT_API_URL', 'LOCAL_OPENAI_API_URL'),
			model: readTextEnv('OPENAI_COMPAT_MODEL', 'LOCAL_OPENAI_MODEL') || DEFAULT_OPENAI_COMPAT_MODEL,
			apiKey: readTextEnv('OPENAI_COMPAT_API_KEY', 'LOCAL_OPENAI_API_KEY'),
			supportsJsonObject: readTextEnv('OPENAI_COMPAT_DISABLE_RESPONSE_FORMAT') !== 'true'
		}
	}

	if (backend !== 'cloudbase') {
		throw new Error(`不支持的 AI 后端：${backend}`)
	}

	const envId = readTextEnv('CLOUDBASE_ENV_ID', 'TCB_ENV_ID', 'TCB_ENV')
	const provider = readTextEnv('CLOUDBASE_AI_PROVIDER') || DEFAULT_PROVIDER

	return {
		backend: 'cloudbase',
		apiUrl: readTextEnv('CLOUDBASE_API_URL') || (
			envId
				? `https://${envId}.api.tcloudbasegateway.com/v1/ai/${provider}/v1/chat/completions`
				: ''
		),
		model: readTextEnv('CLOUDBASE_MODEL') || DEFAULT_MODEL,
		apiKey: readTextEnv('CLOUDBASE_API_KEY'),
		supportsJsonObject: true
	}
}

function assertBackendReady(backend) {
	if (backend === 'cloudbase') {
		const envId = readTextEnv('CLOUDBASE_ENV_ID', 'TCB_ENV_ID', 'TCB_ENV')
		const apiUrl = readTextEnv('CLOUDBASE_API_URL')
		const apiKey = readTextEnv('CLOUDBASE_API_KEY')

		if (!apiUrl && !envId) {
			throw new Error('任务指定了 cloudbase，但未配置 CLOUDBASE_ENV_ID 或 CLOUDBASE_API_URL')
		}

		if (!apiKey) {
			throw new Error('任务指定了 cloudbase，但未配置 CLOUDBASE_API_KEY')
		}

		return
	}

	if (backend === 'openai_compatible') {
		const apiUrl = readTextEnv('OPENAI_COMPAT_API_URL', 'LOCAL_OPENAI_API_URL')
		if (!apiUrl) {
			throw new Error('任务指定了 openai_compatible，但未配置 OPENAI_COMPAT_API_URL 或 LOCAL_OPENAI_API_URL')
		}

		return
	}

	throw new Error(`任务未指定有效的 AI 后端：${backend || 'empty'}`)
}

function buildRecipePrompt(ingredients) {
	return [
		'你是一个米其林星级大厨。',
		`用户现在有这些食材：${ingredients.join('、')}。`,
		'请仅根据这些食材（可包含油盐酱醋等基础调料）即兴创作一个详细菜谱。',
		'必须以 JSON 格式返回，严禁包含任何多余文字。',
		'格式要求：',
		'{',
		'  "title": "菜名",',
		'  "tags": ["标签1", "标签2"],',
		'  "ingredients": [{"name": "食材名", "amount": "精准克数/数量"}],',
		'  "steps": [{"stepNum": 1, "desc": "步骤描述", "timerMinute": 0}],',
		'  "tips": "大厨的小贴士"',
		'}'
	].join('\n')
}

function buildMealPlanPrompt({ diners, dishCount, cuisine, preferences, availableIngredients }) {
	const cuisineText = cuisine
		? `菜系要求：整体风格优先贴近${cuisine}。`
		: '菜系要求：不限定菜系，可按整体搭配自由发挥。'

	return [
		'你是一个米其林主厨兼营养师。',
		`用户要求：为 ${diners} 人做 ${dishCount} 道菜。`,
		`偏好：${preferences || '无特殊要求'}。`,
		`已有食材：${availableIngredients || '无特别指定'}。`,
		cuisineText,
		'请设计一桌荤素搭配合理的菜单。',
		'必须返回一个 JSON 数组，数组中每个对象是一道菜。',
		'每道菜结构必须严格为：{"title":"菜名","tags":["标签1"],"ingredients":[{"name":"食材名","amount":"数量"}],"steps":[{"stepNum":1,"desc":"步骤描述","timerMinute":0}],"tips":"提示"}。',
		'绝不要返回其他文本、解释、Markdown 或代码块。'
	].join('\n')
}

function sendJsonRequest(url, headers, body) {
	return new Promise((resolve, reject) => {
		const target = new URL(url)
		const transport = target.protocol === 'http:' ? http : https
		const request = transport.request(
			target,
			{
				method: 'POST',
				headers
			},
			(response) => {
				let raw = ''
				response.setEncoding('utf8')
				response.on('data', (chunk) => {
					raw += chunk
				})
				response.on('end', () => {
					if (response.statusCode >= 200 && response.statusCode < 300) {
						try {
							resolve(JSON.parse(raw))
						} catch (error) {
							reject(new Error(`AI 响应不是合法 JSON：${error.message}`))
						}
						return
					}

					reject(new Error(`AI 接口请求失败（${response.statusCode}）：${raw}`))
				})
			}
		)

		request.on('error', reject)
		request.write(JSON.stringify(body))
		request.end()
	})
}

function extractJsonCandidate(content) {
	const trimmed = content.trim()
	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
	if (fenced) {
		return fenced[1].trim()
	}

	const candidates = []
	const objectStart = trimmed.indexOf('{')
	const objectEnd = trimmed.lastIndexOf('}')
	if (objectStart !== -1 && objectEnd > objectStart) {
		candidates.push(trimmed.slice(objectStart, objectEnd + 1))
	}

	const arrayStart = trimmed.indexOf('[')
	const arrayEnd = trimmed.lastIndexOf(']')
	if (arrayStart !== -1 && arrayEnd > arrayStart) {
		candidates.push(trimmed.slice(arrayStart, arrayEnd + 1))
	}

	for (const candidate of [trimmed, ...candidates]) {
		try {
			JSON.parse(candidate)
			return candidate
		} catch (error) {
			// ignore
		}
	}

	throw new Error('AI 返回内容无法解析为 JSON')
}

function unwrapJson(content) {
	if (!content || typeof content !== 'string') {
		throw new Error('AI 返回内容为空')
	}

	return extractJsonCandidate(content)
}

function normalizeRecipe(recipe, fallbackIngredients, fallbackTitle) {
	return {
		title: recipe.title || fallbackTitle || 'AI 私房菜',
		tags: Array.isArray(recipe.tags) && recipe.tags.length ? recipe.tags : ['家常菜'],
		ingredients:
			Array.isArray(recipe.ingredients) && recipe.ingredients.length
				? recipe.ingredients.map((item) => ({
					name: item?.name || '未知食材',
					amount: item?.amount || '适量'
				}))
				: fallbackIngredients.map((name) => ({ name, amount: '适量' })),
		steps:
			Array.isArray(recipe.steps) && recipe.steps.length
				? recipe.steps.map((item, index) => ({
					stepNum: Number(item?.stepNum) || index + 1,
					desc: item?.desc || '按常规方式处理食材并烹饪至熟。',
					timerMinute: Number(item?.timerMinute) || 0
				}))
				: [
					{
						stepNum: 1,
						desc: '将食材洗净切好后，按个人口味烹饪至熟。',
						timerMinute: 0
					}
				],
		tips: recipe.tips || '出锅前先试味，再按口味微调。'
	}
}

function extractContent(result) {
	return result && result.choices && result.choices[0] && result.choices[0].message
		? result.choices[0].message.content || ''
		: ''
}

function summarizeUsage(usage) {
	if (!usage || typeof usage !== 'object') {
		return 'usage=none'
	}

	const promptTokens = usage.prompt_tokens ?? usage.input_tokens ?? usage.prompt_eval_count ?? ''
	const completionTokens = usage.completion_tokens ?? usage.output_tokens ?? usage.eval_count ?? ''
	const totalTokens = usage.total_tokens ?? (
		Number(promptTokens || 0) + Number(completionTokens || 0)
	)

	return `usage prompt=${promptTokens || 0} completion=${completionTokens || 0} total=${totalTokens || 0}`
}

function normalizeStringArray(value) {
	if (!Array.isArray(value)) {
		return []
	}

	const seen = new Set()
	const result = []

	for (const item of value) {
		const normalized = String(item || '').trim()
		if (!normalized || seen.has(normalized)) {
			continue
		}

		seen.add(normalized)
		result.push(normalized)
	}

	return result
}

function extractIngredientNamesFromObjects(items) {
	if (!Array.isArray(items)) {
		return []
	}

	const names = items.map((item) => {
		if (typeof item === 'string') {
			return item
		}

		if (!item || typeof item !== 'object') {
			return ''
		}

		return item.name || item.名称 || item.食材 || item.物体 || item.label || ''
	})

	return normalizeStringArray(names)
}

function extractIngredientNamesFromRecord(record) {
	if (!record || typeof record !== 'object' || Array.isArray(record)) {
		return []
	}

	return normalizeStringArray(Object.values(record))
}

function hasErrorLikeFields(record) {
	if (!record || typeof record !== 'object' || Array.isArray(record)) {
		return false
	}

	return ['error', 'errors', 'message', 'warning', 'detail'].some((key) => {
		const value = record[key]
		return typeof value === 'string' && value.trim()
	})
}

function getErrorLikeMessage(record) {
	if (!record || typeof record !== 'object' || Array.isArray(record)) {
		return ''
	}

	for (const key of ['error', 'errors', 'message', 'warning', 'detail']) {
		const value = record[key]
		if (typeof value === 'string' && value.trim()) {
			return value.trim()
		}
	}

	return ''
}

function extractIngredientNamesFromJsonLikeString(content) {
	if (typeof content !== 'string' || !content.trim()) {
		return []
	}

	const matches = []
	const pattern = /:\s*"((?:[^"\\]|\\.)*)"/g
	let matched = pattern.exec(content)

	while (matched) {
		try {
			matches.push(JSON.parse(`"${matched[1]}"`))
		} catch (error) {
			matches.push(matched[1])
		}
		matched = pattern.exec(content)
	}

	return normalizeStringArray(matches)
}

function isEmptyPlainObject(value) {
	return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0
}

function toBuffer(fileContent) {
	if (Buffer.isBuffer(fileContent)) {
		return fileContent
	}

	if (typeof fileContent === 'string') {
		return Buffer.from(fileContent)
	}

	throw new Error('下载的图片内容为空')
}

async function downloadImageAsBase64(fileID) {
	const downloadResult = await app.downloadFile({ fileID })
	const fileBuffer = toBuffer(downloadResult && downloadResult.fileContent)

	if (!fileBuffer.length) {
		throw new Error('下载的图片内容为空')
	}

	// Ollama images 字段需要纯净的 base64 数据，不能带 data:image/... 前缀。
	return {
		base64: fileBuffer.toString('base64'),
		byteLength: fileBuffer.length
	}
}

function parseRecognizedIngredients(response) {
	const candidates = []

	if (typeof response?.response === 'string' && response.response.trim()) {
		candidates.push(response.response.trim())
	}

	if (Array.isArray(response?.response)) {
		candidates.push(response.response)
	}

	if (response?.response && typeof response.response === 'object' && !Array.isArray(response.response)) {
		candidates.push(response.response)
	}

	if (typeof response?.message?.content === 'string' && response.message.content.trim()) {
		candidates.push(response.message.content.trim())
	}

	if (Array.isArray(response?.message?.content)) {
		candidates.push(response.message.content)
	}

	if (typeof response?.thinking === 'string' && response.thinking.trim()) {
		candidates.push(response.thinking.trim())
	}

	if (response?.thinking && typeof response.thinking === 'object' && !Array.isArray(response.thinking)) {
		candidates.push(response.thinking)
	}

	if (!candidates.length) {
		throw new Error(`Ollama 未返回识别结果，原始响应：${truncateForLog(response)}`)
	}

	let parsed = null
	let lastError = null

	for (const candidate of candidates) {
		try {
			if (Array.isArray(candidate)) {
				parsed = candidate
			} else if (candidate && typeof candidate === 'object') {
				if (isEmptyPlainObject(candidate)) {
					throw new Error('未识别到食物，请换一张包含食材的图片再试')
				}

				if (hasErrorLikeFields(candidate)) {
					throw new Error(`视觉模型返回错误：${getErrorLikeMessage(candidate)}`)
				}

				if (Array.isArray(candidate.ingredients)) {
					parsed = candidate.ingredients
				} else if (Array.isArray(candidate.result)) {
					parsed = candidate.result
				} else {
					parsed = candidate
				}
			} else if (typeof candidate === 'string') {
				const rawValues = extractIngredientNamesFromJsonLikeString(candidate)
				if (rawValues.length > 1) {
					return rawValues
				}

				parsed = JSON.parse(unwrapJson(candidate))
				if (isEmptyPlainObject(parsed)) {
					throw new Error('未识别到食物，请换一张包含食材的图片再试')
				}

				if (hasErrorLikeFields(parsed)) {
					throw new Error(`视觉模型返回错误：${getErrorLikeMessage(parsed)}`)
				}
			}

			const normalizedDirect = normalizeStringArray(parsed)
			if (normalizedDirect.length) {
				return normalizedDirect
			}

			if (parsed && typeof parsed === 'object') {
				const nested = normalizeStringArray(
					parsed.ingredients ||
					parsed.result ||
					parsed.data ||
					parsed.name ||
					parsed.names
				)
				if (nested.length) {
					return nested
				}

				const objectNames = extractIngredientNamesFromObjects(
					parsed['视觉分析'] ||
					parsed.visual_analysis ||
					parsed.items ||
					parsed.ingredients ||
					parsed.name ||
					parsed.names
				)
				if (objectNames.length) {
					return objectNames
				}

				const recordValues = extractIngredientNamesFromRecord(parsed)
				if (recordValues.length) {
					return recordValues
				}
			}
		} catch (error) {
			lastError = error
		}
	}

	if (lastError) {
		throw new Error(`识图结果解析失败：${lastError.message}，原始响应：${truncateForLog(response)}`)
	}

	throw new Error(`识图结果不是有效的食材数组，原始响应：${truncateForLog(response)}`)
}

async function recognizeIngredientsFromImage(base64Image, logger) {
	const visionConfig = resolveVisionConfig()
	const response = await sendJsonRequest(
		visionConfig.apiUrl,
		{
			'Content-Type': 'application/json'
		},
		{
			model: visionConfig.model,
			prompt: IMAGE_RECOGNITION_PROMPT,
			images: [base64Image],
			stream: false,
			format: 'json',
			think: false
		}
	)

	if (logger) {
		logger.point('vision_response_received', `response=${truncateForLog(response)}`)
	}

	return parseRecognizedIngredients(response)
}

async function callAi(payload, type, logger) {
	const aiConfig = resolveAiConfig(payload.backend)

	if (!aiConfig.apiUrl) {
		throw new Error(aiConfig.backend === 'openai_compatible'
			? '未配置 OPENAI_COMPAT_API_URL 或 LOCAL_OPENAI_API_URL'
			: '未配置 CLOUDBASE_ENV_ID 或 CLOUDBASE_API_URL')
	}

	if (aiConfig.backend === 'cloudbase' && !aiConfig.apiKey) {
		throw new Error('未配置 CLOUDBASE_API_KEY 环境变量')
	}

	const requestPayload = {
		model: aiConfig.model,
		...buildInferenceOptions(),
		messages: [
			{
				role: 'system',
				content: type === 'meal_plan'
					? '你是一个严格按要求输出 JSON 的米其林主厨兼营养师。'
					: '你是一个严格按要求输出 JSON 的米其林星级大厨。'
			},
			{
				role: 'user',
				content: type === 'meal_plan'
					? buildMealPlanPrompt(payload)
					: buildRecipePrompt(payload.ingredients)
			}
		]
	}

	if (type === 'recipe' && aiConfig.supportsJsonObject) {
		requestPayload.response_format = { type: 'json_object' }
	}

	const headers = {
		'Content-Type': 'application/json'
	}

	if (aiConfig.apiKey) {
		headers.Authorization = `Bearer ${aiConfig.apiKey}`
	}

	const requestStartedAt = Date.now()
	const response = await sendJsonRequest(aiConfig.apiUrl, headers, requestPayload)
	const requestElapsed = Date.now() - requestStartedAt
	const content = extractContent(response)
	if (logger) {
		const contentLength = typeof content === 'string'
			? Buffer.byteLength(content, 'utf8')
			: 0
		logger.point(
			`${type}_ai_response`,
			`elapsed=${requestElapsed}ms content=${formatBytes(contentLength)} ${summarizeUsage(response?.usage)}`
		)
	}
	return JSON.parse(unwrapJson(content))
}

function splitIngredients(text) {
	return text
		? String(text).split(/[、，,\s]+/).map((item) => item.trim()).filter(Boolean)
		: []
}

function buildRecipePreview(recipe, recipeId) {
	return {
		_id: recipeId,
		title: recipe.title,
		tags: recipe.tags
	}
}

function getCollectionDate(value) {
	if (!value) {
		return null
	}

	if (value instanceof Date) {
		return value
	}

	if (typeof value.toDate === 'function') {
		return value.toDate()
	}

	const parsed = new Date(value)
	return Number.isNaN(parsed.getTime()) ? null : parsed
}

function unwrapDocData(result) {
	const data = result && result.data !== undefined ? result.data : result
	if (Array.isArray(data)) {
		return data[0] || null
	}

	return data || null
}

function getCloudbaseApp() {
	const env = readTextEnv('CLOUDBASE_ENV_ID', 'TCB_ENV_ID', 'TCB_ENV')
	const secretId = readTextEnv('CLOUDBASE_SECRET_ID', 'TCB_SECRET_ID')
	const secretKey = readTextEnv('CLOUDBASE_SECRET_KEY', 'TCB_SECRET_KEY')

	if (!env || !secretId || !secretKey) {
		throw new Error('ai-worker 缺少 CloudBase 数据库连接配置，请设置 CLOUDBASE_ENV_ID、CLOUDBASE_SECRET_ID、CLOUDBASE_SECRET_KEY')
	}

	return cloudbase.init({
		env,
		secretId,
		secretKey
	})
}

const app = getCloudbaseApp()
const db = app.database()
const _ = db.command
const pollIntervalMs = readNumberEnv('WORKER_POLL_INTERVAL_MS') || DEFAULT_POLL_INTERVAL_MS
const staleTimeoutMs = readNumberEnv('WORKER_STALE_TIMEOUT_MS') || DEFAULT_STALE_TIMEOUT_MS
const maxAttempts = readNumberEnv('WORKER_MAX_ATTEMPTS') || DEFAULT_MAX_ATTEMPTS

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

async function markTaskProcessing(taskId) {
	const result = await db.collection('ai_tasks').where({
		_id: taskId,
		status: 'pending'
	}).update({
		status: 'processing',
		startedAt: new Date(),
		errorMessage: '',
		finishedAt: null,
		attemptCount: _.inc(1)
	})

	return Number(result.updated) > 0
}

async function resetStaleProcessingTasks() {
	const { data } = await db.collection('ai_tasks').where({
		status: 'processing'
	}).limit(20).get()

	if (!Array.isArray(data) || !data.length) {
		return
	}

	const now = Date.now()
	for (const task of data) {
		const startedAt = getCollectionDate(task.startedAt)
		if (!startedAt) {
			continue
		}

		if (now - startedAt.getTime() < staleTimeoutMs) {
			continue
		}

		await db.collection('ai_tasks').where({
			_id: task._id,
			status: 'processing'
		}).update({
			status: 'pending',
			errorMessage: '检测到上次处理超时，任务已重新入队',
			startedAt: null,
			finishedAt: null
		})
	}
}

async function fetchPendingTask() {
	const imageTaskResult = await db.collection('ai_tasks').where({
		status: 'pending',
		type: 'recognize_image'
	}).orderBy('createdAt', 'asc').limit(1).get()

	if (Array.isArray(imageTaskResult.data) && imageTaskResult.data.length) {
		return imageTaskResult.data[0]
	}

	const { data } = await db.collection('ai_tasks').where({
		status: 'pending'
	}).orderBy('createdAt', 'asc').limit(1).get()

	return Array.isArray(data) && data.length ? data[0] : null
}

async function findExistingRecipesByTaskId(taskId, limit = 10) {
	const { data } = await db.collection('recipes').where({
		taskId
	}).orderBy('createdAt', 'asc').limit(limit).get()

	return Array.isArray(data) ? data : []
}

async function saveRecipe(normalized, createdBy, sourceIngredients, mealPlanMeta, taskId) {
	const payload = {
		...normalized,
		sourceIngredients,
		_openid: createdBy || '',
		visibility: 'private',
		createdBy,
		createdAt: new Date(),
		taskId: taskId || ''
	}

	if (mealPlanMeta) {
		payload.mealPlanMeta = mealPlanMeta
	}

	const result = await db.collection('recipes').add(payload)
	return result.id
}

async function processRecipeTask(task, logger) {
	const existingRecipes = await findExistingRecipesByTaskId(task._id, 1)
	if (existingRecipes.length) {
		logger.step('existing_recipe_hit', 'task_claimed')
		const existing = existingRecipes[0]
		return {
			result: normalizeRecipePreview(existing),
			resultRefs: { recipeId: existing._id }
		}
	}

	const payload = task.payload || {}
	const ingredients = Array.isArray(payload.ingredients)
		? payload.ingredients.map((item) => String(item).trim()).filter(Boolean)
		: []

	if (!ingredients.length) {
		throw new Error('任务缺少食材列表')
	}

	logger.point('recipe_ai_start', `ingredients=${ingredients.length}`)
	const parsed = await callAi({
		ingredients,
		backend: task.backend
	}, 'recipe', logger)
	logger.step('recipe_ai_done', 'recipe_ai_start')
	const normalized = normalizeRecipe(parsed, ingredients, 'AI 私房菜')
	logger.point('recipe_save_start')
	const recipeId = await saveRecipe(normalized, task.createdBy || '', ingredients, null, task._id)
	logger.step('recipe_save_done', 'recipe_save_start', `recipeId=${recipeId}`)

	return {
		result: buildRecipePreview(normalized, recipeId),
		resultRefs: { recipeId }
	}
}

async function processMealPlanTask(task, logger) {
	const existingRecipes = await findExistingRecipesByTaskId(task._id, Number(task.payload?.dishCount) || 8)
	if (existingRecipes.length) {
		logger.step('existing_meal_plan_hit', 'task_claimed', `recipes=${existingRecipes.length}`)
		return {
			result: existingRecipes.map((recipe) => normalizeRecipePreview(recipe)),
			resultRefs: { recipeIds: existingRecipes.map((recipe) => recipe._id) }
		}
	}

	const payload = task.payload || {}
	const diners = Number(payload.diners) || 2
	const dishCount = Number(payload.dishCount) || 3
	const cuisine = String(payload.cuisine || '').trim()
	const preferences = String(payload.preferences || '').trim()
	const availableIngredients = String(payload.availableIngredients || '').trim()
	const sourceIngredients = splitIngredients(availableIngredients)

	logger.point('meal_plan_ai_start', `dishCount=${dishCount}`)
	const parsed = await callAi({
		diners,
		dishCount,
		cuisine,
		preferences,
		availableIngredients,
		backend: task.backend
	}, 'meal_plan', logger)
	logger.step('meal_plan_ai_done', 'meal_plan_ai_start')

	const recipes = Array.isArray(parsed)
		? parsed
		: Array.isArray(parsed.recipes)
			? parsed.recipes
			: []

	if (!recipes.length) {
		throw new Error('AI 未返回有效套餐数据')
	}

	const mealPlanMeta = {
		diners,
		dishCount,
		cuisine,
		preferences
	}

	const recipeIds = []
	const result = []

	logger.point('meal_plan_save_start')
	for (const recipe of recipes.slice(0, dishCount)) {
		const normalized = normalizeRecipe(recipe, sourceIngredients, 'AI 定制菜')
		const recipeId = await saveRecipe(normalized, task.createdBy || '', sourceIngredients, mealPlanMeta, task._id)
		recipeIds.push(recipeId)
		result.push(buildRecipePreview(normalized, recipeId))
	}
	logger.step('meal_plan_save_done', 'meal_plan_save_start', `saved=${recipeIds.length}`)

	return {
		result,
		resultRefs: { recipeIds }
	}
}

async function processRecognizeImageTask(task, logger) {
	const payload = task.payload || {}
	const fileID = String(payload.fileID || '').trim()

	if (!fileID) {
		throw new Error('任务缺少图片 fileID')
	}

	logger.point('image_download_start')
	const downloaded = await downloadImageAsBase64(fileID)
	logger.step(
		'image_download_done',
		'image_download_start',
		`binary=${formatBytes(downloaded.byteLength)} base64=${formatBytes(Buffer.byteLength(downloaded.base64, 'utf8'))}`
	)

	const visionConfig = resolveVisionConfig()
	logger.point('vision_infer_start', `model=${visionConfig.model}`)
	const ingredients = await recognizeIngredientsFromImage(downloaded.base64, logger)
	logger.step('vision_infer_done', 'vision_infer_start', `ingredients=${ingredients.length}`)

	return {
		result: ingredients,
		resultRefs: {}
	}
}

async function finalizeTaskSuccess(taskId, payload) {
	const taskDoc = await db.collection('ai_tasks').doc(taskId).get()
	const task = unwrapDocData(taskDoc) || {}
	const { _id, ...rest } = task

	await db.collection('ai_tasks').doc(taskId).set({
		...rest,
		status: 'succeeded',
		result: payload.result || {},
		resultRefs: payload.resultRefs || {},
		errorMessage: '',
		finishedAt: new Date()
	})
}

async function finalizeTaskFailure(taskId, errorMessage) {
	const taskDoc = await db.collection('ai_tasks').doc(taskId).get()
	const task = unwrapDocData(taskDoc) || {}
	const { _id, ...rest } = task
	const attemptCount = Number(task.attemptCount) || 0
	const shouldRetry = attemptCount < maxAttempts

	await db.collection('ai_tasks').doc(taskId).set({
		...rest,
		status: shouldRetry ? 'pending' : 'failed',
		errorMessage,
		finishedAt: shouldRetry ? null : new Date(),
		startedAt: shouldRetry ? null : task.startedAt || null
	})
}

async function processTask(task, logger) {
	if (task.type === 'recognize_image') {
		return processRecognizeImageTask(task, logger)
	}

	const taskBackend = String(task.backend || '').trim()
	assertBackendReady(taskBackend)
	const aiConfig = resolveAiConfig(taskBackend)
	task.backend = aiConfig.backend

	if (task.type === 'recipe') {
		return processRecipeTask(task, logger)
	}

	if (task.type === 'meal_plan') {
		return processMealPlanTask(task, logger)
	}

	throw new Error(`不支持的任务类型：${task.type}`)
}

async function workOnce() {
	await resetStaleProcessingTasks()
	const task = await fetchPendingTask()

	if (!task) {
		return false
	}

	const claimed = await markTaskProcessing(task._id)
	if (!claimed) {
		return true
	}

	const logger = createTaskLogger(task)
	const createdAt = getCollectionDate(task.createdAt)
	const queueWaitMs = createdAt ? Date.now() - createdAt.getTime() : null

	console.log(`[worker] processing task ${task._id} (${task.type}) with backend ${task.backend || 'cloudbase'}`)
	logger.point('task_claimed', queueWaitMs === null ? '' : `queue_wait=${queueWaitMs}ms attempt=${Number(task.attemptCount || 0) + 1}`)

	try {
		const result = await processTask(task, logger)
		logger.point('task_finalize_start')
		await finalizeTaskSuccess(task._id, result)
		logger.step('task_finalize_done', 'task_finalize_start')
		logger.total('status=succeeded')
		console.log(`[worker] task ${task._id} succeeded`)
	} catch (error) {
		const message = error && error.message ? error.message : 'AI 任务处理失败'
		logger.point('task_finalize_start', `status=failed error=${message}`)
		await finalizeTaskFailure(task._id, message)
		logger.step('task_finalize_done', 'task_finalize_start')
		logger.total('status=failed')
		console.error(`[worker] task ${task._id} failed: ${message}`)
	}

	return true
}

async function main() {
	console.log('[worker] started')

	while (true) {
		try {
			const handledTask = await workOnce()
			if (!handledTask) {
				await sleep(pollIntervalMs)
			}
		} catch (error) {
			console.error('[worker] loop error:', error)
			await sleep(pollIntervalMs)
		}
	}
}

main().catch((error) => {
	console.error('[worker] fatal error:', error)
	process.exit(1)
})
