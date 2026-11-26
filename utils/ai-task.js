const FAST_POLL_INTERVAL = 2000
const SLOW_POLL_INTERVAL = 4000
const FAST_POLL_WINDOW = 30000
const DEFAULT_TIMEOUT = 5 * 60 * 1000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export const createAiTask = async (type, payload) => {
	const { result } = await wx.cloud.callFunction({
		name: 'createAiTask',
		data: {
			type,
			payload
		}
	})

	if (!result?.success || !result?.taskId) {
		throw new Error(result?.errorMessage || '创建 AI 任务失败')
	}

	return result
}

export const getAiTaskStatus = async (taskId) => {
	const { result } = await wx.cloud.callFunction({
		name: 'getAiTaskStatus',
		data: { taskId }
	})

	if (!result?.success) {
		throw new Error(result?.errorMessage || '查询任务状态失败')
	}

	return result
}

export const waitForAiTask = async (taskId, options = {}) => {
	const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT
	const shouldStop = typeof options.shouldStop === 'function' ? options.shouldStop : () => false
	const onUpdate = typeof options.onUpdate === 'function' ? options.onUpdate : () => {}
	const startedAt = Date.now()

	while (true) {
		if (shouldStop()) {
			throw new Error('TASK_POLL_ABORTED')
		}

		const task = await getAiTaskStatus(taskId)
		onUpdate(task)

		if (task.status === 'succeeded' || task.status === 'failed') {
			return task
		}

		const elapsed = Date.now() - startedAt
		if (elapsed >= timeoutMs) {
			throw new Error('任务仍在处理中，请稍后重试')
		}

		const interval = elapsed < FAST_POLL_WINDOW ? FAST_POLL_INTERVAL : SLOW_POLL_INTERVAL
		await sleep(interval)
	}
}
