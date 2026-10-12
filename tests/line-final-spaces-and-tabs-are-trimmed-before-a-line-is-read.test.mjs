import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parse } from '../scripts/spec/layout.mjs'
import { renderDoc } from '../scripts/spec/html.mjs'

const render = (source) => renderDoc(parse(source))

const cases = [
  ['abbreviation definition', '*[A]: b\n\nA\n', 0],
  ['attribute in an item', '- a\n\n  {.x}\n  - b\n', 2],
  ['attribute past an item column', '- a\n\n   {.x}\n   - b\n', 2],
  ['attribute in a note', '[^n]: a\n\n    {.x}\n    b\n\nText[^n]\n', 2],
  ['captioned image in an item', '- a\n\n    ![alt](image.png)\n    ^ caption\n', 2],
  ['captioned image in a note', '[^n]: a\n\n    ![alt](image.png)\n    ^ caption\n\nText[^n]\n', 2],
  ['blank quote marker', '> a\n>\n> b\n', 1],
  ['blank nested quote marker', '> > a\n> >\n> > b\n', 1],
  ['blank quote marker on a bullet', '- >\n  > b\n', 0],
  ['blank quote marker on an ordered item', '. >\n  > b\n', 0],
  ['backslash at a line boundary', 'a\\\nb\n', 0],
]

for (const [name, source, index] of cases) {
  for (const suffix of [' ', '\t']) {
    test(`${name} drops a trailing ${suffix === ' ' ? 'space' : 'tab'}`, () => {
      const lines = source.split('\n')
      lines[index] += suffix
      assert.equal(render(lines.join('\n')), render(source))
    })
  }
}

test('a line-block body keeps a two-column trailing gap', () => {
  assert.equal(
    render('::: |\na  \n:::\n'),
    '<div class="line-block">\n  <p>a&nbsp;&nbsp;</p>\n</div>',
  )
  assert.equal(render('::: |\na \n:::\n'), render('::: |\na\n:::\n'))
  assert.match(render('::: |\na\t\n:::\n'), /a&nbsp;&nbsp;&nbsp;/)
})
