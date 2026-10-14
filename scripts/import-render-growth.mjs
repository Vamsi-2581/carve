#!/usr/bin/env node
// Reproducible CLI CPU measurements for issue #3175.
// Set CARVE_JS_BASE_DIR and CARVE_JS_AFTER_DIR to built parent/merge checkouts of #2821.
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { phpDir, rustBinary, rustDir } from './lib/engine-locations.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
function treeHash(base, paths) {
  const hash = createHash('sha256')
  const walk = path => {
    const absolute = resolve(base, path)
    if (statSync(absolute).isDirectory()) for (const name of readdirSync(absolute).sort()) walk(join(path, name))
    else { hash.update(path); hash.update('\0'); hash.update(readFileSync(absolute)) }
  }
  for (const path of paths) walk(path)
  return hash.digest('hex')
}
const engines = {
  js: ['node', 'dist/cli.js', process.env.CARVE_JS_DIR || resolve(root, '../carve-js')],
  php: ['php', 'bin/carve', phpDir()],
  rs: [process.env.CARVE_GROWTH_ENGINE && process.env.CARVE_GROWTH_ENGINE !== 'rs' ? null : (process.env.CARVE_RS_BIN || rustBinary()), '', rustDir()],
}
const cases = {
  'djot-references': n => ['djot', `[shared]: https://example.test/\n\n` + Array.from({ length: n }, (_, i) => `A [word${i}][shared]`).join('\n\n')],
  'djot-shared-attributes': n => ['djot', `{#shared .shared}\n\n` + Array.from({ length: n }, (_, i) => `word${i} {#shared .shared}`).join('\n\n')],
  'html-containers': n => ['html', Array.from({ length: n }, (_, i) => `<blockquote><dl><dt>term${i}</dt><dd><p>value${i}</p></dd></dl></blockquote>`).join('\n')],
  'html-containers-render': n => cases['html-containers'](n),
  'html-nested-containers': n => ['html', Array.from({ length: 500 }, (_, i) => '<blockquote>'.repeat(n) + `<dl><dt>term${i}</dt><dd>value</dd></dl>` + '</blockquote>'.repeat(n)).join('\n')],
  'html-nested-containers-render': n => cases['html-nested-containers'](n),
  'js-footnotes': n => ['carve', Array.from({ length: n }, (_, i) => `A[^note${i}]\n\n[^note${i}]: value${i}\n`).join('\n')],
  'js-footnotes-stress': n => ['carve', `A ` + '[^shared] '.repeat(n) + '\n\n[^shared]: value\n'],
  'js-brackets': n => ['carve', Array.from({ length: n }, (_, i) => `[word${i}](https://example.test/${i})`).join(' ')],
  'js-brackets-stress': n => ['carve', '['.repeat(n) + 'word' + ']'.repeat(n) + '(https://example.test/)'],
  'markdown-destinations': n => ['markdown', Array.from({ length: n }, (_, i) => `[word${i}](https://example.test/${i})`).join(' ')],
}
const sizes = (process.env.CARVE_GROWTH_SIZES || '100,200,400').split(',').map(Number)
const filters = {
  ...(process.env.CARVE_GROWTH_CASE ? { case: process.env.CARVE_GROWTH_CASE } : {}),
  ...(process.env.CARVE_GROWTH_ENGINE ? { engine: process.env.CARVE_GROWTH_ENGINE } : {}),
  ...(process.env.CARVE_GROWTH_SIZES ? { sizes } : {}),
}
if (Object.keys(filters).length && !process.env.CARVE_GROWTH_OUTPUT) throw new Error('Filtered runs require CARVE_GROWTH_OUTPUT')
if (filters.case && !(filters.case in cases)) throw new Error(`Unknown growth case: ${filters.case}`)
if (filters.engine && !(filters.engine in engines)) throw new Error(`Unknown engine: ${filters.engine}`)
if (sizes.length < 3 || sizes.some((n, i) => !Number.isSafeInteger(n) || n < 1 || (i > 0 && n !== sizes[i - 1] * 2))) throw new Error('Sizes must be at least three positive doubling integers')
if (Boolean(process.env.CARVE_JS_BASE_DIR) !== Boolean(process.env.CARVE_JS_AFTER_DIR)) throw new Error('Both historical JavaScript checkout paths are required')
const selectedEngines = Object.fromEntries(Object.entries(engines).filter(([name]) => !filters.engine || filters.engine === name))
if (selectedEngines.rs && !selectedEngines.rs[0]) throw new Error('A checkout-matching Rust binary is required')
const dir = mkdtempSync(join(tmpdir(), 'carve-growth-'))
const rows = []
const builds = Object.fromEntries(Object.entries(selectedEngines).map(([name, [cmd, script, cwd]]) => {
  const commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).stdout.trim()
  const artifactScope = name === 'js' ? 'dist/' : name === 'php' ? 'src/, bin/carve, composer.lock' : 'CLI binary'
  const artifactHash = name === 'js' ? treeHash(cwd, ['dist']) : name === 'php' ? treeHash(cwd, ['bin/carve', 'composer.lock', 'src']) : createHash('sha256').update(readFileSync(cmd)).digest('hex')
  return [name, { commit, artifactScope, artifactHash }]
}))
try {
  for (const [caseName, make] of Object.entries(cases)) for (const n of (!process.env.CARVE_GROWTH_SIZES && caseName.startsWith('html-nested-containers') ? [8, 16, 32] : sizes)) {
    if (filters.case && filters.case !== caseName) continue
    const [source, input] = make(n)
    const inputPath = join(dir, 'input')
    writeFileSync(inputPath, input)
    for (const [name, [cmd, script, cwd]] of Object.entries(selectedEngines)) {
      const args = [...(script ? [script] : []), ...(source === 'carve' ? ['--html'] : ['migrate', '--from', source]), inputPath]
      const timed = (timedArgs, timedInput) => {
        const timePath = join(dir, 'time')
        const result = spawnSync('/usr/bin/time', ['-f', '%U %S', '-o', timePath, cmd, ...timedArgs], { cwd, input: timedInput, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
        if (result.status !== 0) throw new Error(`${caseName} ${n} ${name}: ${result.stderr.slice(0, 500)}`)
        const [user, system] = readFileSync(timePath, 'utf8').trim().split(' ').map(Number)
        return { cpu: user + system, output: result.stdout }
      }
      const run = () => {
        const first = timed(args)
        const second = caseName.endsWith('-render') ? timed([...(script ? [script] : []), '--html'], first.output) : null
        const output = second ? second.output : first.output
        return { cpu: first.cpu + (second?.cpu || 0), hash: createHash('sha256').update(output).digest('hex'), bytes: Buffer.byteLength(output) }
      }
      run()
      const loadavg = readFileSync('/proc/loadavg', 'utf8').trim()
      const samples = [run(), run(), run()]
      if (new Set(samples.map(x => x.hash)).size !== 1) throw new Error(`${caseName} ${n} ${name}: output changed across runs`)
      rows.push({ case: caseName, n, engine: name, cpu: samples.map(x => x.cpu), median: samples.map(x => x.cpu).sort((a, b) => a - b)[1], bytes: samples[0].bytes, hash: samples[0].hash, loadavg })
      process.stderr.write(`${caseName} ${n} ${name}\n`)
    }
  }
  if (!rows.length) throw new Error('The selected filters produced no measurements')
  let beforeAfter2821
  if (process.env.CARVE_JS_BASE_DIR && (!filters.engine || filters.engine === 'js') && (!filters.case || filters.case === 'markdown-destinations')) {
    const baseDir = resolve(process.env.CARVE_JS_BASE_DIR)
    const afterDir = resolve(process.env.CARVE_JS_AFTER_DIR)
    const beforeCommit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: baseDir, encoding: 'utf8' }).stdout.trim()
    const afterCommit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: afterDir, encoding: 'utf8' }).stdout.trim()
    if (beforeCommit !== '481e23f88ffd54ee32a887f5805adcdc729c745c' || afterCommit !== 'b359fcb1aa0ecc1286800774b76197c51ba4b5e2') throw new Error('Historical checkouts are not the parent and merge commit of #2821')
    const beforeDistHash = treeHash(baseDir, ['dist'])
    const afterDistHash = treeHash(afterDir, ['dist'])
    const pairedRows = []
    for (const n of [400, 800, 1600]) {
      const input = cases['markdown-destinations'](n)[1]
      const timed = variant => {
        const cwd = variant === 'before' ? baseDir : afterDir
        const timePath = join(dir, 'paired-time')
        const result = spawnSync('/usr/bin/time', ['-f', '%U %S', '-o', timePath, 'node', 'dist/cli.js', 'migrate', '--from', 'markdown'],
          { cwd, input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
        if (result.status !== 0) throw new Error(`paired Markdown ${n} ${variant}: ${result.stderr.slice(0, 500)}`)
        const cpu = readFileSync(timePath, 'utf8').trim().split(' ').map(Number).reduce((a, b) => a + b)
        return { cpu, hash: createHash('sha256').update(result.stdout).digest('hex'), loadavg: readFileSync('/proc/loadavg', 'utf8').trim() }
      }
      timed('before'); timed('after')
      for (let rep = 0; rep < 3; rep++) {
        for (const variant of (rep === 1 ? ['after', 'before'] : ['before', 'after'])) {
          pairedRows.push({ n, rep, variant, ...timed(variant) })
        }
      }
    }
    beforeAfter2821 = { beforeCommit, afterCommit, beforeDistHash, afterDistHash, pairedRows }
  }
  writeFileSync(process.env.CARVE_GROWTH_OUTPUT || resolve(root, 'docs/import-render-growth.json'), JSON.stringify({ builds, rows, ...(beforeAfter2821 ? { beforeAfter2821 } : {}), ...(Object.keys(filters).length ? { filters } : {}) }, null, 2) + '\n')
} finally { rmSync(dir, { recursive: true, force: true }) }
