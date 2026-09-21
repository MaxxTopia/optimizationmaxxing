import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const sourcePath = fileURLToPath(new URL('../src/lib/biosEvidenceCatalog.ts', import.meta.url))
const source = await readFile(sourcePath, 'utf8')
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText
const moduleRecord = { exports: {} }
new Function('exports', 'module', 'require', output)(
  moduleRecord.exports,
  moduleRecord,
  createRequire(import.meta.url),
)

const { BOARD_EVIDENCE_PROFILES, resolveBoardEvidence } = moduleRecord.exports
let checks = 0

function check(description, assertion) {
  assertion()
  checks += 1
  console.log(`PASS ${description}`)
}

function audit(overrides = {}) {
  return {
    biosMode: null,
    secureBoot: null,
    tpmEnabled: null,
    cpuBrand: null,
    smtEnabled: null,
    ramSpeedMhz: null,
    ramConfiguredMhz: null,
    ramType: null,
    expoXmpActive: null,
    powerPlanGuid: null,
    powerPlanName: null,
    moboManufacturer: null,
    moboProduct: null,
    moboRevision: null,
    biosVendor: null,
    biosVersion: null,
    biosReleaseDate: null,
    ...overrides,
  }
}

function resolve(overrides) {
  return resolveBoardEvidence(audit(overrides))
}

check('catalog record IDs, source URLs, and review dates are structurally valid', () => {
  const ids = new Set()
  for (const profile of BOARD_EVIDENCE_PROFILES) {
    assert.ok(!ids.has(profile.id), `duplicate profile id: ${profile.id}`)
    ids.add(profile.id)
    assert.match(profile.checkedOn, /^\d{4}-\d{2}-\d{2}$/)
    for (const url of [profile.manualUrl, profile.supportUrl, profile.biosUrl, profile.cpuSupportUrl]) {
      assert.equal(new URL(url).protocol, 'https:')
    }
    for (const evidence of profile.cpuSupportEvidence) {
      assert.match(evidence.checkedOn, /^\d{4}-\d{2}-\d{2}$/)
      assert.equal(new URL(evidence.sourceUrl).protocol, 'https:')
    }
  }
})

check('ASRock SMBIOS manufacturer alias resolves only the X570 exact model', () => {
  const result = resolve({
    moboManufacturer: 'ASRock Inc.',
    moboProduct: 'X570 Steel Legend',
    cpuBrand: 'AMD Ryzen 7 2700 Eight-Core Processor',
  })
  assert.equal(result.boardMatchStatus, 'matched')
  assert.equal(result.matchKind, 'alias')
  assert.equal(result.profile.id, 'asrock-x570-steel-legend')
  assert.equal(result.cpuSupport.status, 'listed')
})

check('near-match motherboard SKUs do not receive another board profile', () => {
  const result = resolve({
    moboManufacturer: 'ASRock',
    moboProduct: 'X570 Steel Legend WiFi',
    cpuBrand: 'AMD Ryzen 7 2700',
  })
  assert.equal(result.boardMatchStatus, 'not-found')
  assert.equal(result.profile, null)
})

check('ASUS OEM name and Windows trademarked i9-14900K string match the exact support row', () => {
  const result = resolve({
    moboManufacturer: 'ASUSTeK COMPUTER INC.',
    moboProduct: 'ROG STRIX Z790-E GAMING WIFI',
    cpuBrand: 'Intel(R) Core(TM) i9-14900K',
  })
  assert.equal(result.boardMatchStatus, 'matched')
  assert.equal(result.matchKind, 'alias')
  assert.equal(result.cpuSupport.evidence.model, 'Intel Core i9-14900K')
  assert.equal(result.cpuSupport.evidence.biosRequirement.version, '1202')
})

check('i9-14900KF and i9-14900KS do not collapse into the i9-14900K row', () => {
  const common = {
    moboManufacturer: 'ASUS',
    moboProduct: 'ROG STRIX Z790-E GAMING WIFI',
  }
  const kf = resolve({ ...common, cpuBrand: 'Intel Core i9-14900KF' })
  const ks = resolve({ ...common, cpuBrand: 'Intel Core i9-14900KS' })
  assert.equal(kf.cpuSupport.evidence.model, 'Intel Core i9-14900KF')
  assert.equal(kf.cpuSupport.evidence.biosRequirement.version, '1202')
  assert.equal(ks.cpuSupport.evidence.model, 'Intel Core i9-14900KS')
  assert.equal(ks.cpuSupport.evidence.biosRequirement.version, '2002')
})

