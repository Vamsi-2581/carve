import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parse } from '../scripts/spec/layout.mjs'
import { renderDoc } from '../scripts/spec/html.mjs'

const html = (source) => renderDoc(parse(source)).trim()

test('a no-break space in a plain code block is an entity', () => {
  assert.equal(html('```\na\u00a0\n```\n'), '<pre><code>a&nbsp;\n</code></pre>')
})

test('a no-break space in a captioned code block is an entity', () => {
  assert.equal(html('```\na\u00a0\n```\n^ caption\n'), '<figure>\n  <pre><code>a&nbsp;\n</code></pre>\n  <figcaption>caption</figcaption>\n</figure>')
})

test('an ordinary space in a code block stays a space', () => {
  assert.equal(html('```\na b\n```\n'), '<pre><code>a b\n</code></pre>')
})
