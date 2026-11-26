const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const MAX_PAGE_SIZE = 50
const DEFAULT_PAGE_SIZE = 20

function normalizeItem(doc) {
  return {
    historyId: doc._id,
    recipeId: doc.recipeId || '',
    recipeKind: doc.recipeKind || 'recipe',
    title: doc.title || '未知菜谱',
    cover: doc.cover || '',
    viewedAt: doc.viewedAt || null
  }
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

  const page = Math.max(1, Number(event.page) || 1)
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(event.pageSize) || DEFAULT_PAGE_SIZE))

  try {
    const history = db.collection('history')
    const countResult = await history.where({ openid }).count()
    const total = countResult.total || 0

    const { data } = await history
      .where({ openid })
      .orderBy('viewedAt', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get()

    return {
      success: true,
      items: (data || []).map(normalizeItem),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total
    }
  } catch (error) {
    return {
      success: false,
      errorMessage: error.message || '获取浏览历史失败'
    }
  }
}
