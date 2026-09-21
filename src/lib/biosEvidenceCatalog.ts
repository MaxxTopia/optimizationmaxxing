import type { BiosAudit } from './tauri'

export type CpuVendor = 'AMD' | 'Intel'

export interface BiosSettingEvidence {
  id: string
  name: string
  evidence: string
  menuPath: string
  /** Narrow a manual entry where the option is CPU-vendor-specific. */
  cpuVendorScope?: CpuVendor
  liveState: (audit: BiosAudit) => string
  guidance: string
}

export interface CpuSupportEvidence {
  model: string
  /** Whole-token aliases from Windows processor names or OEM product IDs. */
  aliases: string[]
  family: string
  biosRequirement: { kind: 'all' } | { kind: 'minimum'; version: string }
  sourceUrl: string
  checkedOn: string
}

export interface BoardEvidenceProfile {
  id: string
  manufacturer: string
  /** Exact SMBIOS manufacturer spellings for this OEM. */
  manufacturerAliases?: string[]
  product: string
  /** Exact alternate SMBIOS product strings for the same physical board. */
  productAliases?: string[]
  /** If present, this profile is usable only when the reported revision matches. */
  revisionScope?: string[]
  cpuVendor: CpuVendor
  manualUrl: string
  supportUrl: string
  biosUrl: string
  cpuSupportUrl: string
  cpuSupportEvidence: CpuSupportEvidence[]
  sourceLabel: string
  checkedOn: string
  settings: BiosSettingEvidence[]
}

export type CpuSupportStatus = 'listed' | 'not-curated' | 'unknown' | 'board-unprofiled' | 'platform-mismatch'

export interface CpuSupportResolution {
  status: CpuSupportStatus
  detectedCpuName: string | null
  evidence: CpuSupportEvidence | null
}

export interface BoardEvidenceResolution {
  boardMatchStatus: 'matched' | 'revision-unreported' | 'revision-mismatch' | 'identity-incomplete' | 'not-found' | 'ambiguous'
  matchKind: 'canonical' | 'alias' | 'none'
  profile: BoardEvidenceProfile | null
  /** A possible profile is shown for explanation only when revision evidence blocks use. */
  candidateProfile: BoardEvidenceProfile | null
  /** Explicitly reviewed hardware revisions for matching model records. */
  reviewedRevisions: string[]
  supportUrl: string | null
  cpuSupport: CpuSupportResolution
}

const UNKNOWN = 'Current firmware value is unknown from the Windows audit.'

/**
 * Exact-model evidence, not an assertion that a setting is exposed in every
 * BIOS revision. Add a profile only after checking the OEM manual/support
 * material, and preserve the source's firmware/CPU caveats in each entry.
 */
