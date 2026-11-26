const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const MAX_PAGE_SIZE = 50
const DEFAULT_PAGE_SIZE = 12

function normalizeFavorite(doc) {
  const snapshot = doc.snapshot || {}

  return {
    favoriteId: doc._id,
    recipeId: doc.recipeId || '',
    recipeKind: doc.recipeKind || 'recipe',
    title: snapshot.title || '',
    cover: snapshot.cover || '',
    tags: Array.isArray(snapshot.tags) ? snapshot.tags : [],
    sourceIngredients: Array.isArray(snapshot.sourceIngredients) ? snapshot.sourceIngredients : [],
    createdAt: doc.createdAt || null
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

  const singleRecipeId = String(event.recipeId || '').trim()

  try {
    const favorites = db.collection('favorites')

    // 详情页红心：只查这一条
    if (singleRecipeId) {
      const existed = await favorites
        .doc(`${openid}_${singleRecipeId}`)
        .get()
        .catch(() => null)

      return {
        success: true,
        favorited: !!(existed && existed.data),
        recipeId: singleRecipeId
      }
    }

    const page = Math.max(1, Number(event.page) || 1)
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(event.pageSize) || DEFAULT_PAGE_SIZE))

    const countResult = await favorites.where({ openid }).count()
    const total = countResult.total || 0

    const { data } = await favorites
      .where({ openid })
      .orderBy('createdAt', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get()

    const items = (data || []).map(normalizeFavorite)

    return {
      success: true,
      items,
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total
    }
  } catch (error) {
    return {
      success: false,
      errorMessage: error.message || '读取收藏失败'
    }
  }
}
