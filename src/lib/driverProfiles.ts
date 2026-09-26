export type DriverProfileKind = 'nvidia-nip' | 'nic-advisory'

export interface DriverProfileRecord {
  id: string
  kind: DriverProfileKind
  filename: string
  label: string
  revision: number
  reviewedOn: string
  settingsCount: number
  sha256: string
  objective: string
  rollback: string[]
  warnings: string[]
}

/** Versioned artifact metadata for the files shipped by the NVPI panel. The
 * hash is for the public artifact, not a claim that every driver honors every
 * setting. Users are told to export their current profile before importing. */
export const DRIVER_PROFILE_CATALOG: DriverProfileRecord[] = [
  {
    id: 'fortnite-pinnacle',
    kind: 'nvidia-nip',
    filename: 'fortnite-pinnacle.nip',
    label: 'Fortnite latency baseline',
    revision: 1,
    reviewedOn: '2026-09-21',
    settingsCount: 4,
    sha256: '554f6eed2400e7e32c0179f9d0b46c2ab3f8bbd5621fabd6783250a2b82ee80b',
    objective: 'A small, reviewable driver-profile baseline for controlled A/B tests.',
    rollback: ['Export the existing Fortnite profile in NVPI before import.', 'Re-import the export, click Apply changes, then reopen NVPI.', 'Re-test after every NVIDIA driver update.'],
    warnings: ['No guaranteed input-delay gain.', 'Do not use profile files to remove visibility elements or bypass anti-cheat.'],
  },
  {
    id: 'fortnite-clean-render',
    kind: 'nvidia-nip',
    filename: 'fortnite-clean-render.nip',
    label: 'Fortnite performance render lab',
    revision: 3,
    reviewedOn: '2026-09-25',
    settingsCount: 9,
    sha256: '47a6bf52fd2ae8f59065c11b6c538256080a4e826e2b073e89113c64728adc92',
    objective: 'An aggressive image/latency A/B profile using normal driver controls and explicit rollback.',
    rollback: ['Export the current game profile first.', 'Re-import the saved export and Apply changes.', 'Compare the same scene before keeping it.'],
    warnings: ['Experimental and visual-quality dependent; texture shimmer is possible.', 'It does not remove foliage, clouds, terrain, or alter visibility.'],
  },
  {
    id: 'valorant',
    kind: 'nvidia-nip',
    filename: 'valorant.nip',
    label: 'Valorant controlled test',
    revision: 2,
    reviewedOn: '2026-09-25',
    settingsCount: 6,
    sha256: 'e4c5ae1af4937436153041947cf3386562c6abe3d565d0a0c8f1a93cc4468d5b',
    objective: 'A versioned driver-profile candidate for controlled testing.',
    rollback: ['Export the existing profile before import.', 'Restore the export and Apply changes if the capture regresses.', 'Reopen NVPI to confirm the restored values.'],
    warnings: ['This is not anti-cheat approval or a latency guarantee.'],
  },
  {
    id: 'cs2',
    kind: 'nvidia-nip',
    filename: 'cs2.nip',
    label: 'Counter-Strike 2 controlled test',
    revision: 1,
    reviewedOn: '2026-09-21',
    settingsCount: 6,
    sha256: '494a3178adeb4e8a31061e701d6cb633e9e1595d42f7f8111bb9946171b42561',
    objective: 'A versioned driver-profile candidate for controlled testing.',
    rollback: ['Export the existing profile before import.', 'Restore the export and Apply changes if the capture regresses.', 'Reopen NVPI to confirm the restored values.'],
    warnings: ['Use the game and driver defaults as the control group.'],
  },
  {
    id: 'apex-legends',
    kind: 'nvidia-nip',
    filename: 'apex-legends.nip',
    label: 'Apex Legends controlled test',
    revision: 1,
    reviewedOn: '2026-09-21',
    settingsCount: 6,
    sha256: '0f976d5f2bd25c0054fe4d0f4dd6670c0cbf988aab166dbdcd4b05e7fd3d1cdc',
    objective: 'A versioned driver-profile candidate for controlled testing.',
    rollback: ['Export the existing profile before import.', 'Restore the export and Apply changes if the capture regresses.', 'Reopen NVPI to confirm the restored values.'],
    warnings: ['Verify the executable association after import.'],
  },
  {
    id: 'marvel-rivals',
    kind: 'nvidia-nip',
    filename: 'marvel-rivals.nip',
    label: 'Marvel Rivals controlled test',
    revision: 1,
    reviewedOn: '2026-09-21',
    settingsCount: 12,
    sha256: '06b5e61bcca8aa99009cfe898538b0ced4b6168a2f8d7bff1e6d14d34d3856a6',
    objective: 'A versioned driver-profile candidate for controlled testing.',
    rollback: ['Export the existing profile before import.', 'Restore the export and Apply changes if the capture regresses.', 'Reopen NVPI to confirm the restored values.'],
    warnings: ['Engine-family similarity does not predict a Fortnite result.'],
  },
  {
    id: 'nic-latency-advisory',
    kind: 'nic-advisory',
    filename: 'nic-latency-advisory.json',
    label: 'NIC latency baseline (advisory)',
    revision: 1,
    reviewedOn: '2026-09-21',
    settingsCount: 4,
    sha256: 'not-applicable',
    objective: 'A reversible adapter-by-adapter review checklist for interrupt moderation, RSS, power saving, and link negotiation.',
    rollback: ['Export or record the adapter defaults before changing anything.', 'Restore the adapter property values and power-management checkboxes.', 'Re-run the DPC and packet-jitter capture; keep the default if the result is not repeatable.'],
    warnings: ['This is intentionally not a blind registry or netsh import.', 'Different NIC drivers expose different properties; unsupported settings must stay untouched.'],
  },
]

export function profileForFilename(filename: string): DriverProfileRecord | null {
  return DRIVER_PROFILE_CATALOG.find((profile) => profile.filename === filename) ?? null
}

export interface ProfileTextDiff {
  added: string[]
  removed: string[]
}

/** Small deterministic diff used by the read-only import/backup UI and tests. */
export function diffProfileText(before: string, after: string): ProfileTextDiff {
  const left = new Set(before.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))
  const right = new Set(after.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))
  return {
    added: [...right].filter((line) => !left.has(line)),
    removed: [...left].filter((line) => !right.has(line)),
  }
}