export const BOARD_EVIDENCE_PROFILES: BoardEvidenceProfile[] = [
  {
    id: 'asrock-x570-steel-legend',
    manufacturer: 'ASRock',
    manufacturerAliases: ['ASRock Inc.'],
    product: 'X570 Steel Legend',
    cpuVendor: 'AMD',
    manualUrl: 'https://download.asrock.com/Manual/X570%20Steel%20Legend.pdf',
    supportUrl: 'https://www.asrock.com/mb/AMD/X570%20Steel%20Legend/',
    biosUrl: 'https://www.asrock.com/mb/AMD/X570%20Steel%20Legend/bios.html',
    cpuSupportUrl: 'https://www.asrock.com/support/cpu.asp?s=AM4&u=574',
    cpuSupportEvidence: [
      {
        model: 'AMD Ryzen 7 2700',
        aliases: ['AMD Ryzen 7 2700', 'Ryzen 7 2700', 'YD2700BBM88AF'],
        family: 'Pinnacle Ridge',
        biosRequirement: { kind: 'all' },
        sourceUrl: 'https://www.asrock.com/support/cpu.asp?s=AM4&u=574',
        checkedOn: '2026-09-20',
      },
    ],
    sourceLabel: 'ASRock X570 Steel Legend User Manual and BIOS archive',
    checkedOn: '2026-09-20',
    settings: [
      {
        id: 'memory-xmp',
        name: 'Memory XMP profile',
        evidence: 'The model manual lists “Load XMP Setting” under OC Tweaker / DRAM Timing Configuration (printed p. 65).',
        menuPath: 'OC Tweaker → DRAM Timing Configuration → Load XMP Setting',
        liveState: (audit) => {
          const speed = audit.ramConfiguredMhz ? ` Windows reports ${audit.ramConfiguredMhz} MT/s configured.` : ''
          return `XMP selection, trained timings, DIMM kit rating, and stability are not exposed by this probe.${speed}`
        },
        guidance: 'Only test the rated profile for the exact memory kit. Do not copy timings or voltages from another kit; validate stability on this CPU and board.',
      },
      {
        id: 'smt',
        name: 'SMT Mode',
        evidence: 'The model manual documents SMT Mode under OC Tweaker and Advanced → CPU Configuration (printed pp. 65 and 69).',
        menuPath: 'OC Tweaker → SMT Mode (also listed under Advanced → CPU Configuration)',
        cpuVendorScope: 'AMD',
        liveState: (audit) => audit.smtEnabled == null
          ? 'Windows topology did not provide a usable SMT/HT signal.'
          : `Windows topology suggests SMT/HT is ${audit.smtEnabled ? 'enabled' : 'disabled'}; this is not a direct read-back of the BIOS option.`,
        guidance: 'Do not disable SMT as a universal latency tweak. Keep the vendor default unless repeated, same-scene game captures show a benefit for this workload.',
      },
      {
        id: 'secure-boot',
        name: 'Secure Boot',
        evidence: 'The model manual documents Secure Boot under the Security screen (printed p. 83).',
        menuPath: 'Security → Secure Boot',
        liveState: (audit) => audit.secureBoot == null
          ? UNKNOWN
          : `Windows reports Secure Boot ${audit.secureBoot ? 'enabled' : 'disabled'}.`,
        guidance: 'This is a security/eligibility setting, not a latency tweak. Keep it enabled where required by the game, event, or security policy.',
      },
      {
        id: 'above-4g',
        name: 'Above 4G Decoding',
        evidence: 'The model manual documents Above 4G Decoding on the Boot screen (printed p. 85).',
        menuPath: 'Boot → Above 4G Decoding',
        liveState: () => UNKNOWN,
        guidance: 'Not a direct input-latency tweak. Change it only for a supported PCIe/Re-Size BAR configuration, then verify the GPU/driver state; do not assume an FPS or latency gain.',
      },
    ],
  },
  {
    id: 'asus-rog-strix-z790-e-gaming-wifi',
    manufacturer: 'ASUS',
    manufacturerAliases: ['ASUSTeK COMPUTER INC.', 'ASUSTeK Computer Inc.'],
    product: 'ROG STRIX Z790-E GAMING WIFI',
    cpuVendor: 'Intel',
    manualUrl: 'https://dlcdnets.asus.com/pub/ASUS/mb/LGA1700/ROG_STRIX_Z790-E_GAMING_WIFI/E23863_ROG_STRIX_Z790_Series_BIOS_Manual_Intel_14th_EM_V2_WEB.pdf',
    supportUrl: 'https://www.asus.com/us/supportonly/rog%20strix%20z790-e%20gaming%20wifi/helpdesk_manual/',
    biosUrl: 'https://www.asus.com/us/supportonly/rog%20strix%20z790-e%20gaming%20wifi/helpdesk_bios/',
    cpuSupportUrl: 'https://www.asus.com/us/supportonly/rog%20strix%20z790-e%20gaming%20wifi/helpdesk_qvl_cpu/',
    cpuSupportEvidence: [
      {
        model: 'Intel Core i9-14900K',
        aliases: ['i9-14900K', 'Core i9-14900K'],
        family: 'Raptor Lake-S Refresh',
        biosRequirement: { kind: 'minimum', version: '1202' },
        sourceUrl: 'https://www.asus.com/us/supportonly/rog%20strix%20z790-e%20gaming%20wifi/helpdesk_qvl_cpu/',
        checkedOn: '2026-09-20',
      },
      {
        model: 'Intel Core i9-14900KF',
        aliases: ['i9-14900KF', 'Core i9-14900KF'],
        family: 'Raptor Lake-S Refresh',
        biosRequirement: { kind: 'minimum', version: '1202' },
        sourceUrl: 'https://www.asus.com/us/supportonly/rog%20strix%20z790-e%20gaming%20wifi/helpdesk_qvl_cpu/',
        checkedOn: '2026-09-20',
      },
      {
        model: 'Intel Core i9-14900KS',
        aliases: ['i9-14900KS', 'Core i9-14900KS'],
        family: 'Raptor Lake-S Refresh',
        biosRequirement: { kind: 'minimum', version: '2002' },
        sourceUrl: 'https://www.asus.com/us/supportonly/rog%20strix%20z790-e%20gaming%20wifi/helpdesk_qvl_cpu/',
        checkedOn: '2026-09-20',
      },
    ],
    sourceLabel: 'ASUS ROG STRIX Z790-E support page, CPU support list, and 14th Gen BIOS manual',
    checkedOn: '2026-09-20',
    settings: [
      {
        id: 'memory-xmp',
        name: 'Memory XMP profile',
        evidence: 'The 14th Gen ROG STRIX Z790 BIOS manual documents Ai Overclock Tuner options including XMP I and XMP II; available options vary by installed DIMM.',
        menuPath: 'Ai Tweaker → Ai Overclock Tuner → XMP I / XMP II',
        liveState: (audit) => {
          const speed = audit.ramConfiguredMhz ? ` Windows reports ${audit.ramConfiguredMhz} MT/s configured.` : ''
          return `Windows cannot confirm the selected XMP profile, trained timings, kit rating, or stability.${speed}`
        },
        guidance: 'This is a memory-profile location, not a guaranteed latency win. Use only a profile supported by the exact DIMM kit and CPU memory controller; validate stability and compare repeatable game captures.',
      },
    ],
  },
  {
    id: 'asrock-z790-steel-legend-wifi',
    manufacturer: 'ASRock',
    manufacturerAliases: ['ASRock Inc.'],
    product: 'Z790 Steel Legend WiFi',
    cpuVendor: 'Intel',
    manualUrl: 'https://download.asrock.com/Manual/Z790%20Steel%20Legend%20WiFi.pdf',
    supportUrl: 'https://www.asrock.com/mb/Intel/Z790%20Steel%20Legend%20WiFi/index.asp',
    biosUrl: 'https://www.asrock.com/mb/Intel/Z790%20Steel%20Legend%20WiFi/bios.html',
    cpuSupportUrl: 'https://www.asrock.com/support/cpu.asp?s=1700&u=1384',
    cpuSupportEvidence: [
      {
        model: 'Intel Core i9-14900K',
        aliases: ['i9-14900K', 'Core i9-14900K'],
        family: 'Raptor Lake-S Refresh',
        biosRequirement: { kind: 'minimum', version: '10.08' },
        sourceUrl: 'https://www.asrock.com/support/cpu.asp?s=1700&u=1384',
        checkedOn: '2026-09-20',
      },
    ],
    sourceLabel: 'ASRock Z790 Steel Legend WiFi User Manual, BIOS archive, and CPU support list',
    checkedOn: '2026-09-20',
    settings: [],
  },
  {
    id: 'msi-mag-z790-tomahawk-wifi',
    manufacturer: 'MSI',
    manufacturerAliases: ['Micro-Star International Co., Ltd.', 'Micro-Star International'],
    product: 'MAG Z790 TOMAHAWK WIFI',
    cpuVendor: 'Intel',
    manualUrl: 'https://download.msi.com/archive/mnu_exe/mb/MAGZ790TOMAHAWKWIFI.pdf',
    supportUrl: 'https://www.msi.com/Motherboard/MAG-Z790-TOMAHAWK-WIFI/support',
    biosUrl: 'https://www.msi.com/Motherboard/MAG-Z790-TOMAHAWK-WIFI/support',
    cpuSupportUrl: 'https://www.msi.com/support/motherboard/cpu-support',
    cpuSupportEvidence: [],
    sourceLabel: 'MSI MAG Z790 TOMAHAWK WIFI product page and model manual',
    checkedOn: '2026-09-20',
    settings: [],
  },
  {
    id: 'gigabyte-z790-aorus-elite-ax-rev-10',
    manufacturer: 'GIGABYTE',
    manufacturerAliases: ['Gigabyte Technology Co., Ltd.', 'GIGA-BYTE Technology Co., Ltd.'],
    product: 'Z790 AORUS ELITE AX',
    revisionScope: ['1.0'],
    cpuVendor: 'Intel',
    manualUrl: 'https://download.gigabyte.com/FileList/Manual/mb_manual_z790-ae-series_1104_e.pdf?v=5568e58ee416d6c8d3d88d15ad0bb1ad',
    supportUrl: 'https://www.gigabyte.com/Motherboard/Z790-AORUS-ELITE-AX-rev-10/support',
    biosUrl: 'https://www.gigabyte.com/Motherboard/Z790-AORUS-ELITE-AX-rev-10/support',
    cpuSupportUrl: 'https://www.gigabyte.com/Motherboard/Z790-AORUS-ELITE-AX-rev-10/support',
    cpuSupportEvidence: [],
    sourceLabel: 'GIGABYTE Z790 AORUS ELITE AX Rev. 1.0 support page and manual',
    checkedOn: '2026-09-20',
    settings: [],
  },
]

