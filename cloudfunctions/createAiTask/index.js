const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

function clamp(value, min, max, fallback) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.min(max, Math.max(min, parsed))
}

function sanitizeRecipePayload(payload) {
  const ingredients = Array.isArray(payload.ingredients)
    ? payload.ingredients.map((item) => String(item).trim()).filter(Boolean)
    : []

  if (!ingredients.length) {
    throw new Error('请至少提供一种食材')
  }

  return {
    ingredients
  }
}

function sanitizeMealPlanPayload(payload) {
  return {
    diners: clamp(payload.diners, 1, 10, 2),
    dishCount: clamp(payload.dishCount, 1, 8, 3),
    cuisine: String(payload.cuisine || '').trim(),
    preferences: String(payload.preferences || '').trim(),
    availableIngredients: String(payload.availableIngredients || '').trim()
  }
}

function sanitizeRecognizeImagePayload(payload) {
  const fileID = String(payload.fileID || '').trim()

  if (!fileID) {
    throw new Error('缺少待识别图片 fileID')
  }

  return {
    fileID
  }
}

function sanitizePayload(type, payload) {
  const input = payload && typeof payload === 'object' ? payload : {}

  if (type === 'recipe') {
    return sanitizeRecipePayload(input)
  }

  if (type === 'meal_plan') {
    return sanitizeMealPlanPayload(input)
  }

  if (type === 'recognize_image') {
    return sanitizeRecognizeImagePayload(input)
  }

  throw new Error('不支持的任务类型')
}

function sanitizeBackend(value) {
  const backend = String(value || '').trim()
  if (backend === 'cloudbase' || backend === 'openai_compatible') {
    return backend
  }

  return ''
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID || ''
  const type = String(event.type || '').trim()

  if (!openid) {
    return {
      success: false,
      errorMessage: '未获取到 OPENID'
    }
  }

  if (!['recipe', 'meal_plan', 'recognize_image'].includes(type)) {
    return {
      success: false,
      errorMessage: '任务类型无效'
    }
  }

  try {
    const payload = sanitizePayload(type, event.payload)
    const backend = sanitizeBackend(event.backend)

    if (type !== 'recognize_image' && !backend) {
      throw new Error('请先选择有效的 AI 后端')
    }

    const now = db.serverDate()

    const { _id } = await db.collection('ai_tasks').add({
      data: {
        type,
        status: 'pending',
        backend: backend || 'openai_compatible',
        payload,
        result: type === 'recognize_image' ? [] : {},
        resultRefs: {},
        errorMessage: '',
        createdBy: openid,
        _openid: openid,
        createdAt: now,
        startedAt: null,
        finishedAt: null,
        attemptCount: 0
      }
    })

    return {
      success: true,
      taskId: _id,
      status: 'pending'
    }
  } catch (error) {
    return {
      success: false,
      errorMessage: error.message || '创建 AI 任务失败'
    }
  }
}
