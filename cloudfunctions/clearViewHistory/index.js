const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return {
      success: false,
      errorMessage: '未获取到 OPENID'
    }
  }

  const recipeId = String(event.recipeId || '').trim()

  try {
    const history = db.collection('history')
    let removed = 0

    if (recipeId) {
      const result = await history
        .doc(`${openid}_${recipeId}`)
        .remove()
        .catch(() => null)
      removed = result && result.stats ? result.stats.removed || 0 : result ? 1 : 0
    } else {
      const result = await history.where({ openid }).remove()
      removed = result && result.stats ? result.stats.removed || 0 : 0
    }

    const countResult = await history.where({ openid }).count()

    await db
      .collection('users')
      .doc(openid)
      .update({
        data: { 'stats.historyCount': countResult.total || 0 }
      })
      .catch(() => null)

    return {
      success: true,
      removed
    }
  } catch (error) {
    return {
      success: false,
      errorMessage: error.message || '清除浏览历史失败'
    }
  }
}
