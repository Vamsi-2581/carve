import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sourceFingerprint, createSourcePatch, applySourcePatch } from '@markup-carve/carve'

const fixture = JSON.parse(readFileSync(new URL('../resources/source-patch-fixtures.json', import.meta.url), 'utf8'))

test('shared fingerprint rows match the pinned engine', () => {
  assert.ok(fixture.fingerprints.length > 0)
  for (const { source, fingerprint } of fixture.fingerprints) {
    assert.equal(sourceFingerprint(source), fingerprint)
  }
})

test('shared replacement rows apply to their source revision', () => {
  assert.ok(fixture.replacements.length > 0)
  for (const { source, replacement } of fixture.replacements) {
    const patch = createSourcePatch(source, replacement)
    assert.equal(patch.sourceFingerprint, sourceFingerprint(source))
    assert.equal(applySourcePatch(source, patch), replacement)
    assert.throws(() => applySourcePatch(source + 'x', patch), /precondition/)
  }
})
