import { useEffect, useState } from 'react'
import { RamAdvisor } from '../components/RamAdvisor'
import { detectSpecs, type SpecProfile } from '../lib/tauri'

export function Profile() {
  const [spec, setSpec] = useState<SpecProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load(refresh = false) {
    setLoading(true)
    setError(null)
    try {
      const s = await detectSpecs(refresh)
      setSpec(s)
    } catch (e: unknown) {
      setError(typeof e === 'string' ? e : (e as Error)?.message ?? 'unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-text-subtle">your rig</p>
          <h1 className="text-2xl font-bold">Profile</h1>
          <p className="text-text-muted text-sm">
            Detected hardware. Drives which tweaks the catalog offers you.
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="btn-chrome px-4 py-1.5 rounded-md bg-bg-raised text-text text-sm disabled:opacity-50"
        >
          {loading ? 'Scanning…' : 'Re-scan'}
        </button>
      </header>

      {error && (() => {
        // @ts-expect-error Tauri injects this at runtime
        const inTauri = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__
        return (
          <div className="surface-card p-4 text-sm text-text">
            {inTauri ? (
              <>
                <p className="font-semibold text-accent mb-1">Spec detection failed</p>
                <pre className="text-text-muted whitespace-pre-wrap text-xs">{error}</pre>
                <p className="text-text-subtle text-xs mt-2">
                  WMI may be disabled or the user lacks read permission. Try Re-scan; if it persists,
                  check Event Viewer for WMI errors.
                </p>
              </>
            ) : (
              <p className="text-text-muted italic">
                Spec detection runs inside the optimizationmaxxing.exe shell. The browser preview
                doesn't include the Tauri runtime — install the .exe to see your real rig data.
              </p>
            )}
          </div>
        )
      })()}

      {!error && !spec && loading && (
        <div className="surface-card p-8 text-center text-text-muted">Scanning your rig…</div>
      )}

      {spec && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SpecCard title="CPU">
            <Row label="Model" value={spec.cpu.model} />
            <Row label="Vendor" value={spec.cpu.vendor} />
            <Row
              label="Cores / Threads"
              value={`${spec.cpu.cores} / ${spec.cpu.logicalCores}`}
            />
            <Row label="Family / Model ID" value={`${spec.cpu.family} / ${spec.cpu.modelId}`} />
            {spec.cpu.genOrZen !== null && (
              <Row
                label={spec.cpu.vendor === 'AMD' ? 'Zen Generation' : 'Generation'}
                value={
                  spec.cpu.vendor === 'AMD' ? `Zen ${spec.cpu.genOrZen}` : `${spec.cpu.genOrZen}th Gen`
                }
              />
            )}
          </SpecCard>

          <SpecCard title="GPU">
            <Row label="Model" value={spec.gpu.model} />
            <Row label="Vendor" value={spec.gpu.vendor} />
            {spec.gpu.arch && <Row label="Architecture" value={spec.gpu.arch} />}
            {spec.gpu.vramMb !== null && (
              <Row
                label="VRAM"
                value={`${(spec.gpu.vramMb / 1024).toFixed(1)} GB${
                  spec.gpu.vramMb >= 4090 ? ' (WMI caps at ~4 GB)' : ''
                }`}
              />
            )}
            {spec.gpu.driverVersion && <Row label="Driver" value={spec.gpu.driverVersion} />}
          </SpecCard>

          <SpecCard title="RAM">
            <Row label="Total" value={`${spec.ram.totalGb} GB`} />
            <Row label="Sticks" value={String(spec.ram.stickCount)} />
            {spec.ram.speedMts && <Row label="Speed (rated)" value={`${spec.ram.speedMts} MT/s`} />}
            {spec.ram.configuredSpeedMts && (
              <Row label="Speed (running)" value={`${spec.ram.configuredSpeedMts} MT/s`} />
            )}
            {spec.ram.manufacturer && <Row label="Manufacturer" value={spec.ram.manufacturer} />}
            {spec.ram.partNumber && <Row label="Part Number" value={spec.ram.partNumber} />}
          </SpecCard>

          <SpecCard title="Operating System">
            <Row label="Edition" value={spec.os.caption || `${spec.os.edition}`} />
            <Row label="Display Version" value={spec.os.displayVersion || '(unknown)'} />
            <Row
              label="Build"
              value={spec.os.ubr ? `${spec.os.build}.${spec.os.ubr}` : String(spec.os.build)}
            />
            <Row label="NT Version" value={`${spec.os.major}.${spec.os.minor}`} />
          </SpecCard>

          <SpecCard title="Motherboard / BIOS">
            {spec.mobo.manufacturer && (
              <Row label="Manufacturer" value={spec.mobo.manufacturer} />
            )}
            {spec.mobo.product && <Row label="Model" value={spec.mobo.product} />}
            {spec.mobo.serialNumber && (
              <Row label="Board Serial" value={spec.mobo.serialNumber} />
            )}
            {spec.mobo.biosVendor && <Row label="BIOS Vendor" value={spec.mobo.biosVendor} />}
            {spec.mobo.biosVersion && <Row label="BIOS Version" value={spec.mobo.biosVersion} />}
            {spec.mobo.biosReleaseDate && (
              <Row label="BIOS Date" value={spec.mobo.biosReleaseDate} />
            )}
            {spec.mobo.biosSerial && spec.mobo.biosSerial !== spec.mobo.serialNumber && (
              <Row label="BIOS Serial" value={spec.mobo.biosSerial} />
            )}
            {spec.mobo.uuid && <Row label="System UUID" value={spec.mobo.uuid} />}
            <Row label="Form Factor" value={spec.mobo.isLaptop ? 'Laptop' : 'Desktop'} />
          </SpecCard>

          {spec.storage.drives.length > 0 && (
            <SpecCard title={`Storage (${spec.storage.drives.length})`}>
              {spec.storage.drives.map((d, i) => (
                <div key={i} className="space-y-1 mb-3 last:mb-0">
                  <p className="text-sm text-text font-medium">
                    {d.model || '(unknown drive)'}
                  </p>
                  <p className="text-xs text-text-subtle">
                    {d.sizeGb} GB · {d.busKind}
                    {d.interfaceType ? ` (${d.interfaceType})` : ''}
                  </p>
                  {d.serial && (
                    <p className="text-xs text-text-muted font-mono break-all">
                      SN {d.serial}
                    </p>
                  )}
                </div>
              ))}
            </SpecCard>
          )}

          <SpecCard title="Snapshot">
            <Row label="Captured" value={new Date(spec.capturedAt).toLocaleString()} />
            <p className="text-xs text-text-subtle mt-2">
              Re-scan after BIOS / driver / RAM changes. Cached on disk by the engine in Phase 4.
            </p>
          </SpecCard>
        </div>
      )}

      {spec && (
        <div className="md:col-span-2">
          <RamAdvisor ram={spec.ram} />
        </div>
      )}
    </div>
  )
}

function SpecCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="surface-card p-5">
      <p className="text-xs uppercase tracking-widest text-text-subtle mb-3">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="text-text font-medium text-right">{value}</span>
    </div>
  )
}
