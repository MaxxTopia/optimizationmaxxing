import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const catalogPath = path.join(root, 'resources', 'catalog', 'v1.json')
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
const errors = []
const warnings = []
const ids = new Set()
const legacyExperimentalIds = new Set([
  'process.cpu-mitigations.disable-DANGER',
  'process.msi-mode.gpu-nic-audio',
  'bcd.hypervisorlaunchtype.off',
  'vbs.hvci.disable',
  'bcd.tscsyncpolicy.enhanced',
  'process.core-parking.disable',
  'power.pcie.link-state.off',
  'hid.mouse.priority-realtime',
  'process.priority-separation.foreground',
  'process.hpet.disable',
  'bcd.useplatformclock.disable',
  'bcd.disabledynamictick.yes',
  'privacy.smartscreen.disable',
  'net.nic.interrupt-moderation.disable',
])

if (!Array.isArray(catalog.tweaks) || catalog.tweaks.length === 0) {
  errors.push('catalog has no tweaks')
}

for (const tweak of catalog.tweaks ?? []) {
  if (!tweak.id || ids.has(tweak.id)) errors.push(`duplicate or empty id: ${tweak.id || '(empty)'}`)
  ids.add(tweak.id)
  for (const field of ['title', 'description', 'rationale', 'riskLevel', 'vipGate', 'actions']) {
    if (tweak[field] == null) errors.push(`${tweak.id}: missing ${field}`)
  }
  if (![1, 2, 3, 4].includes(tweak.riskLevel)) errors.push(`${tweak.id}: invalid riskLevel`)
  if (!['free', 'vip'].includes(tweak.vipGate)) errors.push(`${tweak.id}: invalid vipGate`)
  if (!Array.isArray(tweak.actions) || tweak.actions.length === 0) {
    errors.push(`${tweak.id}: no actions`)
    continue
  }
  const experimental = tweak.experimental === true || tweak.riskLevel === 4 || legacyExperimentalIds.has(tweak.id)
  if (experimental && !tweak.experimentalWarning) errors.push(`${tweak.id}: experimental entry has no explicit warning`)
  if (experimental && !tweak.expectedImpact) warnings.push(`${tweak.id}: experimental entry has no expected-impact copy`)
  for (const [index, action] of tweak.actions.entries()) {
    if (!action.kind) errors.push(`${tweak.id} action ${index + 1}: missing kind`)
    if (action.kind === 'powershell_script' && !action.revert) {
      warnings.push(`${tweak.id} action ${index + 1}: PowerShell action has no revert script`)
    }
    for (const key of ['apply', 'revert']) {
      if (typeof action[key] === 'string' && [...action[key]].some((char) => char.codePointAt(0) > 127)) {
        errors.push(`${tweak.id} action ${index + 1}: ${key} script is not ASCII-safe`)
      }
    }
    if (action.kind === 'file_write') {
      try {
        Buffer.from(action.contents_b64, 'base64')
      } catch {
        errors.push(`${tweak.id} action ${index + 1}: invalid base64 file contents`)
      }
    }
  }
}

const presetDir = path.join(root, 'resources', 'community-presets')
for (const name of fs.readdirSync(presetDir).filter((file) => file.endsWith('.json'))) {
  const preset = JSON.parse(fs.readFileSync(path.join(presetDir, name), 'utf8'))
  for (const id of preset.tweakIds ?? []) {
    if (!ids.has(id)) warnings.push(`${name}: missing catalog id ${id}`)
  }
}

const riskCounts = {}
const evidenceCounts = {}
for (const tweak of catalog.tweaks ?? []) {
  riskCounts[tweak.riskLevel] = (riskCounts[tweak.riskLevel] ?? 0) + 1
  const tier = tweak.evidenceTier ?? 'ungraded'
  evidenceCounts[tier] = (evidenceCounts[tier] ?? 0) + 1
}

console.log(`catalog ${catalog.version}: ${catalog.tweaks.length} tweaks`)
console.log(`risk: ${JSON.stringify(riskCounts)}`)
console.log(`evidence: ${JSON.stringify(evidenceCounts)}`)
console.log(`experimental-or-risk4: ${catalog.tweaks.filter((t) => t.experimental === true || t.riskLevel === 4).length}`)
console.log(`errors: ${errors.length}`)
console.log(`warnings: ${warnings.length}`)
for (const item of errors) console.log(`ERROR ${item}`)
for (const item of warnings) console.log(`WARN ${item}`)

if (errors.length > 0) process.exitCode = 1
