import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parse } from '../scripts/spec/layout.mjs'
import { renderDoc } from '../scripts/spec/html.mjs'

test("a raw description ends before a comment at 2, quote False, ```", () => {
  assert.equal(renderDoc(parse("- :: t\n  : p\n    # H\n    ```=html\n  %%%\n")), "<ul>\n  <li>\n    <dl>\n      <dt>t</dt>\n      <dd>\n        <p>p</p>\n        <h1 id=\"H\">H</h1>\n        \n      </dd>\n    </dl>\n  </li>\n</ul>")
})

test("a raw description ends before a comment at 2, quote False, ~~~", () => {
  assert.equal(renderDoc(parse("- :: t\n  : p\n    # H\n    ~~~=html\n  %%%\n")), "<ul>\n  <li>\n    <dl>\n      <dt>t</dt>\n      <dd>\n        <p>p</p>\n        <h1 id=\"H\">H</h1>\n        \n      </dd>\n    </dl>\n  </li>\n</ul>")
})

test("a raw description ends before a comment at 2, quote True, ```", () => {
  assert.equal(renderDoc(parse("> - :: t\n>   : p\n>     # H\n>     ```=html\n>   %%%\n")), "<blockquote>\n  <ul>\n    <li>\n      <dl>\n        <dt>t</dt>\n        <dd>\n          <p>p</p>\n          <h1 id=\"H\">H</h1>\n          \n        </dd>\n      </dl>\n    </li>\n  </ul>\n</blockquote>")
})

test("a raw description ends before a comment at 2, quote True, ~~~", () => {
  assert.equal(renderDoc(parse("> - :: t\n>   : p\n>     # H\n>     ~~~=html\n>   %%%\n")), "<blockquote>\n  <ul>\n    <li>\n      <dl>\n        <dt>t</dt>\n        <dd>\n          <p>p</p>\n          <h1 id=\"H\">H</h1>\n          \n        </dd>\n      </dl>\n    </li>\n  </ul>\n</blockquote>")
})

test("a raw description ends before a comment at 3, quote False, ```", () => {
  assert.equal(renderDoc(parse("- :: t\n  : p\n    # H\n    ```=html\n   %%%\n")), "<ul>\n  <li>\n    <dl>\n      <dt>t</dt>\n      <dd>\n        <p>p</p>\n        <h1 id=\"H\">H</h1>\n        \n      </dd>\n    </dl>\n  </li>\n</ul>")
})

test("CONTROL: a raw fence keeps a comment inside its description column", () => {
  assert.equal(renderDoc(parse("- :: t\n  : p\n    # H\n    ```=html\n    %%%\n")), "<ul>\n  <li>\n    <dl>\n      <dt>t</dt>\n      <dd>\n        <p>p</p>\n        <h1 id=\"H\">H</h1>\n        %%%\n      </dd>\n    </dl>\n  </li>\n</ul>")
})

