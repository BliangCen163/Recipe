const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const MAX_HISTORY_COUNT = 50

async function ensureUser(openid) {
  const userRef = db.collection('users').doc(openid)
  const doc = await userRef.get().catch(() => null)

  if (!doc || !doc.data) {
    await userRef.set({
      data: {
        openid,
        nickname: '美食爱好者',
        avatarUrl: '',
        savedRecipes: [],
        shoppingList: [],
        historyRecipes: [],
        createdAt: db.serverDate()
      }
    })

    return {
      historyRecipes: []
    }
  }

  return doc.data
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const recipe = event.recipe || {}

  if (!openid) {
    return {
      success: false,
      errorMessage: '未获取到 OPENID'
    }
  }

  const recipeId = String(recipe.recipeId || '').trim()
  if (!recipeId) {
    return {
      success: false,
      errorMessage: '缺少菜谱ID'
    }
  }

  try {
    const user = await ensureUser(openid)
    let historyRecipes = Array.isArray(user.historyRecipes) ? [...user.historyRecipes] : []

    historyRecipes = historyRecipes.filter((item) => !(item.recipeId === recipeId && item.source === recipe.source))
    historyRecipes.unshift({
      recipeId,
      title: String(recipe.title || '未知菜谱').trim(),
      cover: String(recipe.cover || '').trim(),
      source: String(recipe.source || 'recipes').trim() || 'recipes',
      viewedAt: new Date()
    })

    if (historyRecipes.length > MAX_HISTORY_COUNT) {
      historyRecipes = historyRecipes.slice(0, MAX_HISTORY_COUNT)
    }

    await db.collection('users').doc(openid).update({
      data: {
        historyRecipes
      }
    })

    return {
      success: true,
      history: historyRecipes
    }
  } catch (error) {
    return {
      success: false,
      errorMessage: error.message || '记录浏览历史失败'
    }
  }
}
