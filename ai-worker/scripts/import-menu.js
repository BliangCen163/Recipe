#!/usr/bin/env node
/**
 * 把 menu.json（JSON Lines，每行一条菜谱）分批导入云数据库 menu 集合。
 * 61 MB 单文件超出控制台上传上限，本脚本逐行流式读取，不会一次性读进内存。
 *
 * 用法（在 ai-worker 目录下）：
 *   npm run import-menu -- --file=../menu.json
 *   npm run import-menu -- --file=../menu.json --limit=200 --dry-run
 *   npm run import-menu -- --file=../menu.json --batch=50
 *
 * 特性：
 *   - 每批 batch 条并发插入；某批失败时自动退化为逐条插入
 *   - 重复的 _id 会被跳过（可中断后重跑）
 *   - 导入时补 searchKey / isActive / source / createdAt / updatedAt
 */
const fs = require('fs')
const path = require('path')
const readline = require('readline')

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

function parseArgs(argv) {
  const args = { file: '', collection: 'menu', batch: 100, limit: 0, concurrency: 8, dryRun: false }
  for (const raw of argv) {
    const [key, value] = raw.split('=')
    if (key === '--file') args.file = value
    else if (key === '--collection') args.collection = value
    else if (key === '--batch') args.batch = Math.min(500, Math.max(1, Number(value) || 100))
    else if (key === '--limit') args.limit = Math.max(0, Number(value) || 0)
    else if (key === '--concurrency') args.concurrency = Math.min(32, Math.max(1, Number(value) || 8))
    else if (key === '--dry-run') args.dryRun = true
  }
  return args
}

const args = parseArgs(process.argv.slice(2))

const envId =
  process.env.CLOUDBASE_ENV_ID || process.env.TCB_ENV_ID || process.env.TCB_ENV
const secretId = process.env.CLOUDBASE_SECRET_ID || process.env.TCB_SECRET_ID
const secretKey = process.env.CLOUDBASE_SECRET_KEY || process.env.TCB_SECRET_KEY

if (!args.file) {
  console.error('必须指定 --file，例如：npm run import-menu -- --file=../menu.json')
  process.exit(1)
}

const filePath = path.resolve(process.cwd(), args.file)
if (!fs.existsSync(filePath)) {
  console.error(`找不到文件：${filePath}`)
  process.exit(1)
}

if (!args.dryRun && (!envId || !secretId || !secretKey)) {
  console.error('缺少云开发凭据，请先在 ai-worker/.env 配置 CLOUDBASE_ENV_ID / SECRET_ID / SECRET_KEY')
  process.exit(1)
}

const app = args.dryRun ? null : require('@cloudbase/node-sdk').init({ env: envId, secretId, secretKey })
const db = app ? app.database() : null

function isDuplicateError(error) {
  const message = String((error && error.message) || error)
  return message.includes('duplicate') || message.includes('E11000') || (error && error.code === 11000)
}

function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (typeof value === 'object' && value.$date) return toDate(value.$date)
  return null
}

function normalizeDoc(source, index) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null

  const doc = { ...source }
  const title = String(doc.title || '').trim()
  if (!title) return null

  doc.title = title
  doc._id =
    doc._id === undefined || doc._id === null || doc._id === ''
      ? String(index)
      : String(doc._id)

  const tags = Array.isArray(doc.tags) ? doc.tags.map(String) : []
  doc.tags = tags
  doc.searchKey = [title, ...tags].join(' ').toLowerCase()

  // 种子里的日期是 Extended JSON（{ "$date": "..." }），转成真正的 Date 再入库
  const createTime = toDate(doc.createTime) || toDate(doc.createdAt)
  if (createTime) doc.createTime = createTime

  if (doc.isActive === undefined) doc.isActive = true
  if (!doc.source) doc.source = 'seed'
  doc.createdAt = createTime || toDate(doc.createdAt) || new Date()
  doc.updatedAt = new Date()

  return doc
}

