const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

function normalizeArray(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean).sort()
    : []
}

function sameArray(left, right) {
  const normalizedLeft = normalizeArray(left)
  const normalizedRight = normalizeArray(right)

  if (normalizedLeft.length !== normalizedRight.length) {
    return false
  }

  return normalizedLeft.every((item, index) => item === normalizedRight[index])
}

function normalizeRecipePreview(recipe) {
  return {
    _id: recipe._id,
    title: recipe.title || 'AI 菜谱',
    tags: Array.isArray(recipe.tags) ? recipe.tags : []
  }
}

function getDateValue(raw) {
  if (!raw) {
    return null
  }

  if (raw instanceof Date) {
    return raw
  }

  if (typeof raw.toDate === 'function') {
    return raw.toDate()
  }

  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

async function recoverRecipeTask(taskId, task, openid) {
  const exactMatch = await db.collection('recipes').where({
    taskId,
    createdBy: openid
  }).orderBy('createdAt', 'asc').limit(1).get()

  if (Array.isArray(exactMatch.data) && exactMatch.data.length) {
    const matched = exactMatch.data[0]
    return {
      result: normalizeRecipePreview(matched),
      resultRefs: {
        recipeId: matched._id
      }
    }
  }

  const createdAt = getDateValue(task.createdAt)
  const { data } = await db.collection('recipes').where({
    createdBy: openid
  }).orderBy('createdAt', 'desc').limit(10).get()

  const matched = (data || []).find((recipe) => {
    const recipeCreatedAt = getDateValue(recipe.createdAt)
    if (createdAt && recipeCreatedAt && recipeCreatedAt.getTime() + 1000 < createdAt.getTime()) {
      return false
    }

    return sameArray(recipe.sourceIngredients, task.payload?.ingredients)
  })

  if (!matched) {
    return null
  }

  return {
    result: normalizeRecipePreview(matched),
    resultRefs: {
      recipeId: matched._id
    }
  }
}

async function recoverMealPlanTask(taskId, task, openid) {
  const exactMatch = await db.collection('recipes').where({
    taskId,
    createdBy: openid
  }).orderBy('createdAt', 'asc').limit(Number(task.payload?.dishCount) || 8).get()

  if (Array.isArray(exactMatch.data) && exactMatch.data.length) {
    return {
      result: exactMatch.data.map((recipe) => normalizeRecipePreview(recipe)),
      resultRefs: {
        recipeIds: exactMatch.data.map((recipe) => recipe._id)
      }
    }
  }

  const createdAt = getDateValue(task.createdAt)
  const { data } = await db.collection('recipes').where({
    createdBy: openid
  }).orderBy('createdAt', 'desc').limit(30).get()

  const matched = (data || []).filter((recipe) => {
    const recipeCreatedAt = getDateValue(recipe.createdAt)
    if (createdAt && recipeCreatedAt && recipeCreatedAt.getTime() + 1000 < createdAt.getTime()) {
      return false
    }

    const meta = recipe.mealPlanMeta || {}
    return (
      Number(meta.diners) === Number(task.payload?.diners || 2) &&
      Number(meta.dishCount) === Number(task.payload?.dishCount || 3) &&
      String(meta.cuisine || '') === String(task.payload?.cuisine || '') &&
      String(meta.preferences || '') === String(task.payload?.preferences || '')
    )
  }).slice(0, Number(task.payload?.dishCount) || 3)

  if (!matched.length) {
    return null
  }

  return {
    result: matched.map((recipe) => normalizeRecipePreview(recipe)),
    resultRefs: {
      recipeIds: matched.map((recipe) => recipe._id)
    }
  }
}

async function tryRecoverTaskResult(taskId, task, openid) {
  if (task.resultRefs && (task.resultRefs.recipeId || (Array.isArray(task.resultRefs.recipeIds) && task.resultRefs.recipeIds.length))) {
    return null
  }

  let recovered = null

  if (task.type === 'recipe') {
    recovered = await recoverRecipeTask(taskId, task, openid)
  } else if (task.type === 'meal_plan') {
    recovered = await recoverMealPlanTask(taskId, task, openid)
  }

  if (!recovered) {
    return null
  }

  await db.collection('ai_tasks').doc(taskId).update({
    data: {
      status: 'succeeded',
      result: recovered.result,
      resultRefs: recovered.resultRefs,
      errorMessage: '',
      finishedAt: db.serverDate()
    }
  })

  return recovered
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID || ''
  const taskId = String(event.taskId || '').trim()

  if (!openid) {
    return {
      success: false,
      errorMessage: '未获取到 OPENID'
    }
  }

  if (!taskId) {
    return {
      success: false,
      errorMessage: '缺少 taskId'
    }
  }

  try {
    const { data } = await db.collection('ai_tasks').doc(taskId).get()

    if (!data || data.createdBy !== openid) {
      return {
        success: false,
        errorMessage: '任务不存在或无权访问'
      }
    }

    let task = data
    if ((task.status === 'pending' || task.status === 'processing')) {
      const recovered = await tryRecoverTaskResult(taskId, task, openid)
      if (recovered) {
        task = {
          ...task,
          status: 'succeeded',
          result: recovered.result,
          resultRefs: recovered.resultRefs,
          errorMessage: ''
        }
      }
    }

      return {
        success: true,
        taskId,
      status: task.status || 'pending',
      errorMessage: task.errorMessage || '',
      result: task.result || {},
      resultRefs: task.resultRefs || {},
      attemptCount: Number(task.attemptCount) || 0
    }
  } catch (error) {
    return {
      success: false,
      errorMessage: error.message || '查询任务状态失败'
    }
  }
}
