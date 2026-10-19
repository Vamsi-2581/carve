import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lint-include-conformance')
const schema = JSON.parse(readFileSync(path.join(root, 'schema.json'), 'utf8'))
const corpus = JSON.parse(readFileSync(path.join(root, 'vectors.json'), 'utf8'))
const key = (f) => [f.file, String(f.line).padStart(8, '0'), String(f.column).padStart(8, '0'), f.rule].join('\0')

test('lint include vectors are schema-valid and uniquely named', () => {
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema)
  assert.equal(validate(corpus), true, JSON.stringify(validate.errors))
  assert.equal(new Set(corpus.vectors.map(({ name }) => name)).size, corpus.vectors.length)
})

test('expected findings are sorted, distinct, and chained only outside the top-level document', () => {
  for (const { name, expected, files } of corpus.vectors) {
    const keys = expected.findings.map(key)
    assert.deepEqual(keys, [...keys].sort(), `${name}: findings are not sorted`)
    assert.equal(new Set(keys).size, keys.length, `${name}: a position is reported twice`)
    for (const finding of expected.findings) {
      const top = finding.file === corpus.sourcePath
      assert.equal(finding.includedBy === undefined, top, `${name}: ${finding.rule} chain does not match its file`)
      if (!top) assert.ok(Object.hasOwn(files, finding.file), `${name}: ${finding.file} is not a vector file`)
      for (const site of finding.includedBy ?? []) {
        assert.ok(site.file === corpus.sourcePath || Object.hasOwn(files, site.file), `${name}: chain names ${site.file}`)
      }
      assert.equal(finding.includedBy?.[0].file ?? corpus.sourcePath, corpus.sourcePath, `${name}: chain must start at the top-level document`)
    }
  }
})

test('the ticket control is pinned: delimited-table-malformed at data/plans.csv:3 via doc.crv:2', () => {
  const control = corpus.vectors.find(({ name }) => name === 'code-table-malformed-record')
  assert.deepEqual(control.expected.findings, [{
    rule: 'delimited-table-malformed', file: 'data/plans.csv', line: 3, column: 1,
    includedBy: [{ file: 'doc.crv', line: 2, column: 1 }],
  }])
})

test('the no-resolver vector expects nothing', () => {
  for (const vector of corpus.vectors.filter(({ resolver }) => resolver === 'none')) {
    assert.deepEqual(vector.expected.findings, [], vector.name)
  }
})
