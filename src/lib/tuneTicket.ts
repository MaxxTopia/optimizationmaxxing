import { inTauri, kvGet, kvSet } from './tauri'

const STORAGE_KEY = 'optmaxxing-first-tune-ticket-v2'
const LEGACY_STORAGE_KEY = 'optmaxxing-first-tune-ticket-v1'
const ENGINE_STORAGE_KEY = 'first_tune_ticket_v2'
const LEGACY_ENGINE_STORAGE_KEY = 'first_tune_ticket_v1'
const OFFER_WORKER_BASE = 'https://optmaxxing-vip.maxxtopia.workers.dev'
const OFFER_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

export type TuneTicketRarity = 'gold' | 'emerald' | 'diamond'
export type TuneTicketStatus = 'pending' | 'offered' | 'expired' | 'redeemed' | 'revoked' | 'local'

export interface TuneTicket {
  id: string
  rarity: TuneTicketRarity
  chanceLabel: string
  price: 99 | 77 | 69
  issuedAt: string
  expiresAt: string
  status: TuneTicketStatus
  serverBacked: boolean
  serverSession: string | null
  connectUrl: string | null
  discordLinked: boolean
  dmSent: boolean
  /** Retained only for older locally-issued tickets. It is not redemption proof. */
  rigProof: string | null
}

const TIERS: Array<{
  rarity: TuneTicketRarity
  chance: number
  price: TuneTicket['price']
  color: string
}> = [
  { rarity: 'gold', chance: 70, price: 99, color: 'gold' },
  { rarity: 'emerald', chance: 24, price: 77, color: 'emerald' },
  { rarity: 'diamond', chance: 6, price: 69, color: 'diamond' },
]

interface OfferPayload {
  ok: boolean
  status: TuneTicketStatus
  ticketId: string
  rarity: TuneTicketRarity
  chanceLabel: string
  price: TuneTicket['price']
  issuedAt: string
  expiresAt: string
  discordLinked: boolean
  dmSent: boolean
  connectUrl: string | null
  error?: string
}

export function readTuneTicket(): TuneTicket | null {
  try {
    const current = parseTicket(localStorage.getItem(STORAGE_KEY))
    if (current) return current
    return parseTicket(localStorage.getItem(LEGACY_STORAGE_KEY))
  } catch {
    return null
  }
}

/**
 * Create one first-time offer session. The server chooses the tier and keeps
 * the account claim authoritative; the local record only remembers the UI.
 */
export async function issueTuneTicket(): Promise<TuneTicket> {
  let existing = readTuneTicket()
  if (!existing && inTauri()) {
    try {
      const persisted = parseTicket(await kvGet(ENGINE_STORAGE_KEY)) || parseTicket(await kvGet(LEGACY_ENGINE_STORAGE_KEY))
      if (persisted) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))
        existing = persisted
      }
    } catch {
      // Continue with a new server offer if the local engine database is unavailable.
    }
  }
  if (existing && (existing.serverBacked || existing.serverSession == null)) return existing

  const session = existing?.serverSession || randomToken(32)
  try {
    const payload = existing
      ? await requestOfferStatus(session)
      : await prepareOffer(session)
    const ticket = ticketFromPayload(payload, session, existing?.rigProof ?? null)
    persistTicket(ticket)
    return ticket
  } catch {
    const fallback = existing ?? localFallback(session)
    persistTicket(fallback)
    return fallback
  }
}

/** Refresh the server-backed status after the user returns from Discord. */
export async function refreshTuneTicket(ticket: TuneTicket): Promise<TuneTicket> {
  if (!ticket.serverSession) return ticket
  try {
    const payload = await requestOfferStatus(ticket.serverSession)
    const next = ticketFromPayload(payload, ticket.serverSession, ticket.rigProof)
    persistTicket(next)
    return next
  } catch {
    return ticket
  }
}

export function tuneTicketMeta(rarity: TuneTicketRarity) {
  return TIERS.find((tier) => tier.rarity === rarity) ?? TIERS[0]
}

