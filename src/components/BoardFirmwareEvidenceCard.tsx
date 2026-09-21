import type { BiosAudit } from '../lib/tauri'
import { resolveBoardEvidence } from '../lib/biosEvidenceCatalog'

function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-accent underline underline-offset-2 hover:text-text"
    >
      {children}
    </a>
  )
}

export function BoardFirmwareEvidenceCard({ audit }: { audit: BiosAudit }) {
  const { boardMatchStatus, matchKind, profile, candidateProfile, reviewedRevisions, supportUrl, cpuSupport } = resolveBoardEvidence(audit)
  const displayProfile = profile ?? candidateProfile
  const identity = [audit.moboManufacturer, audit.moboProduct].filter(Boolean).join(' · ')
  const profileBadge = boardMatchStatus === 'matched'
    ? `${matchKind === 'alias' ? 'Known identity alias' : 'Exact model'} · BIOS visibility unverified`
    : boardMatchStatus === 'revision-unreported'
      ? 'Board revision required'
      : boardMatchStatus === 'revision-mismatch'
        ? 'Profile revision mismatch'
        : boardMatchStatus === 'ambiguous'
          ? 'Multiple model records'
          : 'No reviewed exact-model profile'

  return (
    <section className="rounded-md border border-border bg-bg-raised/30 p-3 space-y-3" aria-label="Board-specific BIOS evidence">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-accent">Board-specific BIOS evidence</p>
          <h4 className="text-sm font-semibold text-text">
            {displayProfile ? `${displayProfile.manufacturer} ${displayProfile.product}` : identity || 'Board identity not reported'}
          </h4>
        </div>
        <span className={`text-[10px] uppercase tracking-widest ${boardMatchStatus === 'matched' ? 'text-amber-200' : 'text-text-subtle'}`}>
          {profileBadge}
        </span>
      </div>

      {boardMatchStatus === 'revision-unreported' && (
        <p className="text-[11px] text-amber-100 leading-snug">
          A reviewed entry exists for this board name, but Windows did not report its revision.
          {reviewedRevisions.length > 0 ? ` Cataloged revision(s): ${reviewedRevisions.join(', ')}.` : ''}
          {' '}Revision-specific settings and CPU matches are withheld rather than assumed.
        </p>
      )}
      {boardMatchStatus === 'revision-mismatch' && candidateProfile && (
        <p className="text-[11px] text-amber-100 leading-snug">
          The local entry covers revision(s) {reviewedRevisions.join(', ')}; Windows reports {audit.moboRevision || 'an unrecognized revision'}. No settings or CPU-support result from that revision-specific record are applied.
        </p>
      )}
      {boardMatchStatus === 'ambiguous' && (
        <p className="text-[11px] text-amber-100 leading-snug">
          More than one local record matches this reported identity. A reported board revision may disambiguate it.
          {reviewedRevisions.length > 0 ? ` Cataloged revision(s): ${reviewedRevisions.join(', ')}.` : ''}
        </p>
      )}

      <div className="rounded border border-border bg-bg-raised/30 p-2.5 space-y-1">
        <p className="text-[10px] uppercase tracking-widest text-accent">CPU / board support match</p>
        <p className="text-[11px] text-text-muted leading-snug">
          Detected CPU name: <span className="font-mono text-text">{cpuSupport.detectedCpuName ?? 'not reported'}</span>
        </p>
        {cpuSupport.status === 'listed' && cpuSupport.evidence && (
          <>
            <p className="text-[11px] text-text-muted leading-snug">
              OEM CPU support list: <strong className="text-emerald-200">{cpuSupport.evidence.model} is listed</strong>
              {' '}({cpuSupport.evidence.family}).{' '}
              {cpuSupport.evidence.biosRequirement.kind === 'all'
                ? 'The OEM lists support for all BIOS versions.'
                : `The OEM lists BIOS ${cpuSupport.evidence.biosRequirement.version} as the minimum; this app does not yet compare vendor-specific BIOS version strings.`}
            </p>
            <p className="text-[10px] text-text-subtle leading-snug">
              This is CPU compatibility evidence only; it does not prove a menu is visible, reveal current BIOS values, or predict game performance.
              {' '}Checked {cpuSupport.evidence.checkedOn}.
            </p>
            <ExternalLink href={cpuSupport.evidence.sourceUrl}>Exact OEM CPU-support evidence</ExternalLink>
          </>
        )}
        {cpuSupport.status === 'not-curated' && (
          <p className="text-[11px] text-text-subtle leading-snug">
            This exact CPU is not in our locally curated records. That means <strong className="text-text">unknown, not unsupported</strong>—check the OEM's full CPU list before drawing a compatibility conclusion.
          </p>
        )}
        {cpuSupport.status === 'board-unprofiled' && (
          <p className="text-[11px] text-text-subtle leading-snug">
            CPU name was detected, but this exact board/revision does not have an applicable local record. The board/CPU pair remains unknown here, not unsupported.
          </p>
        )}
        {cpuSupport.status === 'platform-mismatch' && (
          <p className="text-[11px] text-amber-200 leading-snug">
            The detected CPU vendor does not match this board profile's platform. Verify the SMBIOS identities; no CPU-specific conclusion is being inferred.
          </p>
        )}
        {cpuSupport.status === 'unknown' && (
          <p className="text-[11px] text-text-subtle leading-snug">Windows did not report an exact CPU model, so CPU-specific compatibility remains unknown.</p>
        )}
        {profile?.cpuSupportUrl && (
          <ExternalLink href={profile.cpuSupportUrl}>Full official CPU-support list</ExternalLink>
        )}
      </div>

      {profile ? (
        <>
          <p className="text-[11px] text-text-muted leading-snug">
            This exact-model record links only to OEM documentation and CPU-support data reviewed for this board. A manual entry does not prove that your installed BIOS exposes the option or reveal its current value.
            {` Reviewed ${profile.checkedOn}.`}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            <ExternalLink href={profile.manualUrl}>Official board manual</ExternalLink>
            <ExternalLink href={profile.supportUrl}>Board support</ExternalLink>
            <ExternalLink href={profile.biosUrl}>BIOS releases and notes</ExternalLink>
          </div>
          {profile.settings.length > 0 ? (
            <ul className="grid grid-cols-1 xl:grid-cols-2 gap-2">
              {profile.settings.map((setting) => (
                <li key={setting.id} className="rounded border border-border p-2.5 space-y-1">
                  <h5 className="text-xs font-semibold text-text">{setting.name}</h5>
                  <p className="text-[11px] text-text-muted leading-snug">{setting.evidence}</p>
                  <p className="text-[11px] text-text-subtle leading-snug">
                    <span className="text-text-muted">Manual path:</span> {setting.menuPath}
                  </p>
                  {setting.cpuVendorScope && (
                    <p className="text-[11px] text-text-subtle leading-snug">
                      <span className="text-text-muted">CPU scope:</span> {setting.cpuVendorScope}-specific documented option
                    </p>
                  )}
                  <p className="text-[11px] text-text-subtle leading-snug">
                    <span className="text-text-muted">Windows signal:</span> {setting.liveState(audit)}
                  </p>
                  <p className="text-[11px] text-amber-100/90 leading-snug">{setting.guidance}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-text-subtle leading-snug">
              No individual BIOS menu paths are curated for this board yet. The app still uses this model's OEM links and any exact CPU-support rows available; it will not borrow another board's menu recipe.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-[11px] text-text-muted leading-snug">
            {boardMatchStatus === 'identity-incomplete'
              ? 'Windows did not provide both a board manufacturer and full product name, so an exact profile cannot be selected.'
              : boardMatchStatus === 'not-found'
                ? supportUrl
                  ? 'This exact model is not in the reviewed local catalog yet. The app still detects the reported hardware and offers an OEM support link; missing coverage means unknown, not unsupported.'
                  : 'This exact model is not in the reviewed local catalog yet. The app still reports the hardware identity; use that exact model and revision on the maker’s official support site. Missing coverage means unknown, not unsupported.'
                : 'No safe profile could be selected for this identity. We will not infer menu paths or availability from a vendor name, incomplete export, or another board revision.'}
          </p>
          {supportUrl && <ExternalLink href={supportUrl}>Open official manufacturer support</ExternalLink>}
        </>
      )}

      <p className="border-t border-border pt-2 text-[10px] text-text-subtle leading-snug">
        Detected identity: {identity || 'unknown'}
        {audit.moboRevision ? ` · revision ${audit.moboRevision}` : ' · revision not reported'}
        {audit.biosVersion ? ` · BIOS ${audit.biosVersion}` : ' · BIOS version not reported'}
        {' '}A missing manual/export entry means unknown, not unavailable. This evidence card is read-only and does not change firmware.
      </p>
    </section>
  )
}
