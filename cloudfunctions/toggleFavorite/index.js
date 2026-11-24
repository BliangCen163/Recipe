const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const DEFAULT_NICKNAME = '美食爱好者'

async function ensureUser(openid) {
  const userRef = db.collection('users').doc(openid)
  const doc = await userRef.get().catch(() => null)

  if (!doc || !doc.data) {
    await userRef.set({
      data: {
        openid,
        nickname: DEFAULT_NICKNAME,
        avatarUrl: '',
        savedRecipes: [],
        shoppingList: [],
        createdAt: db.serverDate()
      }
    })

    return {
      openid,
      nickname: DEFAULT_NICKNAME,
      avatarUrl: '',
      savedRecipes: [],
      shoppingList: []
    }
  }

  return doc.data
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const inputRecipe = event.recipe || {}

  if (!openid) {
    return {
      success: false,
      errorMessage: '未获取到 OPENID'
    }
  }

  if (!inputRecipe.title) {
    return {
      success: false,
      errorMessage: '缺少菜谱标题，无法收藏'
    }
  }

  try {
    let recipeId = inputRecipe._id || ''
    const sourceMenuId = inputRecipe.sourceMenuId || ''

    if (!recipeId) {
      let existingRecipe = null
      if (sourceMenuId) {
        const queryResult = await db.collection('recipes')
          .where({ sourceMenuId })
          .limit(1)
          .get()
        if (queryResult.data.length > 0) {
          existingRecipe = queryResult.data[0]
        }
      }

      if (existingRecipe) {
        recipeId = existingRecipe._id
      } else {
        const recipePayload = {
          title: inputRecipe.title,
          tags: Array.isArray(inputRecipe.tags) ? inputRecipe.tags : [],
          ingredients: Array.isArray(inputRecipe.ingredients) ? inputRecipe.ingredients : [],
          steps: Array.isArray(inputRecipe.steps) ? inputRecipe.steps : [],
          tips: inputRecipe.tips || '',
          cover: inputRecipe.cover || '',
          sourceIngredients: Array.isArray(inputRecipe.sourceIngredients) ? inputRecipe.sourceIngredients : [],
          sourceMenuId,
          createdBy: openid,
          createdAt: db.serverDate()
        }

        const addResult = await db.collection('recipes').add({
          data: recipePayload
        })
        recipeId = addResult._id
      }
    }

    const user = await ensureUser(openid)
    const savedRecipes = Array.isArray(user.savedRecipes) ? user.savedRecipes : []
    const hasFavorited = savedRecipes.includes(recipeId)

    if (hasFavorited) {
      await db.collection('users').doc(openid).update({
        data: {
          savedRecipes: _.pull(recipeId)
        }
      })
    } else {
      await db.collection('users').doc(openid).update({
        data: {
          savedRecipes: _.push(recipeId)
        }
      })
    }

    const latestUser = await db.collection('users').doc(openid).get()

    return {
      success: true,
      recipeId,
      isFavorited: !hasFavorited,
      savedRecipes: Array.isArray(latestUser.data?.savedRecipes) ? latestUser.data.savedRecipes : []
    }
  } catch (error) {
    return {
      success: false,
      errorMessage: error.message || '收藏操作失败'
    }
  }
}
