const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const DEFAULT_NICKNAME = '美食爱好者'

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
    }

    const latestDoc = await userRef.get()
    const user = latestDoc.data || {}

    return {
      success: true,
      openid,
      userId: openid,
      nickname: user.nickname || DEFAULT_NICKNAME,
      avatarUrl: user.avatarUrl || '',
      savedRecipes: Array.isArray(user.savedRecipes) ? user.savedRecipes : []
    }
  } catch (error) {
    return {
      success: false,
      errorMessage: error.message || '登录失败'
    }
  }
}
