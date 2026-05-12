/**
 * Route Memory - aprende e persiste mapeamentos destino -> URL que funcionaram.
 *
 * Persiste em: userData/pje-route-memory.json
 * Chave legado: "tribunal:destino_normalizado"
 * Chave contextual: "tribunal:contexto_normalizado:destino_normalizado"
 *
 * Prioridade de consulta em pje_navegar:
 *   1. Route Memory contextual (aprendido para aquele ambiente)
 *   2. Route Memory legado (compatibilidade)
 *   3. tribunal-urls.ts (estatico)
 *   4. Browser agent
 */

import path from 'path'
import fs from 'fs'
import { saveEncrypted, loadEncrypted } from '../privacy/encrypted-storage'
import { normalizeForKey, normalizeId } from '../text-normalize'
import { buildPjeEnvironmentLookupKey } from './environment-context'

interface RouteEntry {
  url: string
  lastUsed: number
  successCount: number
}

interface RouteStore {
  version: number
  routes: Record<string, RouteEntry>
}

interface RouteLookupOptions {
  environment?: unknown
}

let storePath: string | null = null
let store: RouteStore = { version: 1, routes: {} }
let dirty = false
let saveTimer: ReturnType<typeof setTimeout> | null = null

/** Recebe userDataDir do main.ts ou backend - sem dependencia do Electron */
export function initRouteMemory(userDataDir?: string): void {
  if (userDataDir) {
    storePath = path.join(userDataDir, 'pje-route-memory.json')
  }
  if (!storePath) throw new Error('[RouteMemory] Chame initRouteMemory(userDataDir) com o diretorio')
  const parsed = loadEncrypted<RouteStore>(storePath, { version: 1, routes: {} })
  if (parsed?.version === 1 && parsed.routes) {
    store = parsed
    const count = Object.keys(store.routes).length
    if (count > 0) console.log(`[RouteMemory] Carregado ${count} rotas (criptografado)`)
  }
}

function makeKey(tribunal: string, destino: string, opts: RouteLookupOptions = {}): string {
  const t = normalizeId(tribunal || 'default')
  const envKey = buildPjeEnvironmentLookupKey(opts.environment)
  const base = normalizeForKey(destino)
  return envKey ? `${t}:${envKey}:${base}` : `${t}:${base}`
}

/** Consulta URL aprendida para um destino. Retorna null se nao encontrado. */
export function lookupRoute(tribunal: string, destino: string, opts: RouteLookupOptions = {}): string | null {
  const key = makeKey(tribunal, destino, opts)
  const entry = store.routes[key]
  if (entry) {
    console.log(`[RouteMemory] Hit: "${key}" -> ${entry.url} (usado ${entry.successCount}x)`)
    return entry.url
  }

  const legacyKey = makeKey(tribunal, destino)
  if (legacyKey !== key) {
    const legacyEntry = store.routes[legacyKey]
    if (legacyEntry) {
      console.log(`[RouteMemory] Legacy hit: "${legacyKey}" para "${destino}"`)
      return legacyEntry.url
    }
  }

  // Busca parcial - se a chave contem o destino normalizado.
  const norm = normalizeForKey(destino)
  const t = normalizeId(tribunal || 'default')
  const prefix = `${t}:`
  for (const [k, v] of Object.entries(store.routes)) {
    if (k.startsWith(prefix) && (k.includes(norm) || norm.includes(k.replace(prefix, '')))) {
      console.log(`[RouteMemory] Partial hit: "${k}" para "${destino}"`)
      return v.url
    }
  }

  return null
}

/** Salva uma rota bem-sucedida. Chama apos navegacao confirmada. */
export function saveRoute(tribunal: string, destino: string, url: string, opts: RouteLookupOptions = {}): void {
  if (!url || url.includes('login') || url.includes('Login')) return

  const key = makeKey(tribunal, destino, opts)
  const existing = store.routes[key]
  store.routes[key] = {
    url,
    lastUsed: Date.now(),
    successCount: (existing?.successCount ?? 0) + 1
  }
  dirty = true
  scheduleSave()
  console.log(`[RouteMemory] Salvo: "${key}" -> ${url}`)
}

/** Persiste debounced (evita I/O excessivo) */
function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(flush, 2000)
}

export function flush(): void {
  if (!dirty) return
  try {
    if (!storePath) return
    saveEncrypted(storePath, store)
    dirty = false
  } catch (err) {
    console.error('[RouteMemory] Erro ao salvar:', err)
  }
}
