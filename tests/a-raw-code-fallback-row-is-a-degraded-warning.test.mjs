/*
 * `raw-code-fallback` is reported by all three engines when the Markdown import
 * keeps an HTML `<code>` element as raw HTML because Carve has no spelling for
 * it at that position. The schema pins the one shape they agree on.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const schema = JSON.parse(readFileSync(resolve(root, 'resources/migration-report-schema.json'), 'utf8'))
const validate = new Ajv2020({ strict: true }).compile(schema)
const report = (fields) => ({
  schemaVersion: 2,
  sourceFormat: 'markdown',
  diagnostics: [{ code: 'raw-code-fallback', message: 'kept as raw HTML', path: 'line:1', ...fields }],
})

test('a raw-code-fallback row is a degraded warning at exact confidence', () => {
  assert.ok(validate(report({ severity: 'warning', fidelity: 'degraded', confidence: 'exact' })))
  assert.ok(!validate(report({ severity: 'warning', fidelity: 'dropped', confidence: 'exact' })))
  assert.ok(!validate(report({ severity: 'info', fidelity: 'degraded', confidence: 'exact' })))
  assert.ok(!validate(report({ severity: 'warning', fidelity: 'degraded', confidence: 'fallback' })))
})

test('the Markdown bridge names the code', () => {
  const bridges = readFileSync(resolve(root, 'docs/format-bridges.md'), 'utf8')
  assert.match(bridges, /`raw-code-fallback` with `degraded` fidelity/)
})
