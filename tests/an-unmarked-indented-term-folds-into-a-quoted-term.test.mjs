import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parse } from '../scripts/spec/layout.mjs'
import { renderDoc } from '../scripts/spec/html.mjs'

test("an unmarked term at column 1 folds into the quoted term", () => {
  assert.equal(renderDoc(parse("> - :: a\n :: b\n>   : p\n")), "<blockquote>\n  <ul>\n    <li>\n      <dl>\n        <dt>a\n:: b</dt>\n        <dd>p</dd>\n      </dl>\n    </li>\n  </ul>\n</blockquote>")
})

test("an unmarked term at column 2 folds into the quoted term", () => {
  assert.equal(renderDoc(parse("> - :: a\n  :: b\n>   : p\n")), "<blockquote>\n  <ul>\n    <li>\n      <dl>\n        <dt>a\n:: b</dt>\n        <dd>p</dd>\n      </dl>\n    </li>\n  </ul>\n</blockquote>")
})

test("an unmarked term at column 3 folds into the quoted term", () => {
  assert.equal(renderDoc(parse("> - :: a\n   :: b\n>   : p\n")), "<blockquote>\n  <ul>\n    <li>\n      <dl>\n        <dt>a\n:: b</dt>\n        <dd>p</dd>\n      </dl>\n    </li>\n  </ul>\n</blockquote>")
})

test("an unmarked term at column 4 folds into the quoted term", () => {
  assert.equal(renderDoc(parse("> - :: a\n    :: b\n>   : p\n")), "<blockquote>\n  <ul>\n    <li>\n      <dl>\n        <dt>a\n:: b</dt>\n        <dd>p</dd>\n      </dl>\n    </li>\n  </ul>\n</blockquote>")
})

test("CONTROL: a marked sibling term stays a term", () => {
  assert.equal(renderDoc(parse("> - :: a\n>   :: b\n>   : p\n")), "<blockquote>\n  <ul>\n    <li>\n      <dl>\n        <dt>a</dt>\n        <dt>b</dt>\n        <dd>p</dd>\n      </dl>\n    </li>\n  </ul>\n</blockquote>")
})