let useArrayAdd = true

async function runPool(items, worker, concurrency) {
  let cursor = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      await worker(items[index], index)
    }
  })
  await Promise.all(runners)
}

async function insertDocuments(batch) {
  let inserted = 0
  let skipped = 0
  let failed = 0

  await runPool(
    batch,
    async (doc) => {
      try {
        await db.collection(args.collection).add(doc)
        inserted += 1
      } catch (error) {
        if (isDuplicateError(error)) {
          skipped += 1
        } else {
          failed += 1
          if (failed <= 5) {
            console.error(`\n  插入失败 _id=${doc._id}：${error.message || error}`)
          }
        }
      }
    },
    args.concurrency
  )

  return { inserted, skipped, failed }
}

async function insertBatch(batch) {
  if (useArrayAdd) {
    try {
      await db.collection(args.collection).add(batch)
      return { inserted: batch.length, skipped: 0, failed: 0 }
    } catch (batchError) {
      const message = String((batchError && batchError.message) || '')
      // 不支持数组入参（而非个别重复）时，后续都走逐条模式
      if (!isDuplicateError(batchError) && /(param|argument|type|array|data|invalid)/i.test(message)) {
        useArrayAdd = false
        console.warn(`\n  批量插入不可用（${message}），切换为逐条插入（并发 ${args.concurrency}）`)
      }
    }
  }

  const result = await insertDocuments(batch)
  if (!result.inserted && !result.skipped && result.failed) {
    throw new Error(`整批 ${batch.length} 条全部插入失败，请检查上面的错误信息`)
  }
  return result
}

async function main() {
  console.log(`文件：${filePath}`)
  console.log(`集合：${args.collection}  批量：${args.batch}${args.limit ? `  上限：${args.limit}` : ''}${args.dryRun ? '  [dry-run]' : ''}`)

  const startedAt = Date.now()
  let parsed = 0
  let invalid = 0
  let inserted = 0
  let skipped = 0
  let failed = 0
  let batch = []
  let previewed = 0

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity
  })

  const flush = async () => {
    if (!batch.length) return
    if (args.dryRun) {
      if (previewed < 2) {
        console.log('\n样例文档：')
        console.log(JSON.stringify(batch[0], null, 2))
        previewed += 1
      }
      inserted += batch.length
    } else {
      const result = await insertBatch(batch)
      inserted += result.inserted
      skipped += result.skipped
      failed += result.failed
      if (inserted % (args.batch * 20) === 0 && inserted > 0) {
        const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)
        console.log(`  已导入 ${inserted} 条（跳过 ${skipped}，失败 ${failed}，${seconds}s）`)
      }
    }
    batch = []
  }

  for await (const line of rl) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (args.limit && parsed >= args.limit) break

    let source
    try {
      source = JSON.parse(trimmed)
    } catch (error) {
      invalid += 1
      if (invalid <= 3) console.warn(`  跳过无法解析的行（第 ${parsed + invalid} 条）：${trimmed.slice(0, 60)}…`)
      continue
    }

    parsed += 1
    const doc = normalizeDoc(source, parsed)
    if (!doc) {
      invalid += 1
      continue
    }

    batch.push(doc)
    if (batch.length >= args.batch) {
      await flush()
    }
  }

  await flush()

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(`\n完成：插入 ${inserted}，跳过重复 ${skipped}，失败 ${failed}，无标题/坏行 ${invalid}，耗时 ${seconds}s`)

  if (!args.dryRun) {
    const count = await db.collection(args.collection).count()
    console.log(`${args.collection} 当前文档数：${count.total}`)
    if (count.total !== inserted + skipped && skipped === 0) {
      console.log('提示：文档数与本次插入数不一致，可能是集合里原有数据。')
    }
  }
}

main().catch((error) => {
  console.error('\n导入中断：', error)
  process.exit(1)
})
