const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const MAX_HISTORY_COUNT = 100
const TRIM_BATCH = 50

function normalizeKind(value) {
  if (value === 'menu') return 'menu'
  if (value === 'original_recipes' || value === 'original') return 'original'
  return 'recipe'
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return {
      success: false,
      errorMessage: '未获取到 OPENID'
    }
  }

  const recipe = event.recipe || {}
  const recipeId = String(recipe.recipeId || event.recipeId || '').trim()
  const recipeKind = normalizeKind(recipe.recipeKind || recipe.source || event.recipeKind)
  const title = String(recipe.title || event.title || '').trim() || '未知菜谱'
  const cover = String(recipe.cover || event.cover || '').trim()

  if (!recipeId) {
    return {
      success: false,
      errorMessage: '缺少菜谱ID'
    }
  }

  try {
    const history = db.collection('history')

    // openid + recipeId 固定文档 id：同一道菜只保留一条，重复浏览即置顶
    await history.doc(`${openid}_${recipeId}`).set({
      data: {
        _openid: openid,
        openid,
        recipeId,
        recipeKind,
        title,
        cover,
        viewedAt: new Date()
      }
    })

    const countResult = await history.where({ openid }).count()
    const total = countResult.total || 0
    let removed = 0

    if (total > MAX_HISTORY_COUNT) {
      const overflow = Math.min(total - MAX_HISTORY_COUNT, TRIM_BATCH)
      const { data: stale } = await history
        .where({ openid })
        .orderBy('viewedAt', 'asc')
        .limit(overflow)
        .get()

      for (const doc of stale || []) {
        await history
          .doc(doc._id)
          .remove()
          .catch(() => null)
        removed += 1
      }
    }

    await db
      .collection('users')
      .doc(openid)
      .update({
        data: { 'stats.historyCount': Math.min(total - removed, MAX_HISTORY_COUNT) }
      })
      .catch(() => null)

    return {
      success: true,
      recipeId,
      recipeKind,
      count: total - removed
    }
  } catch (error) {
    return {
      success: false,
      errorMessage: error.message || '记录浏览历史失败'
    }
  }
}
