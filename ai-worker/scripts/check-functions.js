#!/usr/bin/env node
/**
 * 检查云函数是否已部署：逐个用「无副作用」的入参调用，区分「未部署」和「已部署但返回业务错误」。
 *
 *   npm run check-functions
 *
 * 说明：login / updateUserProfile 会写库、aiAssistant 会消耗 AI 额度，故不检查。
 */
const fs = require('fs')
const path = require('path')
const cloudbase = require('@cloudbase/node-sdk')

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx <= 0) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnvFile(path.join(__dirname, '..', '.env'))
loadEnvFile(path.join(__dirname, '..', '.env.local'))

const envId =
  process.env.CLOUDBASE_ENV_ID || process.env.TCB_ENV_ID || process.env.TCB_ENV
const secretId = process.env.CLOUDBASE_SECRET_ID || process.env.TCB_SECRET_ID
const secretKey = process.env.CLOUDBASE_SECRET_KEY || process.env.TCB_SECRET_KEY

if (!envId || !secretId || !secretKey) {
  console.error('缺少云开发凭据，请先在 ai-worker/.env 配置。')
  process.exit(1)
}

const app = cloudbase.init({ env: envId, secretId, secretKey })

// 每个入参都必须保证「即使函数已部署也不会产生写入或外部调用」
// 有写入风险的函数（clearViewHistory、recordViewHistory、manageShoppingList、updateUserProfile）不探测
const CHECKS = [
  ['search', { keyword: '番茄', page: 1 }],
  ['getFavorites', {}],
  ['getViewHistory', {}],
  ['getAiTaskStatus', { taskId: '__probe__' }],
  ['createAiTask', { type: '__probe__' }],
  ['toggleFavorite', {}],
  ['createOriginalRecipe', {}],
  ['manageOriginalRecipe', { action: '__probe__' }]
]

const NOT_DEPLOYED = /FUNCTION_NOT_FOUND|FunctionNameNotFound|not found|-501000|ResourceNotFound/i

async function main() {
  console.log(`环境：${envId}\n`)
  let missing = 0
  let ok = 0

  for (const [name, payload] of CHECKS) {
    try {
      const res = await app.callFunction({ name, data: payload })
      const code = res && res.result ? '已部署' : '已部署（无 result）'
      console.log(`  ${name.padEnd(22)} ${code}`)
      if (process.argv.includes('--result') && res && res.result) {
        const text = JSON.stringify(res.result)
        console.log(`  ${''.padEnd(22)} ↳ ${text.slice(0, 110)}`)
      }
      ok += 1
    } catch (error) {
      const message = String((error && error.message) || error)
      if (NOT_DEPLOYED.test(message)) {
        console.log(`  ${name.padEnd(22)} 未部署`)
        missing += 1
      } else {
        console.log(`  ${name.padEnd(22)} 已部署（调用报错：${message.slice(0, 50)}）`)
        ok += 1
      }
    }
  }

  console.log(`\n已部署 ${ok} 个，未部署 ${missing} 个（login / aiAssistant / updateUserProfile 未探测）`)
  if (missing > 0) {
    console.log('未部署的函数请在微信开发者工具里右键 cloudfunctions/<名称> → 上传并部署：云端安装依赖。')
  }
}

main().catch((error) => {
  console.error('执行失败：', error)
  process.exit(1)
})
