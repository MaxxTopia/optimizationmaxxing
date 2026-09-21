import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const catalogPath = path.join(repoRoot, 'src', 'lib', 'driverProfiles.ts')
const profileDir = path.join(repoRoot, 'public', 'nvpi-profiles')

const catalog = await readFile(catalogPath, 'utf8')
const records = [...catalog.matchAll(/filename:\s*'([^']+\.nip)'[\s\S]*?sha256:\s*'([0-9a-f]{64})'/g)].map(
  ([, filename, sha256]) => ({ filename, sha256 }),
)

const errors = []
if (records.length === 0) {
  errors.push('no hashed .nip records found in src/lib/driverProfiles.ts')
}

const seen = new Set()
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
  } catch (error) {
    errors.push(`${filename}: ${error instanceof Error ? error.message : String(error)}`)
  }
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
  console.log(`driver profiles: ${records.length} catalog hashes verified; artifacts match`)
}
