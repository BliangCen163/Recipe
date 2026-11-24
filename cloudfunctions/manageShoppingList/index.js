const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

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
      shoppingList: []
    }
  }

  return doc.data
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const action = event.action || 'append'
  const inputIngredients = Array.isArray(event.ingredients) ? event.ingredients : []

  if (!openid) {
    return {
      success: false,
      errorMessage: '未获取到 OPENID'
    }
  }

  try {
    const user = await ensureUser(openid)
    const shoppingList = Array.isArray(user.shoppingList) ? [...user.shoppingList] : []

    if (action === 'get') {
      return {
        success: true,
        shoppingList
      }
    }

    if (action === 'append') {
      const shoppingMap = new Map(
        shoppingList.map((item) => [
          `${item.name}__${item.amount}`,
          {
            name: item.name,
            amount: item.amount,
            checked: !!item.checked,
            sources: Array.isArray(item.sources) ? item.sources : []
          }
        ])
      )

      for (const item of inputIngredients) {
        if (!item?.name || !item?.amount) continue

        const key = `${item.name}__${item.amount}`
        const sourceName = item.recipeTitle || '套餐方案'
        const current = shoppingMap.get(key) || {
          name: item.name,
          amount: item.amount,
          checked: false,
          sources: []
        }

        if (!current.sources.includes(sourceName)) {
          current.sources.push(sourceName)
        }

        shoppingMap.set(key, current)
      }

      const nextShoppingList = Array.from(shoppingMap.values())

      await db.collection('users').doc(openid).update({
        data: {
          shoppingList: nextShoppingList
        }
      })

      return {
        success: true,
        count: nextShoppingList.length,
        shoppingList: nextShoppingList
      }
    }

    if (action === 'toggle') {
      const { name, amount } = event
      if (!name || !amount) {
        return {
          success: false,
          errorMessage: '缺少 name 或 amount 参数'
        }
      }

      const updatedList = shoppingList.map((item) => {
        if (item.name === name && item.amount === amount) {
          return { ...item, checked: !item.checked }
        }
        return item
      })

      await db.collection('users').doc(openid).update({
        data: {
          shoppingList: updatedList
        }
      })

      return {
        success: true,
        shoppingList: updatedList
      }
    }

    if (action === 'clear') {
      const remainingList = shoppingList.filter((item) => !item.checked)

      await db.collection('users').doc(openid).update({
        data: {
          shoppingList: remainingList
        }
      })

      return {
        success: true,
        count: remainingList.length,
        shoppingList: remainingList
      }
    }

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
