import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const catalogPath = path.join(repoRoot, 'src', 'lib', 'driverProfiles.ts')
const profileDir = path.join(repoRoot, 'public', 'nvpi-profiles')
const tweakCatalogPath = path.join(repoRoot, 'resources', 'catalog', 'v1.json')

const catalog = await readFile(catalogPath, 'utf8')
const records = [...catalog.matchAll(/filename:\s*'([^']+\.nip)'[\s\S]*?sha256:\s*'([0-9a-f]{64})'/g)].map(
  ([, filename, sha256]) => ({ filename, sha256 }),
)

const errors = []
if (records.length === 0) {
  errors.push('no hashed .nip records found in src/lib/driverProfiles.ts')
}

const seen = new Set()
const parsedProfiles = []
for (const { filename, sha256 } of records) {
  if (seen.has(filename)) {
    errors.push(`duplicate catalog entry: ${filename}`)
    continue
  }
  seen.add(filename)
  try {
    const bytes = await readFile(path.join(profileDir, filename))
    const actual = createHash('sha256').update(bytes).digest('hex')
    if (actual !== sha256) {
      errors.push(`${filename}: catalog ${sha256} != file ${actual}`)
    }

    const text = bytes.toString('utf8')
    if (!/<ArrayOfProfile\b[\s\S]*<\/ArrayOfProfile>/.test(text)) {
      errors.push(`${filename}: missing ArrayOfProfile XML root`)
      continue
    }
    const profileBlocks = [...text.matchAll(/<Profile>([\s\S]*?)<\/Profile>/g)].map((match) => match[1])
    if (profileBlocks.length !== 1) {
      errors.push(`${filename}: expected exactly one Profile block, found ${profileBlocks.length}`)
      continue
    }
    const profileBlock = profileBlocks[0]
    const profileName = profileBlock.match(/<ProfileName>([^<]+)<\/ProfileName>/)?.[1]?.trim()
    if (!profileName) errors.push(`${filename}: missing ProfileName`)

    const executableBlock = profileBlock.match(/<Executeables>([\s\S]*?)<\/Executeables>/)?.[1] ?? ''
    const executables = [...executableBlock.matchAll(/<string>([^<]+)<\/string>/g)].map((match) => match[1].trim())
    if (executables.length === 0) errors.push(`${filename}: missing executable association`)

    const settingBlocks = [...profileBlock.matchAll(/<ProfileSetting>([\s\S]*?)<\/ProfileSetting>/g)].map((match) => match[1])
    if (settingBlocks.length === 0) errors.push(`${filename}: missing ProfileSetting entries`)
    for (const [index, setting] of settingBlocks.entries()) {
      const settingId = setting.match(/<SettingID>([^<]+)<\/SettingID>/)?.[1]?.trim() ?? ''
      const settingValue = setting.match(/<SettingValue>([^<]+)<\/SettingValue>/)?.[1]?.trim() ?? ''
      if (!/^\d+$/.test(settingId)) errors.push(`${filename}: setting ${index + 1} has a non-decimal SettingID`)
      if (!settingValue) errors.push(`${filename}: setting ${index + 1} has no SettingValue`)
      if (!/<SettingNameInfo>[^<]+<\/SettingNameInfo>/.test(setting)) {
        errors.push(`${filename}: setting ${index + 1} is missing SettingNameInfo`)
      }
      if (!/<ValueType>[^<]+<\/ValueType>/.test(setting)) {
        errors.push(`${filename}: setting ${index + 1} is missing ValueType`)
      }
    }
    parsedProfiles.push({ filename, profileName, executables })
  } catch (error) {
    errors.push(`${filename}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const executableOwners = new Map()
for (const profile of parsedProfiles) {
  for (const executable of new Set(profile.executables)) {
    const previous = executableOwners.get(executable)
    if (previous && previous.profileName !== profile.profileName) {
      errors.push(`${profile.filename}: ${executable} is also assigned to ${previous.profileName} in ${previous.filename}`)
    } else if (!previous) {
      executableOwners.set(executable, profile)
    }
  }
}

try {
  const tweakCatalog = JSON.parse(await readFile(tweakCatalogPath, 'utf8'))
  const nvpiTweak = tweakCatalog.tweaks?.find((tweak) => tweak.id === 'nvidia.nvpi.fortnite-profile')
  const applyScript = nvpiTweak?.actions?.find((action) => action.kind === 'powershell_script')?.apply ?? ''
  for (const required of [
    '<ProfileName>Fortnite</ProfileName>',
    '<string>FortniteClient-Win64-Shipping.exe</string>',
    '<string>FortniteLauncher.exe</string>',
    '<ValueType>Dword</ValueType>',
  ]) {
    if (!applyScript.includes(required)) errors.push(`nvidia.nvpi.fortnite-profile: generated profile is missing ${required}`)
  }
} catch (error) {
  errors.push(`could not inspect generated NVPI catalog action: ${error instanceof Error ? error.message : String(error)}`)
}

const actualFiles = (await readdir(profileDir)).filter((file) => file.endsWith('.nip')).sort()
const catalogFiles = [...seen].sort()
for (const filename of catalogFiles) {
  if (!actualFiles.includes(filename)) errors.push(`${filename}: catalog entry has no public artifact`)
}
for (const filename of actualFiles) {
  if (!seen.has(filename)) errors.push(`${filename}: public artifact has no catalog entry`)
}

if (errors.length > 0) {
  console.error(`driver profile audit failed (${errors.length})`)
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
} else {
  console.log(`driver profiles: ${records.length} catalog hashes + XML structure/conflict checks verified; artifacts match`)
}
