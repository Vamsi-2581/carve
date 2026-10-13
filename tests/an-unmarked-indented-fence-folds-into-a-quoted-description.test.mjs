import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parse } from '../scripts/spec/layout.mjs'
import { renderDoc } from '../scripts/spec/html.mjs'

test("unmarked ``` at column 2 folds into the quoted description", () => {
  assert.equal(renderDoc(parse("> - :: a\n>   : p\n>     ```\n  ```\n")), "<blockquote>\n  <ul>\n    <li>\n      <dl>\n        <dt>a</dt>\n        <dd>p\n<code>\n</code></dd>\n      </dl>\n    </li>\n  </ul>\n</blockquote>")
})

test("unmarked ~~~ at column 2 folds into the quoted description", () => {
  assert.equal(renderDoc(parse("> - :: a\n>   : p\n>     ~~~\n  ~~~\n")), "<blockquote>\n  <ul>\n    <li>\n      <dl>\n        <dt>a</dt>\n        <dd>p\n~~~\n~~~</dd>\n      </dl>\n    </li>\n  </ul>\n</blockquote>")
})

test("unmarked ``` at column 3 folds into the quoted description", () => {
  assert.equal(renderDoc(parse("> - :: a\n>   : p\n>     ```\n   ```\n")), "<blockquote>\n  <ul>\n    <li>\n      <dl>\n        <dt>a</dt>\n        <dd>p\n<code>\n</code></dd>\n      </dl>\n    </li>\n  </ul>\n</blockquote>")
})

test("unmarked ~~~ at column 3 folds into the quoted description", () => {
  assert.equal(renderDoc(parse("> - :: a\n>   : p\n>     ~~~\n   ~~~\n")), "<blockquote>\n  <ul>\n    <li>\n      <dl>\n        <dt>a</dt>\n        <dd>p\n~~~\n~~~</dd>\n      </dl>\n    </li>\n  </ul>\n</blockquote>")
})

test("unmarked ```` at column 2 folds into the quoted description", () => {
  assert.equal(renderDoc(parse("> - :: a\n>   : p\n>     ````\n  ````\n")), "<blockquote>\n  <ul>\n    <li>\n      <dl>\n        <dt>a</dt>\n        <dd>p\n<code>\n</code></dd>\n      </dl>\n    </li>\n  </ul>\n</blockquote>")
})

test("CONTROL: a closed quoted fence stays in the description", () => {
  assert.equal(renderDoc(parse("> - :: a\n>   : p\n>     ```\n>     ```\n")), "<blockquote>\n  <ul>\n    <li>\n      <dl>\n        <dt>a</dt>\n        <dd>\n          <p>p</p>\n          <pre><code></code></pre>\n        </dd>\n      </dl>\n    </li>\n  </ul>\n</blockquote>")
})

