const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const recipeId = String(event?.recipeId || '').trim()
  const source = String(event?.source || '').trim()

  if (!openid) {
    return {
      success: false,
      errorMessage: '未获取到 OPENID'
    }
  }

  try {
    const userRef = db.collection('users').doc(openid)

    if (recipeId) {
      const { data } = await userRef.get()
      const historyRecipes = Array.isArray(data?.historyRecipes) ? data.historyRecipes : []
      const nextHistory = historyRecipes.filter((item) => {
        const sameRecipe = item?.recipeId === recipeId
        const sameSource = source ? item?.source === source : true
        return !(sameRecipe && sameSource)
      })

      await userRef.update({
        data: {
          historyRecipes: nextHistory
        }
      })

      return {
        success: true,
        history: nextHistory
      }
    }

    await userRef.update({
      data: {
        historyRecipes: []
      }
    })

    return {
      success: true
    }
  } catch (error) {
    return {
      success: false,
      errorMessage: error.message || '清空浏览历史失败'
    }
  }
}
