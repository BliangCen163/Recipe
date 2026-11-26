const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const MAX_PAGE_SIZE = 200
const DEFAULT_PAGE_SIZE = 100
const DEFAULT_RECIPE_TITLE = '我的菜谱'
const AMOUNT_PATTERN = /^\s*(\d+(?:\.\d+)?)\s*([^\d\s].*)?$/

function parseAmountText(text) {
  const raw = String(text || '').trim()
  if (!raw) return null

  const matched = raw.match(AMOUNT_PATTERN)
  if (!matched) return null

  const value = Number(matched[1])
  if (!Number.isFinite(value)) return null

  return { value, unit: String(matched[2] || '').trim() }
}

function formatAmountText(value, unit = '') {
  if (!Number.isFinite(value)) return ''

  const rounded = Math.round(value * 100) / 100
  const numberText = Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')

  if (!unit) return numberText
  return /^[\u4e00-\u9fa5]/.test(unit) ? `${numberText} ${unit}` : `${numberText}${unit}`
}

function mergeAmountText(left, right) {
  const base = String(left || '').trim()
  const extra = String(right || '').trim()
  if (!base) return extra
  if (!extra) return base

  const a = parseAmountText(base)
  const b = parseAmountText(extra)
  if (!a || !b) return `${base} + ${extra}`
  if (a.unit !== b.unit) return `${base} + ${extra}`

  return formatAmountText(a.value + b.value, a.unit)
}

function buildIngredientList(rawIngredients) {
  const merged = new Map()

  ;(Array.isArray(rawIngredients) ? rawIngredients : []).forEach((raw) => {
    const name = String(raw && raw.name ? raw.name : '').trim()
    const amount = String(raw && raw.amount ? raw.amount : '').trim()
    if (!name) return

    if (!merged.has(name)) {
      merged.set(name, { name, amount })
      return
    }

    const existed = merged.get(name)
    existed.amount = mergeAmountText(existed.amount, amount)
  })

  return Array.from(merged.values())
}

function normalizeItem(doc) {
  return {
    _id: doc._id,
    name: doc.name || '',
    amount: doc.amount || '',
    checked: !!doc.checked,
    recipeId: doc.recipeId || '',
    recipeTitle: doc.recipeTitle || (Array.isArray(doc.sources) && doc.sources[0]) || DEFAULT_RECIPE_TITLE,
    servings: Number(doc.servings) || 1,
    sources: Array.isArray(doc.sources) ? doc.sources : [],
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null
  }
}

async function listItems(openid, event) {
  const page = Math.max(1, Number(event.page) || 1)
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(event.pageSize) || DEFAULT_PAGE_SIZE))
  const itemsCol = db.collection('shopping_items')
  const countResult = await itemsCol.where({ openid }).count()
  const total = countResult.total || 0

  const { data } = await itemsCol
    .where({ openid })
    .orderBy('createdAt', 'asc')
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
}

async function appendItems(openid, event) {
  const ingredients = buildIngredientList(event.ingredients)
  const recipeTitle = String(event.recipeTitle || '').trim() || DEFAULT_RECIPE_TITLE
  const recipeId = String(event.recipeId || '').trim()
  const servings = Math.min(20, Math.max(1, Number(event.servings) || 1))
  const itemsCol = db.collection('shopping_items')

  let added = 0
  let updated = 0

  for (const ingredient of ingredients) {
    const query = recipeId
      ? { openid, recipeId, name: ingredient.name }
      : { openid, recipeTitle, name: ingredient.name }

    const existed = await itemsCol
      .where(query)
      .limit(1)
      .get()
      .catch(() => null)

    if (existed && Array.isArray(existed.data) && existed.data.length > 0) {
      const doc = existed.data[0]
      const unchanged = !doc.checked && doc.amount === ingredient.amount && Number(doc.servings) === servings

      if (unchanged) {
        updated += 1
        continue
      }

      await itemsCol.doc(doc._id).update({
        data: {
          amount: ingredient.amount,
          checked: false,
          recipeId: recipeId || doc.recipeId || '',
          recipeTitle,
          servings,
          updatedAt: new Date()
        }
      })

      updated += 1
      continue
    }

    await itemsCol.add({
      data: {
        _openid: openid,
        openid,
        name: ingredient.name,
        amount: ingredient.amount,
        checked: false,
        recipeId,
        recipeTitle,
        servings,
        sources: [recipeTitle],
        createdAt: new Date(),
        updatedAt: new Date()
      }
    })

    added += 1
  }

  const countResult = await itemsCol.where({ openid }).count()

  return {
    success: true,
    added,
    updated,
    count: ingredients.length,
    total: countResult.total || 0
  }
}

async function toggleItem(openid, event) {
  const itemId = String(event.itemId || '').trim()

  if (!itemId) {
    return { success: false, errorMessage: '缺少 itemId 参数' }
  }

  const itemsCol = db.collection('shopping_items')
  const doc = await itemsCol
    .doc(itemId)
    .get()
    .catch(() => null)

  if (!doc || !doc.data) {
    return { success: false, errorMessage: '采购项不存在' }
  }

  const item = doc.data

  if (item.openid !== openid && item._openid !== openid) {
    return { success: false, errorMessage: '无权操作该采购项' }
  }

  const checked = typeof event.checked === 'boolean' ? event.checked : !item.checked

  await itemsCol.doc(itemId).update({
    data: { checked, updatedAt: new Date() }
  })

  return {
    success: true,
    item: normalizeItem(Object.assign({}, item, { _id: itemId, checked }))
  }
}

async function removeItem(openid, event) {
  const itemId = String(event.itemId || '').trim()

  if (!itemId) {
    return { success: false, errorMessage: '缺少 itemId 参数' }
  }

  const itemsCol = db.collection('shopping_items')
  const doc = await itemsCol
    .doc(itemId)
    .get()
    .catch(() => null)

  if (!doc || !doc.data) {
    return { success: false, errorMessage: '采购项不存在' }
  }

  const item = doc.data

  if (item.openid !== openid && item._openid !== openid) {
    return { success: false, errorMessage: '无权操作该采购项' }
  }

  await itemsCol.doc(itemId).remove()

  return { success: true, removed: 1, itemId }
}

async function clearAll(openid) {
  const result = await db.collection('shopping_items').where({ openid }).remove()
  const removed = result && result.stats ? result.stats.removed || 0 : 0

  return { success: true, removed }
}

async function clearChecked(openid) {
  const result = await db.collection('shopping_items').where({ openid, checked: true }).remove()
  const removed = result && result.stats ? result.stats.removed || 0 : 0

  return { success: true, removed }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const action = event.action || 'get'

  if (!openid) {
    return {
      success: false,
      errorMessage: '未获取到 OPENID'
    }
  }

  try {
    if (action === 'get' || action === 'list') return await listItems(openid, event)
    if (action === 'append') return await appendItems(openid, event)
    if (action === 'toggle') return await toggleItem(openid, event)
    if (action === 'remove') return await removeItem(openid, event)
    if (action === 'clear-checked') return await clearChecked(openid)
    if (action === 'clear') return await clearAll(openid)

    return {
      success: false,
      errorMessage: `不支持的操作: ${action}`
    }
  } catch (error) {
    return {
      success: false,
      errorMessage: error.message || '采购单操作失败'
    }
  }
}
