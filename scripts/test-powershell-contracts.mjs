import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'resources', 'catalog', 'v1.json'), 'utf8'))
const verifierSource = fs.readFileSync(path.join(root, 'src', 'lib', 'powershellVerifiers.ts'), 'utf8')
const verifierSection = verifierSource.match(
  /export const POWERSHELL_VERIFIERS[\s\S]*?^}/m,
)?.[0] ?? ''
const manualNotesSection = verifierSource.match(
  /export const POWERSHELL_MANUAL_VERIFICATION_NOTES[\s\S]*?^}/m,
)?.[0] ?? ''
const verifierIds = new Set(
  [...verifierSection.matchAll(/^\s*'([^']+)':/gm)].map((match) => match[1]),
)
const manualNoteIds = new Set(
  [...manualNotesSection.matchAll(/^\s*'([^']+)':/gm)].map((match) => match[1]),
)
const powerShellIds = new Set(
  catalog.tweaks
    .filter((tweak) => tweak.actions?.some((action) => action.kind === 'powershell_script'))
    .map((tweak) => tweak.id),
)

for (const id of powerShellIds) {
  assert.ok(
    verifierIds.has(id) || manualNoteIds.has(id),
    id + ' must have a read-back verifier or an explicit manual-verification note',
  )
}
for (const id of verifierIds) {
  assert.ok(powerShellIds.has(id), id + ' is a stale PowerShell verifier entry')
}
for (const id of manualNoteIds) {
  assert.ok(powerShellIds.has(id), id + ' is a stale manual-verification note')
  const escapedId = id.replace(/[.*+?^$()|[\]\\]/g, '\\$&')
  assert.match(manualNotesSection, new RegExp(escapedId + '[\\s\\S]*UNKNOWN:'))
}

for (const id of [
  'hosts.block.ms-telemetry',
  'hosts.block.windows-ads',
  'ps.hibernation.disable',
  'tasks.telemetry-batch.disable',
]) {
  assert.ok(verifierIds.has(id), id + ' needs a real read-back contract')
}
for (const id of ['audio.sample-rate.match', 'nvidia.nvpi.fortnite-profile']) {
  assert.ok(manualNoteIds.has(id), id + ' must remain explicitly manual')
  assert.ok(!verifierIds.has(id), id + ' must not claim a live verifier')
}

console.log('PowerShell contract audit passed: ' + powerShellIds.size + ' catalog actions classified (' + verifierIds.size + ' verified, ' + manualNoteIds.size + ' manual).')
