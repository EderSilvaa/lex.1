/**
 * Route Memory — aprende e persiste mapeamentos destino → URL que funcionaram.
 *
 * Persiste em: userData/pje-route-memory.json
 * Chave: "tribunal:destino_normalizado"  ex: "trt8:peticionamento"
 *
 * Prioridade de consulta em pje_navegar:
 *   1. Route Memory (aprendido, confirmado pelo uso)
 *   2. tribunal-urls.ts (estático)
 *   3. Browser agent (visual, Playwright CDP)
 */

import path from 'path'
import fs from 'fs'
import { saveEncrypted, loadEncrypted } from '../privacy/encrypted-storage'
import { normalizeForKey, normalizeId } from '../text-normalize'

interface RouteEntry {
  url: string
  lastUsed: number
  successCount: number
}

interface RouteStore {
  version: number
  routes: Record<string, RouteEntry>
}

let storePath: string | null = null
let store: RouteStore = { version: 1, routes: {} }
let dirty = false
let saveTimer: ReturnType<typeof setTimeout> | null = null

/** Recebe userDataDir do main.ts ou backend — sem dependência do Electron */
export function initRouteMemory(userDataDir?: string): void {
  if (userDataDir) {
    storePath = path.join(userDataDir, 'pje-route-memory.json')
  }
  if (!storePath) throw new Error('[RouteMemory] Chame initRouteMemory(userDataDir) com o diretório')
  const parsed = loadEncrypted<RouteStore>(storePath, { version: 1, routes: {} })
  if (parsed?.version === 1 && parsed.routes) {
    store = parsed
    const count = Object.keys(store.routes).length
    if (count > 0) console.log(`[RouteMemory] Carregado ${count} rotas (criptografado)`)
  }
}

function makeKey(tribunal: string, destino: string): string {
  const t = normalizeId(tribunal || 'default')
  return `${t}:${normalizeForKey(destino)}`
}

/** Consulta URL aprendida para um destino. Retorna null se não encontrado. */
export function lookupRoute(tribunal: string, destino: string): string | null {
  const key = makeKey(tribunal, destino)
  const entry = store.routes[key]
  if (entry) {
    console.log(`[RouteMemory] Hit: "${key}" → ${entry.url} (usado ${entry.successCount}x)`)
    return entry.url
  }

  // Busca parcial — se a chave contém o destino normalizado
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

/** Salva uma rota bem-sucedida. Chama após navegação confirmada. */
export function saveRoute(tribunal: string, destino: string, url: string): void {
  if (!url || url.includes('login') || url.includes('Login')) return  // não salva redirecionamentos de login

  const key = makeKey(tribunal, destino)
  const existing = store.routes[key]
  store.routes[key] = {
    url,
    lastUsed: Date.now(),
    successCount: (existing?.successCount ?? 0) + 1
  }
  dirty = true
  scheduleSave()
  console.log(`[RouteMemory] Salvo: "${key}" → ${url}`)
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