function normalizeIdentity(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function normalizeRevision(value: string | null | undefined): string {
  const revision = (value ?? '').trim().replace(/^(?:revision|rev\.?)[\s:#-]*/i, '')
  return normalizeIdentity(revision)
}

function detectCpuVendor(cpuName: string): CpuVendor | null {
  if (/\b(?:amd|ryzen|threadripper|athlon|epyc)\b/i.test(cpuName)) return 'AMD'
  if (/\b(?:intel|core\s+i[3579]|xeon|pentium|celeron)\b/i.test(cpuName)) return 'Intel'
  return null
}

function normalizeCpuPhrase(value: string): string {
  return value.toLowerCase().replace(/[®™©]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
}

function matchesCpuAlias(cpuName: string, alias: string): boolean {
  const name = normalizeCpuPhrase(cpuName)
  const phrase = normalizeCpuPhrase(alias)
  return Boolean(phrase) && ` ${name} `.includes(` ${phrase} `)
}

function vendorSupportUrl(manufacturer: string | null): string | null {
  const vendor = normalizeIdentity(manufacturer)
  const supportPortals: Array<{ aliases: string[]; url: string }> = [
    { aliases: ['asrock'], url: 'https://www.asrock.com/support/' },
    { aliases: ['asus', 'asustek'], url: 'https://www.asus.com/support/' },
    { aliases: ['msi', 'microstar'], url: 'https://www.msi.com/support' },
    { aliases: ['gigabyte', 'aorus'], url: 'https://www.gigabyte.com/Support' },
    { aliases: ['biostar'], url: 'https://www.biostar.com.tw/app/en/support/download.php' },
    { aliases: ['nzxt'], url: 'https://support.nzxt.com/hc/en-us/sections/39003384521627-Motherboards' },
    { aliases: ['supermicro'], url: 'https://www.supermicro.com/en/support' },
    { aliases: ['dell'], url: 'https://www.dell.com/support/home/en-us' },
    { aliases: ['hewlettpackard', 'hpinc'], url: 'https://support.hp.com/us-en' },
    { aliases: ['lenovo'], url: 'https://support.lenovo.com/us/en' },
    { aliases: ['acer'], url: 'https://www.acer.com/us-en/support/' },
    { aliases: ['intel'], url: 'https://www.intel.com/content/www/us/en/support.html' },
  ]
  const match = supportPortals.find(({ aliases }) => aliases.some((alias) => vendor.includes(alias)))
  return match?.url ?? null
}

/**
 * Resolve exact normalized identities and explicitly curated aliases only.
 * Revision-scoped profiles stay hidden until the reported revision matches;
 * BIOS-version visibility remains unverified unless separately sourced.
 */
export function resolveBoardEvidence(audit: BiosAudit): BoardEvidenceResolution {
  const manufacturer = normalizeIdentity(audit.moboManufacturer)
  const product = normalizeIdentity(audit.moboProduct)
  const detectedCpuName = audit.cpuBrand?.trim() || null
  const candidates = BOARD_EVIDENCE_PROFILES.map((candidate) => {
    const manufacturerNames = [candidate.manufacturer, ...(candidate.manufacturerAliases ?? [])]
    const productNames = [candidate.product, ...(candidate.productAliases ?? [])]
    const manufacturerIndex = manufacturerNames.findIndex((name) => manufacturer === normalizeIdentity(name))
    const productIndex = productNames.findIndex((name) => product === normalizeIdentity(name))
    if (manufacturerIndex < 0 || productIndex < 0) return null
    return {
      profile: candidate,
      matchKind: manufacturerIndex === 0 && productIndex === 0 ? 'canonical' as const : 'alias' as const,
    }
  }).filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
  const detectedRevision = normalizeRevision(audit.moboRevision)
  const applicableCandidates = candidates.filter(({ profile: candidate }) =>
    !candidate.revisionScope?.length
      || Boolean(detectedRevision && candidate.revisionScope.some((revision) => normalizeRevision(revision) === detectedRevision)),
  )
  const selected = applicableCandidates.length === 1 ? applicableCandidates[0] : null
  const profile = selected?.profile ?? null
  const candidateProfile = candidates.length === 1 ? candidates[0].profile : null
  const reviewedRevisions = [...new Set(candidates.flatMap(({ profile: candidate }) => candidate.revisionScope ?? []))]
  const boardMatchStatus: BoardEvidenceResolution['boardMatchStatus'] = selected
    ? 'matched'
    : candidates.length > 0 && applicableCandidates.length > 1
      ? 'ambiguous'
      : candidates.length > 0 && !detectedRevision
        ? 'revision-unreported'
        : candidates.length > 0
          ? 'revision-mismatch'
          : !manufacturer || !product
            ? 'identity-incomplete'
            : 'not-found'
  const matchKind = selected?.matchKind ?? (candidates.length === 1 ? candidates[0].matchKind : 'none')

  let cpuSupport: CpuSupportResolution
  if (!detectedCpuName) {
    cpuSupport = { status: 'unknown', detectedCpuName: null, evidence: null }
  } else if (!profile) {
    cpuSupport = { status: 'board-unprofiled', detectedCpuName, evidence: null }
  } else if (detectCpuVendor(detectedCpuName) && detectCpuVendor(detectedCpuName) !== profile.cpuVendor) {
    cpuSupport = { status: 'platform-mismatch', detectedCpuName, evidence: null }
  } else {
    const evidence = profile.cpuSupportEvidence.find((entry) =>
      entry.aliases.some((alias) => matchesCpuAlias(detectedCpuName, alias)),
    ) ?? null
    cpuSupport = {
      status: evidence ? 'listed' : 'not-curated',
      detectedCpuName,
      evidence,
    }
  }

  return {
    boardMatchStatus,
    matchKind,
    profile,
    candidateProfile,
    reviewedRevisions,
    supportUrl: profile?.supportUrl ?? candidateProfile?.supportUrl ?? vendorSupportUrl(audit.moboManufacturer),
    cpuSupport,
  }
}
