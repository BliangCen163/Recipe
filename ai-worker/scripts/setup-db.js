#!/usr/bin/env node
/**
 * 创建云数据库集合。
 *
 *   npm run setup-db              # 建 v1 的 5 个集合（当前代码在用的结构）
 *   npm run setup-db -- --v2      # 建 v2 的 8 个集合（按 DATABASE.md 改造后再用）
 *
 * 已存在的集合会跳过。微信云开发不提供建索引的 SDK 接口，索引请在控制台按
 * DATABASE.md §4 / RPD.md 第 3 步手动创建。
 */
const fs = require('fs')
const path = require('path')
const cloudbase = require('@cloudbase/node-sdk')

// 当前代码在用的结构（RPD.md §8）
const COLLECTIONS_V1 = ['users', 'menu', 'recipes', 'ai_tasks', 'original_recipes']
// 优化后的结构（DATABASE.md）
const COLLECTIONS_V2 = [
  'users',
  'favorites',
  'history',
  'shopping_items',
  'menu',
  'recipes',
  'ai_tasks',
  'original_recipes'
]

const useV2 = process.argv.includes('--v2')
const COLLECTIONS = useV2 ? COLLECTIONS_V2 : COLLECTIONS_V1

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
const secretId =
  process.env.CLOUDBASE_SECRET_ID || process.env.TCB_SECRET_ID
const secretKey =
  process.env.CLOUDBASE_SECRET_KEY || process.env.TCB_SECRET_KEY

if (!envId || !secretId || !secretKey) {
  console.error(
    '缺少 CLOUDBASE_ENV_ID / CLOUDBASE_SECRET_ID / CLOUDBASE_SECRET_KEY，请先在 ai-worker/.env 里配置。'
  )
  process.exit(1)
}

const app = cloudbase.init({ env: envId, secretId, secretKey })
const db = app.database()

function isNotExistError(error) {
  const message = String((error && error.message) || '')
  return (
    message.includes('not exist') ||
    message.includes('NOT_EXIST') ||
    (error && error.code && String(error.code).includes('502005'))
  )
}

async function collectionExists(name) {
  try {
    await db.collection(name).count()
    return true
  } catch (error) {
    if (isNotExistError(error)) return false
    return false
  }
}

async function createCollection(name) {
  if (typeof db.createCollection === 'function') {
    await db.createCollection(name)
    return
  }

  // 兜底：写一条探针文档再删掉，触发集合自动创建
  const result = await db.collection(name).add({ __probe: true, createdAt: new Date() })
  const id = result && (result.id || result._id)
  if (id) {
    await db.collection(name).doc(id).remove().catch(() => null)
  }
}

async function main() {
  console.log(`环境：${envId}`)
  console.log(`模式：${useV2 ? 'v2（DATABASE.md 目标结构）' : 'v1（当前代码在用）'}`)
  console.log(`目标集合：${COLLECTIONS.join(', ')}\n`)

  const results = []
  for (const name of COLLECTIONS) {
    if (await collectionExists(name)) {
      results.push([name, '已存在，跳过'])
      continue
    }

    try {
      await createCollection(name)
      results.push([name, '已创建'])
    } catch (error) {
      const message = String((error && error.message) || error)
      if (message.includes('exist')) {
        results.push([name, '已存在'])
      } else {
        results.push([name, `失败：${message}`])
      }
    }
  }

  console.log('结果：')
  for (const [name, status] of results) {
    console.log(`  ${name.padEnd(20)} ${status}`)
  }

  const failed = results.filter(([, status]) => status.startsWith('失败'))
  if (failed.length) {
    console.error(`\n${failed.length} 个集合创建失败，请检查上面的错误信息。`)
    process.exit(1)
  }

  console.log('\n下一步：')
  console.log('  1) npm run import-menu -- --file=../menu.json')
  console.log('  2) 控制台建索引：DATABASE.md §4（v1 至少要 menu 的分类索引、recipes.taskId、ai_tasks.status）')
  console.log('  3) 控制台配安全规则：DATABASE.md §5')
  console.log('  4) 部署云函数 + 启动 npm start')
}

main().catch((error) => {
  console.error('执行失败：', error)
  process.exit(1)
})
