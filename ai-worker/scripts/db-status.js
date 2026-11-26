#!/usr/bin/env node
/**
 * 体检脚本：列出各集合文档数，并抽查 menu 的导入质量。
 *
 *   npm run db-status
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

const db = cloudbase.init({ env: envId, secretId, secretKey }).database()

const COLLECTIONS = [
  'users',
  'menu',
  'recipes',
  'ai_tasks',
  'original_recipes',
  'favorites',
  'history',
  'shopping_items'
]

async function safeCount(name) {
  try {
    const { total } = await db.collection(name).count()
    return { exists: true, total }
  } catch (error) {
    const message = String((error && error.message) || '')
    if (message.includes('not exist') || message.includes('NOT_EXIST')) {
      return { exists: false, total: 0 }
    }
    return { exists: false, total: 0, error: message }
  }
}

async function main() {
  console.log(`环境：${envId}\n`)
  console.log('集合                文档数    状态')
  console.log('--------------------------------------')

  let menuCount = 0
  for (const name of COLLECTIONS) {
    const result = await safeCount(name)
    if (name === 'menu') menuCount = result.total
    const status = result.error
      ? `错误：${result.error.slice(0, 40)}`
      : result.exists
        ? '正常'
        : '不存在'
    console.log(`${name.padEnd(20)}${String(result.total).padStart(8)}    ${status}`)
  }

  if (menuCount > 0) {
    const { data } = await db.collection('menu').limit(1).get()
    const sample = (data && data[0]) || {}
    console.log('\nmenu 抽样：')
    console.log(`  _id=${sample._id}  title=${String(sample.title || '').slice(0, 24)}`)
    console.log(`  cuisine=${sample.cuisine || '—'}  dishCategory=${sample.dishCategory || '—'}`)
    console.log(`  searchKey=${sample.searchKey ? '有' : '无'}  isActive=${sample.isActive === undefined ? '未设置' : sample.isActive}`)
  }

  console.log('\n提示：索引和安全规则无法通过 SDK 查看，请到控制台核对（DATABASE.md §4 / §5）。')

  if (process.argv.includes('--fields')) {
    for (const name of ['users', 'recipes', 'ai_tasks']) {
      const { exists } = await safeCount(name)
      if (!exists) continue
      const { data } = await db.collection(name).limit(1).get()
      const sample = (data && data[0]) || null
      if (!sample) {
        console.log(`\n${name}：无数据`)
        continue
      }
      console.log(`\n${name} 字段：`)
      console.log(`  ${Object.keys(sample).join(', ')}`)
      console.log(`  _id 类型=${typeof sample._id}  _openid=${sample._openid ? '有' : '缺失'}`)
    }
  }
}

main().catch((error) => {
  console.error('执行失败：', error)
  process.exit(1)
})