check('ASRock Z790 + i9-14900K returns its own OEM minimum BIOS, not ASUS data', () => {
  const result = resolve({
    moboManufacturer: 'ASRock',
    moboProduct: 'Z790 Steel Legend WiFi',
    cpuBrand: 'Intel Core i9-14900K',
  })
  assert.equal(result.profile.id, 'asrock-z790-steel-legend-wifi')
  assert.equal(result.cpuSupport.evidence.biosRequirement.version, '10.08')
})

check('revision-scoped Gigabyte profile requires the exact reviewed revision', () => {
  const identity = {
    moboManufacturer: 'Gigabyte Technology Co., Ltd.',
    moboProduct: 'Z790 AORUS ELITE AX',
  }
  assert.equal(resolve({ ...identity, moboRevision: '1.0' }).boardMatchStatus, 'matched')
  assert.equal(resolve({ ...identity, moboRevision: 'Rev. 1.0' }).boardMatchStatus, 'matched')

  const unknownRevision = resolve(identity)
  assert.equal(unknownRevision.boardMatchStatus, 'revision-unreported')
  assert.equal(unknownRevision.profile, null)
  assert.equal(unknownRevision.candidateProfile.id, 'gigabyte-z790-aorus-elite-ax-rev-10')
  assert.deepEqual(unknownRevision.reviewedRevisions, ['1.0'])

  const mismatch = resolve({ ...identity, moboRevision: '1.1' })
  assert.equal(mismatch.boardMatchStatus, 'revision-mismatch')
  assert.equal(mismatch.profile, null)
})

check('known board with an uncurated CPU stays unknown rather than borrowing a CPU row', () => {
  const result = resolve({
    moboManufacturer: 'MSI',
    moboProduct: 'MAG Z790 TOMAHAWK WIFI',
    cpuBrand: 'Intel Core i9-14900K',
  })
  assert.equal(result.boardMatchStatus, 'matched')
  assert.equal(result.cpuSupport.status, 'not-curated')
  assert.ok(result.supportUrl.includes('msi.com/Motherboard/MAG-Z790-TOMAHAWK-WIFI'))
})

check('unknown and incomplete board identities retain a non-guessing fallback', () => {
  const unknownModel = resolve({ moboManufacturer: 'MSI', moboProduct: 'Unknown Board', cpuBrand: 'Intel Core i9-14900K' })
  assert.equal(unknownModel.boardMatchStatus, 'not-found')
  assert.equal(unknownModel.cpuSupport.status, 'board-unprofiled')
  assert.equal(unknownModel.supportUrl, 'https://www.msi.com/support')

  const incomplete = resolve({ moboManufacturer: 'ASUS', cpuBrand: 'Intel Core i9-14900K' })
  assert.equal(incomplete.boardMatchStatus, 'identity-incomplete')
  assert.equal(incomplete.profile, null)

  const otherOems = [
    ['BIOSTAR Group', 'https://www.biostar.com.tw/app/en/support/download.php'],
    ['Dell Inc.', 'https://www.dell.com/support/home/en-us'],
    ['HP Inc.', 'https://support.hp.com/us-en'],
    ['LENOVO', 'https://support.lenovo.com/us/en'],
    ['Acer', 'https://www.acer.com/us-en/support/'],
    ['Super Micro Computer, Inc.', 'https://www.supermicro.com/en/support'],
    ['NZXT, Inc.', 'https://support.nzxt.com/hc/en-us/sections/39003384521627-Motherboards'],
  ]
  for (const [manufacturer, url] of otherOems) {
    assert.equal(resolve({ moboManufacturer: manufacturer, moboProduct: 'Unlisted model' }).supportUrl, url)
  }
})

console.log(`\n${checks} BIOS evidence catalog checks passed.`)
