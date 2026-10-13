import test from 'node:test'
import assert from 'node:assert/strict'
import { parse } from '../scripts/spec/layout.mjs'
import { renderDoc } from '../scripts/spec/html.mjs'

const render = source => renderDoc(parse(source + '\n'))
const code = '<ul>\n  <li>t\n    <pre class="c"><code>x\n</code></pre>\n  </li>\n</ul>'

for (const [name, source] of [
  ['unclosed', '- t\n  {.c}\n   ````\n  x'],
  ['comment between attribute and fence', '- t\n  {.c}\n  %% c\n   ````\n  x'],
  ['closed', '- t\n  {.c}\n   ````\n  x\n  `````'],
]) test(name, () => assert.equal(render(source), code))

test('the no-attribute control stays a code block', () => {
  assert.match(render('- t\n  %% c\n   ````\n  x'), /<pre><code>x\n<\/code><\/pre>/)
})

test('the tab original strips payload from the authored base', () => {
  const html = render('- t\n  \t> q\n   \t{.c}\n\t\t%% c\n  \t ````\n \t{.c}\n \t```')
  assert.match(html, /<blockquote><p>q<\/p><\/blockquote>\s*<pre class="c"><code>\{\.c\}\n```\n<\/code><\/pre>/)
})
