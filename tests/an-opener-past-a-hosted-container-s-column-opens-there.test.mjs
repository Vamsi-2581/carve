import test from 'node:test'
import assert from 'node:assert/strict'
import {parse} from '../scripts/spec/layout.mjs'
import {renderDoc} from '../scripts/spec/html.mjs'

const html = source => renderDoc(parse(source))
const compact = source => html(source).replace(/\n */g, '')
const kinds = {
  colon: [[':::: inner', 'x', '::::'], '<div class="inner"><p>x</p></div>'],
  line: [['::: |', 'x', ':::'], '<div class="line-block"><p>x</p></div>'],
  backtick: [['```', 'x', '```'], '<pre><code>x</code></pre>'],
  tilde: [['~~~', 'x', '~~~'], '<pre><code>x</code></pre>'],
  heading: [['# h'], '<h1 id="h">h</h1>'],
  quote: [['> x'], '<blockquote><p>x</p></blockquote>'],
  break: [['---'], '<hr>'],
  table: [['| x |'], '<table><tbody><tr><td>x</td></tr></tbody></table>'],
}
for (const host of ['marker', 'continuation']) for (const depth of [0, 1, 2]) {
  for (const [kind, [lines, expected]] of Object.entries(kinds)) for (const offset of [1, 2, 4]) {
    const q = '> '.repeat(depth)
    const start = host === 'marker' ? ['- ::: box'] : ['- lead', '  ::: box']
    const source = paragraph => [...start, ...(paragraph ? ['  text'] : []), ...lines.map(line => ' '.repeat(2 + offset) + line), '  :::'].map(line => q + line).join('\n') + '\n'
    test(`${host}, depth ${depth}, ${kind}, offset ${offset}: opens inside the box`, () => {
      assert.ok(compact(source(false)).includes('<div class="box">' + expected + '</div>'), html(source(false)))
    })
    test(`${host}, depth ${depth}, ${kind}, offset ${offset}: an open paragraph keeps text`, () => {
      let owner = parse(source(true)).blocks[0]
      for (let n = 0; n < depth; n++) owner = owner.children[0]
      const box = owner.items[0].blocks.at(-1)
      assert.equal(box.t, 'colon-div')
      assert.deepEqual(box.children, [{t: 'para', lines: ['text', ...lines]}])
    })
  }
}

const rootText = {
  colon: '<p>:::: innerx::::</p>', line: '<p>::: |x:::</p>',
  backtick: '<p><code>x</code></p>', tilde: '<p>~~~x~~~</p>',
  heading: '<p># h</p>', quote: '<p>&gt; x</p>', break: '<p>\u2014</p>', table: '<p>| x |</p>',
}
for (const [kind, [lines]] of Object.entries(kinds)) for (const offset of [1, 2, 4]) {
  const body = lines.map(line => ' '.repeat(offset) + line).join('\n') + '\n'
  test(`document root keeps shifted ${kind} at offset ${offset} as text`, () => {
    assert.equal(compact(body), rootText[kind])
  })
  test(`a root box keeps shifted ${kind} at offset ${offset} as text`, () => {
    assert.equal(compact('::: box\n' + body + ':::\n'), '<div class="box">' + rootText[kind] + '</div>')
  })
}
for (const sublist of [false, true]) test(`an item heading releases the child column, sublist ${sublist}`, () => {
  const source = '- outer\n' + (sublist ? '  - para\n    ```\n    code\n\n' : '') + '  # h\n    ```\n'
  assert.equal(compact(source), '<ul><li>outer' + (sublist ? '<ul><li>para<code>code</code></li></ul>' : '') + '<h1 id="h">h</h1><pre><code></code></pre></li></ul>')
})
test('a shifted reference definition stays paragraph text in a hosted box', () => {
  assert.equal(compact('- ::: box\n   [r]: /url\n  :::\n'), '<ul><li><div class="box"><p>[r]: /url</p></div></li></ul>')
})
for (const nested of [false, true]) test(`a comment retains the below-child-column fence as text, nested box ${nested}`, () => {
  const source = '> - ::: box\n>   - ' + (nested ? '::: inner' : 'inner') + '\n>     %%%\n>     hidden\n>     %%%\n>    ```\n>    code\n- tail\n'
  const inner = nested ? '<div class="inner"><p><code>code- tail</code></p></div>' : 'inner<code>code- tail</code>'
  assert.equal(compact(source), '<blockquote><ul><li><div class="box"><ul><li>' + inner + '</li></ul></div></li></ul></blockquote>')
})
