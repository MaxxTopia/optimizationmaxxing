import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'resources', 'catalog', 'v1.json'), 'utf8'))
const astaSource = fs.readFileSync(path.join(root, 'src', 'pages', 'Asta.tsx'), 'utf8')
const verifierSource = fs.readFileSync(path.join(root, 'src', 'lib', 'powershellVerifiers.ts'), 'utf8')
const tweaks = new Map((catalog.tweaks ?? []).map((tweak) => [tweak.id, tweak]))
const errors = []

// These are the user-visible capabilities that must remain represented in the
// catalog. The audit checks presence and contract metadata, not that every rig
// can expose every driver control.
const required = [
  'process.fortnite.priority-high',
  'ui.mouse.disable-acceleration',
  'ui.gamemode.enable',
  'ui.gamedvr.disable',
  'process.hags.enable',
  'ps.power.dt-tournament',
  'net.nic.rss.enable',
  'net.nic.eee-powersave.disable',
  'net.nic.interrupt-moderation.disable',
  'process.background-apps.disable',
  'nvidia.nvpi.fortnite-profile',
]

const verifierIds = new Set(
  [...verifierSource.matchAll(/^\s*'([^']+)':/gm)].map((match) => match[1]),
)

for (const id of required) {
  const tweak = tweaks.get(id)
  if (!tweak) {
    errors.push(`${id}: required Fortnite capability is missing from the catalog`)
    continue
  }
  if (!Array.isArray(tweak.actions) || tweak.actions.length === 0) {
    errors.push(`${id}: required capability has no action`)
  }
  if (!tweak.description?.trim() || !tweak.rationale?.trim()) {
    errors.push(`${id}: required capability is missing user-facing explanation`)
  }
  if (tweak.actions?.some((action) => action.kind === 'powershell_script') && !verifierIds.has(id)) {
    // NVPI is intentionally manual because Profile Inspector is an external
    // dependency; all other required PowerShell rows need a declared verifier.
    if (id !== 'nvidia.nvpi.fortnite-profile') {
      errors.push(`${id}: PowerShell capability has no declared read-back verifier`)
    }
  }
}

for (const sourceFragment of [
  'PinnacleCoverageCard',
  'Apply all supported Pinnacle settings',
  'isTransactionActionEligible',
  'review-only, policy-owned, unsupported, and ambiguous rows stay out automatically',
]) {
  if (!astaSource.includes(sourceFragment)) {
    errors.push(`Asta coverage boundary is missing source fragment: ${sourceFragment}`)
  }
}

const present = required.filter((id) => tweaks.has(id))
const explicitlyRepresented = present.filter((id) =>
  astaSource.includes(`'${id}'`) && id !== 'nvidia.nvpi.fortnite-profile',
)

console.log(`Pinnacle coverage audit: catalog ${catalog.version}`)
console.log(`Required Fortnite capabilities: ${present.length}/${required.length}`)
console.log(`Required capabilities represented in Asta policy/source: ${explicitlyRepresented.length}`)
console.log(`External/manual boundary: NVIDIA Profile Inspector, CPU Sets, BIOS/firmware, router/ISP controls`)
console.log(`errors: ${errors.length}`)
for (const error of errors) console.log(`ERROR ${error}`)

if (errors.length > 0) process.exitCode = 1
