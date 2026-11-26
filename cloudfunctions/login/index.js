const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const DEFAULT_NICKNAME = '美食爱好者'
const DEFAULT_PREFS = { aiBackend: 'cloudbase' }
const MAX_HISTORY_COUNT = 100

function normalizeKind(source) {
  if (source === 'menu') return 'menu'
  if (source === 'original_recipes') return 'original'
  return 'recipe'
}

// 把 v1 内嵌在 users 里的三个数组迁到独立集合，迁移完删除数组字段
async function migrateLegacyUser(openid, user) {
  const now = new Date()
  const savedRecipes = Array.isArray(user.savedRecipes) ? user.savedRecipes.filter(Boolean) : []
  const shoppingList = Array.isArray(user.shoppingList) ? user.shoppingList : []
  const historyRecipes = Array.isArray(user.historyRecipes) ? user.historyRecipes : []
  let favoriteCount = 0

  for (const rawId of savedRecipes) {
    const recipeId = String(rawId)
    const recipeDoc = await db
      .collection('recipes')
      .doc(recipeId)
      .get()
      .catch(() => null)
    const recipe = recipeDoc && recipeDoc.data

    if (!recipe) continue

    await db
      .collection('favorites')
      .doc(`${openid}_${recipeId}`)
      .set({
        data: {
          _openid: openid,
          openid,
          recipeId,
          recipeKind: 'recipe',
          snapshot: {
            title: recipe.title || '',
            cover: recipe.cover || '',
            tags: Array.isArray(recipe.tags) ? recipe.tags : [],
            sourceIngredients: Array.isArray(recipe.sourceIngredients) ? recipe.sourceIngredients : []
          },
          createdAt: recipe.createdAt || now
        }
      })
      .catch(() => null)

    favoriteCount += 1
  }

  for (const item of shoppingList) {
    if (!item || !item.name || !item.amount) continue

    const existed = await db
      .collection('shopping_items')
      .where({ openid, name: item.name, amount: item.amount })
      .limit(1)
      .get()
      .catch(() => null)

    if (existed && Array.isArray(existed.data) && existed.data.length > 0) continue

    await db
      .collection('shopping_items')
      .add({
        data: {
          _openid: openid,
          openid,
          name: item.name,
          amount: item.amount,
          checked: !!item.checked,
          sources: Array.isArray(item.sources) ? item.sources : [],
          createdAt: now,
          updatedAt: now
        }
      })
      .catch(() => null)
  }

  const historyItems = historyRecipes.slice(0, MAX_HISTORY_COUNT)

  for (const entry of historyItems) {
    if (!entry || !entry.recipeId) continue

    const viewedAt = entry.viewedAt ? new Date(entry.viewedAt) : now
    const safeViewedAt = Number.isNaN(viewedAt.getTime()) ? now : viewedAt

    await db
      .collection('history')
      .doc(`${openid}_${entry.recipeId}`)
      .set({
        data: {
          _openid: openid,
          openid,
          recipeId: String(entry.recipeId),
          recipeKind: normalizeKind(entry.source),
          title: entry.title || '未知菜谱',
          cover: entry.cover || '',
          viewedAt: safeViewedAt
        }
      })
      .catch(() => null)
  }

  await db
    .collection('users')
    .doc(openid)
    .update({
      data: {
        prefs: Object.assign({}, DEFAULT_PREFS, user.prefs || {}),
        stats: {
          favoriteCount,
          historyCount: historyItems.length,
          recipeCount: 0
        },
        schemaVersion: 2,
        savedRecipes: _.remove(),
        shoppingList: _.remove(),
        historyRecipes: _.remove()
      }
    })
}

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return {
      success: false,
      errorMessage: '未获取到 OPENID'
    }
  }

  try {
    const userRef = db.collection('users').doc(openid)
    const existed = await userRef.get().catch(() => null)
    const now = new Date()

    if (!existed || !existed.data) {
      const profile = {
        _openid: openid,
        openid,
        nickname: DEFAULT_NICKNAME,
        avatarUrl: '',
        prefs: Object.assign({}, DEFAULT_PREFS),
        stats: { favoriteCount: 0, historyCount: 0, recipeCount: 0 },
        schemaVersion: 2,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now
      }

      await userRef.set({ data: profile })

      return {
        success: true,
        openid,
        userId: openid,
        nickname: profile.nickname,
        avatarUrl: '',
        prefs: profile.prefs
      }
    }

    let user = existed.data

    if (user.schemaVersion !== 2) {
      await migrateLegacyUser(openid, user)
      const migrated = await userRef.get()
      user = (migrated && migrated.data) || user
    }

    await userRef.update({
      data: {
        _openid: openid,
        lastLoginAt: now,
        updatedAt: now
      }
    })

    return {
      success: true,
      openid,
      userId: openid,
      nickname: user.nickname || DEFAULT_NICKNAME,
      avatarUrl: user.avatarUrl || '',
      prefs: Object.assign({}, DEFAULT_PREFS, user.prefs || {})
    }
  } catch (error) {
    return {
      success: false,
      errorMessage: error.message || '登录失败'
    }
  }
}
