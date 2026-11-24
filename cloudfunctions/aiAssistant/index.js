const https = require('https')

const DEFAULT_PROVIDER = 'hunyuan'
const DEFAULT_MODEL = 'hunyuan-turbos-latest'

const SYSTEM_PROMPT = '你是一个耐心的后厨领班，专门解答做菜过程中的各种突发状况。用户可能会问你"盐放多了怎么办"、"如何判断油温"、"肉炒老了怎么补救"等问题。请用简洁、实用、接地气的语言回答，给出具体可操作的解决方案。回答控制在200字以内。'

function httpPostJson(url, headers, body) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      { method: 'POST', headers },
      (response) => {
        let raw = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => { raw += chunk })
        response.on('end', () => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            try { resolve(JSON.parse(raw)) } catch (e) { reject(new Error('AI 响应不是合法 JSON')) }
            return
          }
          reject(new Error(`AI 接口请求失败（${response.statusCode}）`))
        })
      }
    )
    request.on('error', reject)
    request.write(JSON.stringify(body))
    request.end()
  })
}

exports.main = async (event) => {
  const { messages } = event

  if (!messages || !messages.length) {
    return { success: false, errorMessage: '请提供对话消息' }
  }

  const apiKey = process.env.CLOUDBASE_API_KEY || ''
  const envId = process.env.CLOUDBASE_ENV_ID || process.env.TCB_ENV || ''
  const provider = process.env.CLOUDBASE_AI_PROVIDER || DEFAULT_PROVIDER
  const model = process.env.CLOUDBASE_MODEL || DEFAULT_MODEL
  const apiUrl = process.env.CLOUDBASE_API_URL || (
    envId
      ? `https://${envId}.api.tcloudbasegateway.com/v1/ai/${provider}/v1/chat/completions`
      : ''
  )

  if (!apiKey) return { success: false, errorMessage: '未配置 CLOUDBASE_API_KEY' }
  if (!apiUrl) return { success: false, errorMessage: '未配置 CLOUDBASE_ENV_ID 或 CLOUDBASE_API_URL' }

  const payload = {
    model,
    temperature: 0.7,
    max_tokens: 500,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages
    ]
  }

  try {
    const result = await httpPostJson(
      apiUrl,
      {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      payload
    )

    const content = result?.choices?.[0]?.message?.content || ''
    if (!content) {
      return { success: false, errorMessage: 'AI 未返回有效内容' }
    }

    return { success: true, data: { reply: content } }
  } catch (error) {
    return { success: false, errorMessage: error.message || '调用 AI 助手失败' }
  }
}