async function prepareOffer(session: string): Promise<OfferPayload> {
  return requestOffer('/offer/prepare', {
    method: 'POST',
    body: JSON.stringify({ session }),
  })
}

async function requestOfferStatus(session: string): Promise<OfferPayload> {
  return requestOffer(`/offer/status?session=${encodeURIComponent(session)}`)
}

async function requestOffer(path: string, init: RequestInit = {}): Promise<OfferPayload> {
  const response = await fetch(`${OFFER_WORKER_BASE}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const payload = (await response.json().catch(() => ({}))) as Partial<OfferPayload>
  if (!response.ok || payload.ok !== true || !payload.ticketId) {
    throw new Error(payload.error || `offer worker returned ${response.status}`)
  }
  return payload as OfferPayload
}

function ticketFromPayload(payload: OfferPayload, session: string, rigProof: string | null): TuneTicket {
  return {
    id: payload.ticketId,
    rarity: payload.rarity,
    chanceLabel: payload.chanceLabel,
    price: payload.price,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    status: payload.status,
    serverBacked: true,
    serverSession: session,
    connectUrl: payload.connectUrl,
    discordLinked: payload.discordLinked,
    dmSent: payload.dmSent,
    rigProof,
  }
}

function localFallback(session: string): TuneTicket {
  const roll = randomInt(100)
  const tier = roll < 70 ? TIERS[0] : roll < 94 ? TIERS[1] : TIERS[2]
  const issuedAt = new Date().toISOString()
  return {
    id: `LOCAL-${issuedAt.slice(0, 10).replaceAll('-', '')}-${randomToken(6)}`,
    rarity: tier.rarity,
    chanceLabel: `${tier.chance}% pull`,
    price: tier.price,
    issuedAt,
    expiresAt: new Date(Date.parse(issuedAt) + OFFER_WINDOW_MS).toISOString(),
    status: 'local',
    serverBacked: false,
    serverSession: session,
    connectUrl: null,
    discordLinked: false,
    dmSent: false,
    rigProof: null,
  }
}

function persistTicket(ticket: TuneTicket) {
  try {
    const serialized = JSON.stringify(ticket)
    localStorage.setItem(STORAGE_KEY, serialized)
    if (inTauri()) void kvSet(ENGINE_STORAGE_KEY, serialized)
  } catch {
    // The modal can still show the offer for this session. No permanent
    // storage guarantee is claimed when the shell database is unavailable.
  }
}

function parseTicket(raw: string | null): TuneTicket | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<TuneTicket>
    if (
      !parsed.id ||
      (parsed.rarity !== 'gold' && parsed.rarity !== 'emerald' && parsed.rarity !== 'diamond') ||
      (parsed.price !== 99 && parsed.price !== 77 && parsed.price !== 69) ||
      !parsed.chanceLabel ||
      !parsed.issuedAt
    ) return null
    const issuedMs = Date.parse(parsed.issuedAt)
    const legacy = !parsed.status || !parsed.expiresAt
    return {
      id: parsed.id,
      rarity: parsed.rarity,
      chanceLabel: parsed.chanceLabel,
      price: parsed.price,
      issuedAt: parsed.issuedAt,
      expiresAt: parsed.expiresAt || new Date(issuedMs + OFFER_WINDOW_MS).toISOString(),
      status: parsed.status || 'local',
      serverBacked: parsed.serverBacked === true && !legacy,
      serverSession: typeof parsed.serverSession === 'string' ? parsed.serverSession : null,
      connectUrl: typeof parsed.connectUrl === 'string' ? parsed.connectUrl : null,
      discordLinked: parsed.discordLinked === true,
      dmSent: parsed.dmSent === true,
      rigProof: typeof parsed.rigProof === 'string' ? parsed.rigProof : null,
    }
  } catch {
    return null
  }
}

function randomInt(max: number): number {
  try {
    const bytes = new Uint32Array(1)
    crypto.getRandomValues(bytes)
    return bytes[0] % max
  } catch {
    return Math.floor(Math.random() * max)
  }
}

function randomToken(length: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789_-'
  let out = ''
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)]
  return out
}
