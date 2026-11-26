const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const VALID_AI_BACKENDS = ['cloudbase', 'openai_compatible']

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return {
      success: false,
      errorMessage: '未获取到 OPENID'
    }
  }

  const payload = {}

  if (typeof event.nickname === 'string') {
    payload.nickname = event.nickname.trim() || '美食爱好者'
  }

  if (typeof event.avatarUrl === 'string') {
    payload.avatarUrl = event.avatarUrl
  }

  if (VALID_AI_BACKENDS.includes(event.aiBackend)) {
    payload['prefs.aiBackend'] = event.aiBackend
  }

  if (Object.keys(payload).length === 0) {
    return {
      success: false,
      errorMessage: '未提供可更新的用户信息'
    }
  }

  payload.updatedAt = new Date()

  try {
    await db.collection('users').doc(openid).update({
      data: payload
    })

    const { data } = await db.collection('users').doc(openid).get()

    return {
      success: true,
      openid,
      nickname: data.nickname || '美食爱好者',
      avatarUrl: data.avatarUrl || '',
      prefs: Object.assign({ aiBackend: 'cloudbase' }, data.prefs || {})
    }
  } catch (error) {
    return {
      success: false,
      errorMessage: error.message || '更新用户信息失败'
    }
  }
}
