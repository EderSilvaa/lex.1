/**
 * OAuth 2.0 Flow for Electron (Phase 3 AIOS — Plugins)
 *
 * Loopback redirect: abre BrowserWindow para auth, captura code via HTTP server local.
 * Suporta PKCE (recomendado para desktop apps).
 */

import { BrowserWindow } from 'electron';
import * as http from 'http';
import * as crypto from 'crypto';
import type { PluginTokens } from './types';

export interface OAuthFlowOptions {
    authorizationUrl: string;
    tokenUrl: string;
    clientId: string;
    clientSecret?: string;
    scopes: string[];
    pkce?: boolean;
    additionalParams?: Record<string, string>;
}

export interface OAuthResult {
    success: boolean;
    tokens?: PluginTokens;
    error?: string;
}

/**
 * Executa o fluxo OAuth 2.0 completo.
 * 1. Abre HTTP server local para capturar redirect
 * 2. Abre BrowserWindow com URL de autorização
 * 3. Captura code do redirect
 * 4. Troca code por tokens
 */
export async function runOAuthFlow(options: OAuthFlowOptions): Promise<OAuthResult> {
    // PKCE
    let codeVerifier: string | undefined;
    let codeChallenge: string | undefined;

    if (options.pkce) {
        codeVerifier = generateCodeVerifier();
        codeChallenge = generateCodeChallenge(codeVerifier);
    }

    // Abre server local em porta aleatória
    const { port, codePromise, server } = await startLoopbackServer();
    const redirectUri = `http://localhost:${port}/callback`;

    try {
        // Monta URL de autorização
        const params = new URLSearchParams({
            client_id: options.clientId,
            redirect_uri: redirectUri,
            response_type: 'code',
            scope: options.scopes.join(' '),
            access_type: 'offline',
            prompt: 'consent',
            ...(codeChallenge ? { code_challenge: codeChallenge, code_challenge_method: 'S256' } : {}),
            ...(options.additionalParams || {}),
        });

        const authUrl = `${options.authorizationUrl}?${params.toString()}`;

        // Abre BrowserWindow
        const authWindow = new BrowserWindow({
            width: 600,
            height: 800,
            show: true,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
            },
        });

        authWindow.loadURL(authUrl);

        // Timeout de 5 minutos
        const timeout = setTimeout(() => {
            authWindow.close();
            server.close();
        }, 5 * 60 * 1000);

        // Fecha window quando code capturado ou usuário fecha
        authWindow.on('closed', () => {
            clearTimeout(timeout);
        });

        // Espera o code
        const code = await codePromise;
        authWindow.close();
        clearTimeout(timeout);

        if (!code) {
            return { success: false, error: 'Autorização cancelada pelo usuário' };
        }

        // Troca code por tokens
        const tokens = await exchangeCodeForTokens(
            options.tokenUrl,
            code,
            options.clientId,
            options.clientSecret,
            redirectUri,
            codeVerifier
        );

        return { success: true, tokens };

    } catch (err: any) {
        return { success: false, error: err.message };
    } finally {
        server.close();
    }
}

/**
 * Refresh de token OAuth 2.0
 */
export async function refreshOAuthToken(
    tokenUrl: string,
    refreshToken: string,
    clientId: string,
    clientSecret?: string
): Promise<PluginTokens> {
    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        ...(clientSecret ? { client_secret: clientSecret } : {}),
    });

    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Token refresh falhou (${response.status}): ${text}`);
    }

    const data = await response.json() as any;
    return parseTokenResponse(data);
}

// ============================================================================
// INTERNALS
// ============================================================================

function startLoopbackServer(): Promise<{ port: number; codePromise: Promise<string | null>; server: http.Server }> {
    return new Promise((resolve, reject) => {
        let resolveCode: (code: string | null) => void;
        const codePromise = new Promise<string | null>(r => { resolveCode = r; });

        const server = http.createServer((req, res) => {
            const url = new URL(req.url || '/', `http://localhost`);

            if (url.pathname === '/callback') {
                const code = url.searchParams.get('code');
                const error = url.searchParams.get('error');

                if (error) {
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end('<html><body><h2>Erro na autorização</h2><p>Você pode fechar esta janela.</p></body></html>');
                    resolveCode(null);
                } else if (code) {
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end('<html><body><h2>Autorizado!</h2><p>Você pode fechar esta janela e voltar ao LEX.</p></body></html>');
                    resolveCode(code);
                } else {
                    res.writeHead(400);
                    res.end('Bad request');
                    resolveCode(null);
                }
            } else {
                res.writeHead(404);
                res.end('Not found');
            }
        });

        server.listen(0, '127.0.0.1', () => {
            const addr = server.address();
            const port = typeof addr === 'object' && addr ? addr.port : 0;
            resolve({ port, codePromise, server });
        });

        server.on('error', reject);
    });
}

async function exchangeCodeForTokens(
    tokenUrl: string,
    code: string,
    clientId: string,
    clientSecret: string | undefined,
    redirectUri: string,
    codeVerifier?: string
): Promise<PluginTokens> {
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        ...(clientSecret ? { client_secret: clientSecret } : {}),
        ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    });

    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Token exchange falhou (${response.status}): ${text}`);
    }

    const data = await response.json() as any;
    return parseTokenResponse(data);
}

function parseTokenResponse(data: any): PluginTokens {
    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
        tokenType: data.token_type || 'Bearer',
        scope: data.scope,
    };
}

// ============================================================================
// PKCE
// ============================================================================

function generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
}
