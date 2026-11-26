const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const DEFAULT_NICKNAME = '美食爱好者'
const VALID_KINDS = ['menu', 'recipe', 'original']
const VALID_ACTIONS = ['add', 'remove', 'toggle']

function normalizeKind(value) {
  if (VALID_KINDS.includes(value)) return value
  if (value === 'recipes') return 'recipe'
  if (value === 'original_recipes') return 'original'
  return 'recipe'
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter((tag) => typeof tag === 'string' && tag.trim())
    .map((tag) => tag.trim())
}

function normalizeStrings(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => item.trim())
}

async function ensureUser(openid) {
  const userRef = db.collection('users').doc(openid)
  const existed = await userRef.get().catch(() => null)
  if (existed && existed.data) return existed.data

  const now = new Date()
  const profile = {
    _openid: openid,
    openid,
    nickname: DEFAULT_NICKNAME,
    avatarUrl: '',
    stats: { favoriteCount: 0, historyCount: 0, recipeCount: 0 },
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now
  }

  await userRef.set({ data: profile })
  return profile
}

async function applyFavoriteDelta(openid, menuId, delta) {
  if (menuId) {
    await db
      .collection('menu')
      .doc(menuId)
      .update({
        data: { favoriteCount: _.inc(delta), updatedAt: new Date() }
      })
      .catch(() => null)
  }

  await db
    .collection('users')
    .doc(openid)
    .update({
      data: { 'stats.favoriteCount': _.inc(delta) }
    })
    .catch(() => null)
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
  const snapshotInput = event.snapshot || {}
  const recipeId = String(event.recipeId || recipe._id || '').trim()
  const recipeKind = normalizeKind(event.recipeKind || recipe.recipeKind || recipe.source)
  const action = VALID_ACTIONS.includes(event.action) ? event.action : 'toggle'

  if (!recipeId) {
    return {
      success: false,
      errorMessage: '缺少菜谱 ID'
    }
  }

  const title = String(snapshotInput.title || recipe.title || '').trim()

  if (action !== 'remove' && !title) {
    return {
      success: false,
      errorMessage: '缺少菜谱标题，无法收藏'
    }
  }

  const snapshot = {
    title,
    cover: String(snapshotInput.cover || recipe.cover || '').trim(),
    tags: normalizeTags(snapshotInput.tags || recipe.tags),
    sourceIngredients: normalizeStrings(snapshotInput.sourceIngredients || recipe.sourceIngredients)
  }

  try {
    await ensureUser(openid)

    // 用 openid + recipeId 组成固定文档 id：天然去重，重复点击不会产生多条记录
    const favoriteRef = db.collection('favorites').doc(`${openid}_${recipeId}`)
    const existed = await favoriteRef.get().catch(() => null)
    const isFavorited = !!(existed && existed.data)
    const shouldRemove = action === 'remove' || (action === 'toggle' && isFavorited)

    if (shouldRemove) {
      if (!isFavorited) {
        return { success: true, isFavorited: false, recipeId, recipeKind }
      }

      await favoriteRef.remove()
      await applyFavoriteDelta(openid, recipeKind === 'menu' ? recipeId : '', -1)

      return { success: true, isFavorited: false, recipeId, recipeKind }
    }

    if (isFavorited) {
      return { success: true, isFavorited: true, recipeId, recipeKind, already: true }
    }

    await favoriteRef.set({
      data: {
        _openid: openid,
        openid,
        recipeId,
        recipeKind,
        snapshot,
        createdAt: new Date()
      }
    })

    await applyFavoriteDelta(openid, recipeKind === 'menu' ? recipeId : '', 1)

    return { success: true, isFavorited: true, recipeId, recipeKind }
  } catch (error) {
    return {
      success: false,
      errorMessage: error.message || '收藏操作失败'
    }
  }
}
