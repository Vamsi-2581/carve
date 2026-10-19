// Lint include-conformance PROOF RUNNER: every vector in
// tests/lint-include-conformance/ through the carve-js reference build, so the
// spec arbitrates the vectors instead of only storing them (CARVE-P6-001 I16).
//
//   CARVE_JS=/path/to/carve-js npm run test:includes

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { loadCarve } from '../scripts/include-conformance-lib.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lint-include-conformance')
const corpus = JSON.parse(readFileSync(path.join(root, 'vectors.json'), 'utf8'))
const { mod: carve, from } = await loadCarve()
console.log(`lint-include-conformance: ${corpus.vectors.length} vectors, carve-js from ${from}`)

const key = (f) => [f.file, String(f.line).padStart(8, '0'), String(f.column).padStart(8, '0'), f.rule].join('\0')
const byKey = (a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)

for (const vector of corpus.vectors) {
  test(vector.name, () => {
    const options = vector.resolver === 'virtual'
      ? { includes: { resolve: (p) => vector.files[p] ?? null, sourcePath: corpus.sourcePath } }
      : {}
    const actual = carve.lintCarve(vector.entry, options).map((w) => ({
      rule: w.rule,
      file: w.file ?? corpus.sourcePath,
      line: w.line,
      column: w.column,
      ...(w.includedBy ? { includedBy: w.includedBy.map(({ file, line, column }) => ({ file, line, column })) } : {}),
    })).sort(byKey)
    assert.deepEqual(actual, [...vector.expected.findings].sort(byKey))
  })
}
