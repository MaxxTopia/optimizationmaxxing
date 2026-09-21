export type LocalFeatureName = 'transactional-apply' | 'closed-loop-evidence' | 'profile-artifacts'

interface LocalFeaturePolicy {
  schemaVersion: 1
  revision: number
  disabled: Partial<Record<LocalFeatureName, boolean>>
}

const STORAGE_KEY = 'optmaxxing-local-feature-policy-v1'

const DEFAULT_POLICY: LocalFeaturePolicy = {
  schemaVersion: 1,
  revision: 1,
  disabled: {},
}

function readPolicy(): LocalFeaturePolicy {
  if (typeof localStorage === 'undefined') return DEFAULT_POLICY
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '') as Partial<LocalFeaturePolicy>
    if (parsed.schemaVersion !== 1 || typeof parsed.disabled !== 'object' || parsed.disabled == null) {
      return DEFAULT_POLICY
    }
    return {
      schemaVersion: 1,
      revision: typeof parsed.revision === 'number' ? parsed.revision : 1,
      disabled: parsed.disabled,
    }
  } catch {
    return DEFAULT_POLICY
  }
}

/**
 * Local fail-closed gate for new automation. A future signed remote manifest
 * can replace this policy, but the app never treats a missing feed as an
 * instruction to apply more tweaks. Users can still disable a feature locally
 * while diagnosing a regression.
 */
export function isFeatureEnabled(name: LocalFeatureName): boolean {
  return readPolicy().disabled[name] !== true
}

export function setLocalFeatureEnabled(name: LocalFeatureName, enabled: boolean): void {
  if (typeof localStorage === 'undefined') return
  const policy = readPolicy()
  policy.disabled[name] = !enabled
  localStorage.setItem(STORAGE_KEY, JSON.stringify(policy))
}
