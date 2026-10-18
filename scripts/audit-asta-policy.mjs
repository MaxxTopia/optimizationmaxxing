import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const catalogPath = path.join(root, 'resources', 'catalog', 'v1.json')
const astaPath = path.join(root, 'src', 'pages', 'Asta.tsx')
const verifierPath = path.join(root, 'src', 'lib', 'powershellVerifiers.ts')

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
const astaSource = fs.readFileSync(astaPath, 'utf8')
const verifierSource = fs.readFileSync(verifierPath, 'utf8')
const errors = []

function parseNamedSet(name) {
  const match = astaSource.match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\)`))
  if (!match) {
    errors.push(`Asta source is missing the ${name} policy set`)
    return []
  }
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1])
}

function assertNoDuplicates(name, ids) {
  const seen = new Set()
  for (const id of ids) {
    if (seen.has(id)) errors.push(`${name}: duplicate id ${id}`)
    seen.add(id)
  }
}

const experimentalIds = parseNamedSet('PINNACLE_EXPERIMENTAL_IDS')
const baselineIds = parseNamedSet('PINNACLE_BASELINE_IDS')
const firstApplyIds = parseNamedSet('SAFE_FIRST_APPLY_IDS')
const allIds = new Set((catalog.tweaks ?? []).map((tweak) => tweak.id))
const tweaks = new Map((catalog.tweaks ?? []).map((tweak) => [tweak.id, tweak]))
const verifierIds = new Set(
  [...verifierSource.matchAll(/^\s*'([^']+)':/gm)].map((match) => match[1]),
)

assertNoDuplicates('PINNACLE_EXPERIMENTAL_IDS', experimentalIds)
assertNoDuplicates('PINNACLE_BASELINE_IDS', baselineIds)
assertNoDuplicates('SAFE_FIRST_APPLY_IDS', firstApplyIds)

for (const [name, ids] of [
  ['PINNACLE_EXPERIMENTAL_IDS', experimentalIds],
  ['PINNACLE_BASELINE_IDS', baselineIds],
  ['SAFE_FIRST_APPLY_IDS', firstApplyIds],
]) {
  for (const id of ids) {
    if (!allIds.has(id)) errors.push(`${name}: ${id} is not present in the catalog`)
  }
}

for (const id of experimentalIds) {
  if (baselineIds.includes(id)) errors.push(`Pinnacle experimental and baseline lanes overlap at ${id}`)
}

const supportedNativeKinds = new Set([
  'registry_set',
  'registry_delete',
  'bcdedit_set',
  'file_write',
  'display_refresh',
])
const staticGameFile = /(?:GameUserSettings\.ini|Engine\.ini|videoconfig\.txt|autoexec\.cfg)$/i

function validateNamedRow(id, lane) {
  const tweak = tweaks.get(id)
  if (!tweak) return

  if (tweak.riskLevel > 3) errors.push(`${lane} ${id}: risk 4/security changes cannot enter the automatic Pinnacle lane`)
  if (tweak.anticheatRisk !== 'none') errors.push(`${lane} ${id}: anti-cheat risk must be none`)
  if (Object.values(tweak.tournamentCompliance ?? {}).some((value) => value === 'breaks')) {
    errors.push(`${lane} ${id}: tournament-breaking metadata cannot enter the automatic Pinnacle lane`)
  }
  if (!['situational', 'measured', 'mechanism'].includes(tweak.evidenceTier ?? '')) {
    errors.push(`${lane} ${id}: evidence tier must be situational, measured, or mechanism`)
  }
  if (!tweak.experimentalWarning) errors.push(`${lane} ${id}: missing experimental warning`)
  if (!tweak.expectedImpact) errors.push(`${lane} ${id}: missing expected-impact copy`)
  if (!Array.isArray(tweak.actions) || tweak.actions.length === 0) {
    errors.push(`${lane} ${id}: automatic row has no actions`)
    return
  }

  for (const [index, action] of tweak.actions.entries()) {
    if (action.kind === 'powershell_script') {
      if (!action.revert?.trim()) errors.push(`${lane} ${id} action ${index + 1}: PowerShell action has no restore script`)
      if (!verifierIds.has(id)) errors.push(`${lane} ${id}: PowerShell action has no declared read-back verifier`)
      continue
    }
    if (!supportedNativeKinds.has(action.kind)) {
      errors.push(`${lane} ${id} action ${index + 1}: unsupported native action kind ${action.kind}`)
    }
    if (action.kind === 'file_write' && staticGameFile.test(action.path ?? '')) {
      errors.push(`${lane} ${id}: static game-file writes cannot enter the automatic Pinnacle lane`)
    }
  }
}

for (const id of experimentalIds) validateNamedRow(id, 'Pinnacle experimental')
for (const id of baselineIds) validateNamedRow(id, 'Pinnacle baseline')

// These source-level assertions keep the safety boundary from being removed
// while changing the catalog or refactoring the page. They are intentionally
// small and release-facing: a failing check means the automatic plan needs a
// human review before it can ship.
for (const requiredSourceFragment of [
  'isTransactionActionEligible',
  "tweak.anticheatRisk !== 'none'",
  "['measured', 'mechanism']",
  'GameUserSettings\\.ini',
  'isSafeFirstApplyAudit',
  'audit.actions.some((action) => action.status === \'differs\')',
]) {
  if (!astaSource.includes(requiredSourceFragment)) {
    errors.push(`Asta automatic-policy guard is missing source fragment: ${requiredSourceFragment}`)
  }
}

console.log(`Asta policy audit: catalog ${catalog.version}, ${catalog.tweaks.length} rows`)
console.log(`Pinnacle defaults: ${experimentalIds.length + baselineIds.length} named rows (${experimentalIds.length} experimental, ${baselineIds.length} baseline)`)
console.log(`First-apply restore rows: ${firstApplyIds.length}`)
console.log(`errors: ${errors.length}`)
for (const error of errors) console.log(`ERROR ${error}`)

if (errors.length > 0) process.exitCode = 1
