#!/usr/bin/env node
/**
 * 数据修补：给历史文档补 _openid（以及 recipes 的 visibility）。
 * v1 时代的云函数写入不带 _openid，安全规则「仅创建者」会让本人也读不到；
 * 新代码已修，但老数据需要补一次。可重复执行（只处理缺失的文档）。
 *
 *   npm run backfill-openid
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

async function backfillUsers() {
  const { data } = await db.collection('users').limit(100).get()
  let updated = 0
  for (const doc of data || []) {
    if (doc._openid) continue
    await db.collection('users').doc(doc._id).update({
      data: { _openid: String(doc._id), openid: doc.openid || String(doc._id) }
    })
    updated += 1
  }
  return { scanned: (data || []).length, updated }
}

async function backfillByCreator(collection, extra = {}) {
  const { data } = await db.collection(collection).limit(100).get()
  let updated = 0
  let skipped = 0
  for (const doc of data || []) {
    if (doc._openid) continue
    const owner = String(doc.createdBy || doc.openid || '').trim()
    if (!owner) {
      skipped += 1
      continue
    }
    await db.collection(collection).doc(doc._id).update({
      data: { _openid: owner, ...extra }
    })
    updated += 1
  }
  return { scanned: (data || []).length, updated, skipped }
}

async function main() {
  console.log(`环境：${envId}\n`)

  const users = await backfillUsers()
  console.log(`users: 扫描 ${users.scanned}，补 _openid ${users.updated}`)

  const recipes = await backfillByCreator('recipes', { visibility: 'private' })
  console.log(`recipes: 扫描 ${recipes.scanned}，补 _openid ${recipes.updated}，无作者跳过 ${recipes.skipped}`)

  const originals = await backfillByCreator('original_recipes')
  console.log(`original_recipes: 扫描 ${originals.scanned}，补 _openid ${originals.updated}`)

  const tasks = await backfillByCreator('ai_tasks')
  console.log(`ai_tasks: 扫描 ${tasks.scanned}，补 _openid ${tasks.updated}`)

  console.log('\n完成。注意：脚本每类只扫描前 100 条，数据量大时请重复执行直到 updated 为 0。')
}

main().catch((error) => {
  console.error('执行失败：', error)
  process.exit(1)
})
