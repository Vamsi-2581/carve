import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parse } from '../scripts/spec/layout.mjs'
import { renderDoc } from '../scripts/spec/html.mjs'

const corpus = (suffix = '') => {
  const path = new URL(`./corpus/638-nested-plus-below-fence-and-description${suffix}`, import.meta.url)
  return {
    source: readFileSync(new URL(`${path.pathname}.crv`, path), 'utf8'),
    html: readFileSync(new URL(`${path.pathname}.html`, path), 'utf8'),
  }
}

for (const suffix of ['', '-2', '-3']) {
  test(`corpus 638${suffix}: exact HTML and owner AST`, () => {
    const { source, html } = corpus(suffix)
    const ast = parse(source)
    assert.equal(renderDoc(ast).trim(), html.trim())
    if (suffix === '') {
      const inner = ast.blocks[0].items[0].blocks[0].items[0]
      assert.deepEqual(inner.blocks.map(block => block.t), ['code', 'para'])
      assert.deepEqual(inner.blocks[1].lines, ['x'])
      assert.equal(ast.blocks[0].items[0].blocks.length, 1)
    } else if (suffix === '-2') {
      const outer = ast.blocks[0]
      const inner = outer.items[0].blocks[1].items[0]
      assert.equal(outer.tight, false)
      assert.deepEqual(inner.blocks.map(block => block.t), ['code', 'quote'])
      assert.equal(outer.items[0].blocks.length, 2)
    } else {
      const outer = ast.blocks[0].items[1]
      const inner = outer.ddBlocks[1].items[1]
      assert.deepEqual(inner.ddBlocks.map(block => block.t), ['para', 'code'])
      assert.equal(outer.ddBlocks.length, 2)
    }
  })
}

for (const fence of ['```', '~~~']) for (const blanks of [1, 2, 3]) {
  test(`nested marker owns its follower below ${fence} and ${blanks} blank lines`, () => {
    const source = `- - ${fence}\n${'\n'.repeat(blanks)}  +\n  x\n`
    const ast = parse(source)
    const inner = ast.blocks[0].items[0].blocks[0].items[0]
    assert.deepEqual(inner.blocks.map(block => block.t), ['code', 'para'])
    assert.equal(inner.blocks[0].text, '\n'.repeat(blanks))
    assert.deepEqual(inner.blocks[1].lines, ['x'])
  })
}

test('a plus one column past the nested marker follows the letter control', () => {
  const source = '- - ```\n\n   +\n   x\n'
  const letter = source.replace('   +\n', '   z\n')
  assert.equal(renderDoc(parse(source)).replace('<p>+', '<p>z'), renderDoc(parse(letter)))
})

test('nested description marker reaches its own body, not its parent', () => {
  for (const follower of ['```\n   code\n   ```', '> q']) {
    const source = `:: t\n:  d\n   :: term\n   :  detail\n   +\n   ${follower}\n`
    const ast = parse(source)
    const outer = ast.blocks[0].items[1]
    const inner = outer.ddBlocks[1].items[1]
    assert.deepEqual(inner.ddBlocks.map(block => block.t), ['para', follower[0] === '>' ? 'quote' : 'code'])
    assert.equal(outer.ddBlocks.length, 2)
  }
})

test('nested fence marker probes grow with the input', () => {
  for (const repeats of [20, 40, 80, 160]) {
    const source = '- a\n  - ```\n    x\n' + ('\n  +\n  > q\n').repeat(repeats)
    const sink = {}
    parse(source, { stateSink: sink })
    assert.ok(sink.markerFenceProbeSteps > 0)
    assert.ok(sink.markerFenceProbeSteps <= 5 * repeats, `${repeats}: ${sink.markerFenceProbeSteps}`)
  }
})
