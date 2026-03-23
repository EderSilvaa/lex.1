/**
 * DocuSign Client (Phase 3 AIOS — Plugins)
 *
 * REST wrapper for DocuSign eSignature API.
 * Tokens obtidos via PluginManager.getValidToken('docusign').
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getPluginManager } from '../../plugin-manager';

async function getToken(): Promise<string> {
    const tokens = await getPluginManager().getValidToken('docusign');
    return tokens.accessToken;
}

function authHeaders(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

let cachedAccount: { accountId: string; baseUri: string } | null = null;

export async function getAccountInfo(): Promise<{ accountId: string; baseUri: string }> {
    if (cachedAccount) return cachedAccount;
    const token = await getToken();
    const res = await fetch('https://account-d.docusign.com/oauth/userinfo', { headers: authHeaders(token) });
    if (!res.ok) throw new Error(`DocuSign userinfo ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const account = data['accounts']?.[0];
    if (!account) throw new Error('Nenhuma conta DocuSign encontrada.');
    cachedAccount = { accountId: account['account_id'], baseUri: account['base_uri'] + '/restapi/v2.1' };
    return cachedAccount;
}

export async function sendEnvelope(opts: {
    arquivo: string; signatarios: Array<{ nome: string; email: string }>; assunto?: string; mensagem?: string;
}) {
    const token = await getToken();
    const { baseUri, accountId } = await getAccountInfo();
    const fileBytes = await fs.readFile(opts.arquivo);
    const base64 = fileBytes.toString('base64');
    const fileName = path.basename(opts.arquivo);
    const ext = path.extname(opts.arquivo).toLowerCase().replace('.', '');

    const signers = opts.signatarios.map((s, i) => ({
        email: s.email, name: s.nome, recipientId: String(i + 1), routingOrder: String(i + 1),
        tabs: { signHereTabs: [{ documentId: '1', pageNumber: '1', xPosition: '100', yPosition: '700' }] },
    }));

    const body = {
        emailSubject: opts.assunto || `Assinatura: ${fileName}`,
        emailBlurb: opts.mensagem || 'Por favor, assine o documento anexo.',
        documents: [{ documentBase64: base64, name: fileName, fileExtension: ext, documentId: '1' }],
        recipients: { signers },
        status: 'sent',
    };

    const res = await fetch(`${baseUri}/accounts/${accountId}/envelopes`, {
        method: 'POST', headers: authHeaders(token), body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`DocuSign sendEnvelope ${res.status}: ${await res.text()}`);
    return res.json();
}

export async function listEnvelopes(fromDate?: string, status?: string) {
    const token = await getToken();
    const { baseUri, accountId } = await getAccountInfo();
    const params = new URLSearchParams();
    if (fromDate) params.set('from_date', fromDate);
    if (status) params.set('status', status);
    const res = await fetch(`${baseUri}/accounts/${accountId}/envelopes?${params}`, { headers: authHeaders(token) });
    if (!res.ok) throw new Error(`DocuSign listEnvelopes ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data['envelopes'] || [];
}

export async function getEnvelopeStatus(envelopeId: string) {
    const token = await getToken();
    const { baseUri, accountId } = await getAccountInfo();
    const res = await fetch(`${baseUri}/accounts/${accountId}/envelopes/${envelopeId}`, { headers: authHeaders(token) });
    if (!res.ok) throw new Error(`DocuSign getStatus ${res.status}: ${await res.text()}`);
    return res.json();
}

export async function downloadDocument(envelopeId: string, documentId = 'combined'): Promise<Buffer> {
    const token = await getToken();
    const { baseUri, accountId } = await getAccountInfo();
    const res = await fetch(`${baseUri}/accounts/${accountId}/envelopes/${envelopeId}/documents/${documentId}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`DocuSign download ${res.status}: ${await res.text()}`);
    return Buffer.from(await res.arrayBuffer());
}
