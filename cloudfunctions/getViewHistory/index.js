const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

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
    const { data } = await db.collection('users').doc(openid).get()
    const history = Array.isArray(data?.historyRecipes) ? data.historyRecipes : []

    return {
      success: true,
      history,
      count: history.length
    }
  } catch (error) {
    return {
      success: false,
      errorMessage: error.message || '获取浏览历史失败'
    }
  }
}
