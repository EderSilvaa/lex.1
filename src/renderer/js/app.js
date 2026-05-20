window.onerror = function (msg, url, line) {
    console.error('App Error:', msg, line);
    return false;
};

// Helper: escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function sanitizeHtml(html) {
    if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
        return window.DOMPurify.sanitize(html);
    }
    // Fallback: retorna o HTML do marked como está (melhor que destruir com escapeHtml)
    // marked já escapa inputs perigosos por padrão
    return html;
}

function renderMarkdownSafe(markdownText) {
    const source = typeof markdownText === 'string' ? markdownText : String(markdownText || '');
    const html = window.marked ? window.marked.parse(source) : escapeHtml(source);
    return sanitizeHtml(html);
}

function getMessageTextStats(text) {
    const source = typeof text === 'string' ? text : String(text || '');
    return {
        chars: source.length,
        lines: source.split(/\r?\n/).length,
    };
}

function shouldCollapseMessage(text, type, isRawHtml) {
    if (isRawHtml || type === 'loading') return false;
    const stats = getMessageTextStats(text);
    return stats.chars > LONG_MESSAGE_CHAR_THRESHOLD || stats.lines > LONG_MESSAGE_LINE_THRESHOLD;
}

function makeMessagePreview(text) {
    const source = typeof text === 'string' ? text : String(text || '');
    const trimmed = source.trim();
    if (trimmed.length <= LONG_MESSAGE_PREVIEW_CHARS) return trimmed;
    return trimmed.slice(0, LONG_MESSAGE_PREVIEW_CHARS).trimEnd() + '...';
}

function renderLongMessageContent(fullText, type) {
    const stats = getMessageTextStats(fullText);
    const preview = makeMessagePreview(fullText);
    const previewHtml = escapeHtml(preview).replace(/\r?\n/g, '<br>');
    const fullHtml = renderMarkdownSafe(fullText);
    const meta = `${stats.chars.toLocaleString('pt-BR')} caracteres`;
    const id = `longmsg-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return `
        <div class="msg-content markdown-body long-message is-collapsed" id="${id}" data-long-message>
            <div class="long-message-preview">${previewHtml}</div>
            <div class="long-message-full">${fullHtml}</div>
            <div class="long-message-footer">
                <span>${meta}</span>
                <button type="button" class="long-message-toggle" aria-expanded="false">Expandir</button>
            </div>
        </div>
    `;
}

function setupLongMessageToggle(msgDiv) {
    const container = msgDiv?.querySelector?.('[data-long-message]');
    const button = container?.querySelector?.('.long-message-toggle');
    if (!container || !button) return;

    button.addEventListener('click', () => {
        const collapsed = container.classList.toggle('is-collapsed');
        button.textContent = collapsed ? 'Expandir' : 'Recolher';
        button.setAttribute('aria-expanded', String(!collapsed));
        smartScrollToBottom(false);
    });
}


// ============================================================================
// AUTH / LICENCA
// ============================================================================

const ASAAS_PAYMENT_LINK = 'https://www.asaas.com/c/SEU_LINK_AQUI';

function showAuthOverlay() {
    const el = document.getElementById('auth-overlay');
    if (el) el.style.display = 'flex';
    const paywall = document.getElementById('paywall-overlay');
    if (paywall) paywall.style.display = 'none';
}

function hideAuthOverlay() {
    const el = document.getElementById('auth-overlay');
    if (el) el.style.display = 'none';
}

function showPaywall() {
    const el = document.getElementById('paywall-overlay');
    if (el) el.style.display = 'flex';
    const auth = document.getElementById('auth-overlay');
    if (auth) auth.style.display = 'none';
}

function hidePaywall() {
    const el = document.getElementById('paywall-overlay');
    if (el) el.style.display = 'none';
}

function showTrialBadge(daysLeft) {
    let badge = document.getElementById('trial-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'trial-badge';
        document.body.appendChild(badge);
    }
    badge.textContent = daysLeft <= 1 ? 'Ultimo dia de trial' : `Trial: ${daysLeft} dias restantes`;
}

function removeTrialBadge() {
    const badge = document.getElementById('trial-badge');
    if (badge) badge.remove();
}

async function initAuth() {
    try {
        const license = await window.authApi.checkLicense();
        if (!license) { showAuthOverlay(); return; }

        if (license.status === 'not_authenticated') {
            showAuthOverlay(); return;
        }
        if (license.status === 'trial_expired') {
            showPaywall(); return;
        }
        // trial_active ou pro
        hideAuthOverlay(); hidePaywall();
        if (license.status === 'trial_active') showTrialBadge(license.daysLeft);
        else removeTrialBadge();
        loadProfileCard();
    } catch {
        showAuthOverlay();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initAuth();

    // Deep-link: main.ts envia 'navigate-to' quando Electron é aberto com --view=<id>
    if (window.appNav) {
        window.appNav.onNavigateTo((viewId) => {
            const btn = document.getElementById('nav-' + viewId);
            if (btn) btn.click();
        });

        // CLI → UI: payload com ação específica (abrir arquivo, destacar nó do brain, etc.)
        window.appNav.onUiPayload((payload) => {
            if (!payload) return;
            try {
                if (payload.action === 'open-file' && payload.path) {
                    const btn = document.getElementById('nav-arquivos');
                    if (btn) btn.click();
                    window.dispatchEvent(new CustomEvent('lex-open-file', { detail: { path: payload.path } }));
                }
                if (payload.action === 'highlight-brain' && payload.nodeId) {
                    const btn = document.getElementById('nav-brain');
                    if (btn) btn.click();
                    window.dispatchEvent(new CustomEvent('lex-highlight-brain', { detail: { nodeId: payload.nodeId } }));
                }
            } catch (err) {
                console.warn('[UI] Payload error:', err);
            }
        });
    }

    if (window.updaterApi) {
        window.updaterApi.onUpdateDownloaded(() => {
            const banner = document.createElement('div');
            banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:var(--bg-tertiary);border-top:1px solid var(--accent-color);padding:10px 20px;display:flex;align-items:center;justify-content:space-between;z-index:9998;font-size:13px;color:var(--text-primary)';
            banner.innerHTML = `<span>Nova versao do LEX disponivel.</span><button id="btn-install-update" style="background:var(--accent-color);color:var(--text-primary);border:none;border-radius:6px;padding:6px 14px;font-weight:700;cursor:pointer">Instalar e reiniciar</button>`;
            document.body.appendChild(banner);
            document.getElementById('btn-install-update')?.addEventListener('click', () => window.updaterApi.installNow());
        });
    }

    const authError = document.getElementById('auth-error');
    const authGoogleBtn = document.getElementById('auth-google-btn');
    const authGoogleSafeBtn = document.getElementById('auth-google-safe-btn');
    const authGoogleLabel = authGoogleBtn?.innerHTML || 'Entrar com Google';
    async function runGoogleLogin(mode) {
        if (!authGoogleBtn) return;
        authGoogleBtn.disabled = true;
        if (authGoogleSafeBtn) authGoogleSafeBtn.disabled = true;
        authGoogleBtn.textContent = mode === 'embedded' ? 'Abrindo janela...' : 'Aguardando login...';
        if (authError) authError.style.display = 'none';

        const result = await window.authApi.signInWithGoogle({ mode }).catch(e => ({ ok: false, error: e.message }));

        authGoogleBtn.disabled = false;
        if (authGoogleSafeBtn) authGoogleSafeBtn.disabled = false;
        authGoogleBtn.innerHTML = authGoogleLabel;

        if (!result.ok) {
            if (authError) {
                authError.textContent = result.error || 'Erro ao autenticar com Google';
                authError.style.display = 'block';
            }
            if (authGoogleSafeBtn && mode !== 'embedded') authGoogleSafeBtn.style.display = 'block';
            return;
        }

        hideAuthOverlay();
        await initAuth();
    }
    if (authGoogleBtn) {
        authGoogleBtn.addEventListener('click', () => runGoogleLogin('system'));
    }
    if (authGoogleSafeBtn) {
        authGoogleSafeBtn.addEventListener('click', () => runGoogleLogin('embedded'));
    }

    const buyBtn = document.getElementById('paywall-buy-btn');
    if (buyBtn) { buyBtn.href = ASAAS_PAYMENT_LINK; buyBtn.target = '_blank'; buyBtn.rel = 'noopener'; }

    const verifyBtn = document.getElementById('paywall-verify-btn');
    if (verifyBtn) {
        verifyBtn.addEventListener('click', async () => {
            verifyBtn.disabled = true; verifyBtn.textContent = 'Verificando...';
            const license = await window.authApi.refreshLicense().catch(() => null);
            verifyBtn.disabled = false; verifyBtn.textContent = 'Ja paguei, verificar acesso';
            if (license?.status === 'pro' || license?.status === 'trial_active') {
                hidePaywall();
                if (license.status === 'trial_active') showTrialBadge(license.daysLeft);
                else removeTrialBadge();
            }
        });
    }

    const logoutBtn = document.getElementById('paywall-logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await window.authApi.signOut().catch(() => {});
            showAuthOverlay();
        });
    }
});

function updateAutomationCardStatus(cardId, status) {
    const el = document.getElementById(`${cardId}-status`);
    if (el) el.innerText = status;
}

// ============================================================================
// NAVIGATION LOGIC
// ============================================================================

const navItems = document.querySelectorAll('.nav-item');
const views = {
    'nav-files': document.querySelector('.file-manager-wrapper'),
    'nav-history': null,
    'nav-brain': document.querySelector('.brain-wrapper'),
    'nav-skills': document.querySelector('.skills-wrapper'),
    'nav-terminal': document.querySelector('.terminal-wrapper'),
    'nav-settings': document.querySelector('.settings-wrapper')
};

navItems.forEach(item => {
    item.addEventListener('click', () => {
        const viewId = item.id;

        // Update Active State
        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');

        // Hide all switchable views
        Object.values(views).forEach(v => { if (v) v.classList.add('hidden'); });

        // Show target view
        if (views[viewId]) {
            views[viewId].classList.remove('hidden');
        }

        // Refresh perfil ao abrir settings
        if (viewId === 'nav-settings') {
            loadProfileCard();
        }

        // Init brain view
        if (viewId === 'nav-brain') {
            if (typeof initBrainView === 'function') initBrainView();
        }

        if (viewId === 'nav-skills') {
            if (typeof skillsState !== 'undefined') {
                skillsState.stage = 'home';
            }
            initSkillsView();
        }

        // Init terminal view
        if (viewId === 'nav-terminal') {
            if (typeof initTerminalView === 'function') initTerminalView();
        }

    });
});

function showTerminalView(opts = {}) {
    Object.values(views).forEach(v => { if (v) v.classList.add('hidden'); });
    if (views['nav-terminal']) views['nav-terminal'].classList.remove('hidden');
    navItems.forEach(n => n.classList.remove('active'));
    document.getElementById('nav-terminal')?.classList.add('active');
    if (typeof initTerminalView === 'function') initTerminalView(opts);
    setTimeout(() => {
        if (typeof fitActiveTerminal === 'function') fitActiveTerminal();
    }, 80);
}

function waitForTerminalLayout() {
    return new Promise(resolve => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setTimeout(resolve, 80);
            });
        });
    });
}

// Initialize: Ensure Terminal is visible by default (chat widget is hidden)
if (views['nav-terminal']) {
    views['nav-terminal'].classList.remove('hidden');
    // terminal.js loads AFTER app.js — the typeof check must be inside the
    // callback, otherwise initTerminalView doesn't exist yet and this block
    // is skipped entirely, leaving a blank terminal on first open.
    setTimeout(() => {
        if (typeof initTerminalView === 'function') {
            initTerminalView();
            setTimeout(() => {
                if (typeof fitActiveTerminal === 'function') fitActiveTerminal();
            }, 300);
        }
    }, 200);
}

// ─────────────────────────────────────────────────────────────────────────────
// Privacy Settings
// ─────────────────────────────────────────────────────────────────────────────

const PRIVACY_LEVEL_HINTS = {
    '1': 'Todos os dados sensiveis (CPF, nomes, valores, CNPJ, OAB, emails) sao mascarados antes de sair da maquina. A IA so ve tokens como [PARTE_AUTORA_1], [CPF_1].',
    '2': 'Nomes de partes sao mantidos para respostas mais naturais. CPFs, CNPJs, valores e contatos sao mascarados.',
    '3': 'Nenhum dado e anonimizado. Todos os dados reais sao enviados para o provedor de IA. Nao recomendado para dados de clientes.',
    '0': 'Nenhum dado sai da sua maquina. Requer Ollama instalado localmente. Qualidade das respostas reduzida.'
};

async function initPrivacySettings() {
    const select = document.getElementById('privacy-level');
    const hint = document.getElementById('privacy-level-hint');
    const btnSave = document.getElementById('btn-privacy-save');
    const btnRevoke = document.getElementById('btn-privacy-revoke');
    const feedback = document.getElementById('privacy-feedback');
    const statsBox = document.getElementById('privacy-stats-box');

    if (!select || !window.lexApi?.privacyGetConfig) return;

    // Carrega config atual
    try {
        const config = await window.lexApi.privacyGetConfig();
        select.value = String(config.defaultLevel);
        if (hint) hint.textContent = PRIVACY_LEVEL_HINTS[select.value] || '';
    } catch { /* ignore */ }

    // Atualiza hint ao mudar nivel
    select.addEventListener('change', () => {
        if (hint) hint.textContent = PRIVACY_LEVEL_HINTS[select.value] || '';
    });

    // Salvar nivel
    if (btnSave) {
        btnSave.addEventListener('click', async () => {
            try {
                await window.lexApi.privacySetLevel(Number(select.value));
                if (feedback) { feedback.style.display = 'block'; setTimeout(() => { feedback.style.display = 'none'; }, 2000); }
            } catch (e) {
                console.error('Erro ao salvar nivel de privacidade:', e);
            }
        });
    }

    // Revogar tudo
    if (btnRevoke) {
        btnRevoke.addEventListener('click', async () => {
            if (!confirm('Revogar todo o consentimento? O nivel voltara para "Anonimizado completo" e o onboarding sera exibido novamente.')) return;
            try {
                await window.lexApi.privacyRevokeAll();
                select.value = '1';
                if (hint) hint.textContent = PRIVACY_LEVEL_HINTS['1'];
                if (feedback) { feedback.textContent = 'Consentimento revogado.'; feedback.style.display = 'block'; setTimeout(() => { feedback.style.display = 'none'; feedback.textContent = 'Salvo!'; }, 3000); }
            } catch (e) {
                console.error('Erro ao revogar consentimento:', e);
            }
        });
    }

    // Carrega audit stats
    loadPrivacyAuditStats(statsBox);
}

async function loadPrivacyAuditStats(statsBox) {
    if (!statsBox || !window.lexApi?.privacyGetAuditSummary) return;
    try {
        const summary = await window.lexApi.privacyGetAuditSummary(7);
        if (summary.totalCalls === 0) {
            statsBox.style.display = 'none';
            return;
        }
        statsBox.style.display = 'block';
        const el = document.getElementById('privacy-audit-stats');
        if (!el) return;

        const providers = Object.entries(summary.byProvider)
            .map(([p, c]) => `<span style="background:var(--bg-tertiary);padding:2px 8px;border-radius:4px;margin:2px;font-size:11px">${p} <b>${c}x</b></span>`)
            .join('') || '<span style="color:var(--text-muted)">nenhum</span>';

        el.innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
                <div style="background:rgba(var(--accent-rgb),0.1);border-radius:6px;padding:8px;text-align:center">
                    <div style="font-size:18px;font-weight:700;color:var(--accent-color)">${summary.totalCalls}</div>
                    <div style="font-size:10px;color:var(--text-muted)">Chamadas LLM</div>
                </div>
                <div style="background:rgba(121,170,138,0.1);border-radius:6px;padding:8px;text-align:center">
                    <div style="font-size:18px;font-weight:700;color:var(--success-color)">${summary.totalPIIMasked}</div>
                    <div style="font-size:10px;color:var(--text-muted)">PII mascaradas</div>
                </div>
            </div>
            <div>Providers: ${providers}</div>
        `;
    } catch { statsBox.style.display = 'none'; }
}

async function initPrivacyOnboarding() {
    if (!window.lexApi?.privacyIsOnboardingCompleted) return;
    try {
        const done = await window.lexApi.privacyIsOnboardingCompleted();
        if (done) return;
    } catch { return; }

    const overlay = document.getElementById('privacy-onboarding-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';

    // Selecao de opcao
    const options = overlay.querySelectorAll('.lex-privacy-option');
    options.forEach(opt => {
        opt.addEventListener('click', () => {
            options.forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            const radio = opt.querySelector('input[type="radio"]');
            if (radio) radio.checked = true;
        });
    });

    // Aceitar
    const btnAccept = document.getElementById('privacy-onboarding-accept');
    if (btnAccept) {
        btnAccept.addEventListener('click', async () => {
            const selected = overlay.querySelector('input[name="onb-privacy"]:checked');
            const level = selected ? Number(selected.value) : 1;
            try {
                await window.lexApi.privacyCompleteOnboarding(level);
            } catch { /* ignore */ }
            overlay.style.display = 'none';
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Analytics Dashboard
// ─────────────────────────────────────────────────────────────────────────────

async function loadAnalyticsDashboard() {
    const el = document.getElementById('analytics-dashboard');
    if (!el || !window.lexApi?.getAnalyticsSummary) return;
    try {
        const s = await window.lexApi.getAnalyticsSummary();
        if (!s) { el.textContent = 'Sem dados ainda.'; return; }

        const topSkillsHtml = s.topSkills.length > 0
            ? s.topSkills.slice(0, 5).map(sk =>
                `<span style="display:inline-block;background:var(--bg-tertiary);padding:2px 8px;border-radius:4px;margin:2px;font-size:12px">${sk.skill} <b>${sk.count}x</b></span>`
            ).join('')
            : '<span style="color:var(--text-muted)">Nenhuma skill usada ainda</span>';

        const topModelsHtml = s.topModels.length > 0
            ? s.topModels.slice(0, 3).map(m =>
                `<span style="display:inline-block;background:var(--bg-tertiary);padding:2px 8px;border-radius:4px;margin:2px;font-size:12px">${m.model.split('/').pop()} <b>${m.count}x</b></span>`
            ).join('')
            : '<span style="color:var(--text-muted)">Nenhum modelo usado ainda</span>';

        const errCount = Object.values(s.todayErrors).reduce((a, b) => a + b, 0);

        el.innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
                <div style="background:var(--bg-secondary);border-radius:8px;padding:12px;text-align:center">
                    <div style="font-size:24px;font-weight:700;color:var(--accent-color)">${s.totalMessages}</div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Mensagens (total)</div>
                </div>
                <div style="background:var(--bg-secondary);border-radius:8px;padding:12px;text-align:center">
                    <div style="font-size:24px;font-weight:700;color:var(--success-color)">${s.totalSessions}</div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Sessoes (total)</div>
                </div>
                <div style="background:var(--bg-secondary);border-radius:8px;padding:12px;text-align:center">
                    <div style="font-size:24px;font-weight:700;color:var(--warning-color)">${s.daysActive}</div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Dias ativos</div>
                </div>
                <div style="background:var(--bg-secondary);border-radius:8px;padding:12px;text-align:center">
                    <div style="font-size:24px;font-weight:700;color:var(--text-secondary)">${s.totalConversations}</div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Conversas</div>
                </div>
            </div>

            <div style="margin-bottom:10px">
                <b style="color:var(--text-secondary);font-size:12px">Hoje</b><br>
                <span>${s.todayMessages} msg</span> &middot;
                <span>${s.todaySessions} sessoes</span> &middot;
                <span>${s.todayActiveMinutes} min ativo</span>
                ${errCount > 0 ? ` &middot; <span style="color:var(--danger-color)">${errCount} erros</span>` : ''}
            </div>

            <div style="margin-bottom:10px">
                <b style="color:var(--text-secondary);font-size:12px">Sessao atual</b><br>
                <span>${s.currentSessionMinutes} min</span> &middot;
                <span>${s.currentSessionMessages} mensagens</span>
            </div>

            <div style="margin-bottom:10px">
                <b style="color:var(--text-secondary);font-size:12px">Skills mais usadas</b><br>
                ${topSkillsHtml}
            </div>

            <div style="margin-bottom:10px">
                <b style="color:var(--text-secondary);font-size:12px">Modelos mais usados</b><br>
                ${topModelsHtml}
            </div>

            <div>
                <b style="color:var(--text-secondary);font-size:12px">Provider favorito:</b>
                <span style="color:var(--accent-color)">${s.mostActiveProvider}</span>
                ${s.firstSeen ? ` &middot; <span style="color:var(--text-muted)">Desde ${s.firstSeen}</span>` : ''}
            </div>
        `;
    } catch (e) {
        el.textContent = 'Erro ao carregar estatisticas.';
        console.error('[Analytics]', e);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider / API Key settings
// ─────────────────────────────────────────────────────────────────────────────

const PROVIDER_KEY_LINKS = {
    anthropic: 'https://console.anthropic.com/settings/keys',
    openai: 'https://platform.openai.com/api-keys',
    ollama: '',
};

const SETTINGS_PROVIDERS = ['anthropic', 'openai', 'ollama'];

function normalizeSettingsProvider(providerId) {
    return SETTINGS_PROVIDERS.includes(providerId) ? providerId : 'anthropic';
}

function syncProviderChoiceUI(providerId) {
    const normalized = normalizeSettingsProvider(providerId);
    document.querySelectorAll('.provider-choice').forEach((btn) => {
        const active = btn.dataset.provider === normalized;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
}

let _providerPresets = null;
let _hermesProviderSnapshot = null;

function isLikelyLexEngineNetworkError(errorText) {
    const raw = String(errorText || '');
    return /APIConnectionError|Connection error\.?|connection reset by peer|recv failure|SSL_connect|TLS|network is unreachable|timed out|connect timeout/i.test(raw);
}

async function formatLexEngineUserError(errorText) {
    const raw = String(errorText || '').trim();
    if (!raw) return 'Motor Lex: falha ao responder';
    if (!isLikelyLexEngineNetworkError(raw) || !window.lexEngineApi?.getStatus) {
        return `Motor Lex: ${raw}`;
    }

    try {
        const statusResult = await window.lexEngineApi.getStatus();
        const status = statusResult?.success ? statusResult.data : null;
        const mode = status?.engineMode || status?.engineSource || '';
        if (!/wsl/i.test(mode)) {
            return `Motor Lex: ${raw}`;
        }

        const endpointMatch = raw.match(/https?:\/\/[^\s|)]+/i);
        const endpoint = endpointMatch ? endpointMatch[0] : 'endpoint do provedor';
        return [
            'Motor Lex: a rede parece estar bloqueando a conexao do motor WSL com o provedor.',
            `Endpoint afetado: ${endpoint}.`,
            'Isso costuma acontecer em redes de faculdade, empresa ou ambientes com inspecao de TLS no WSL.',
            'Tente outra rede, hotspot 4G/5G ou VPN e teste novamente.',
        ].join(' ');
    } catch (_) {
        return `Motor Lex: ${raw}`;
    }
}

async function loadProviderSettings() {
    try {
        _providerPresets = await window.lexApi.getProviderPresets();
        const [current, hermesState] = await Promise.all([
            window.lexApi.getProvider(),
            window.lexApi.getLexEngineProviderState?.().catch(() => null),
        ]);
        _hermesProviderSnapshot = hermesState || null;

        const providerFromHermes = SETTINGS_PROVIDERS.includes(hermesState?.desktopProviderId) ? hermesState.desktopProviderId : '';
        const effectiveProviderId = normalizeSettingsProvider(providerFromHermes || current?.providerId || 'anthropic');

        const providerSelect = document.getElementById('ai-provider');
        if (providerSelect && effectiveProviderId) {
            providerSelect.value = effectiveProviderId;
        }
        syncProviderChoiceUI(effectiveProviderId);

        populateModelSelects(effectiveProviderId, true);

        const agentSelect = document.getElementById('ai-agent-model');
        const visionSelect = document.getElementById('ai-vision-model');
        const effectiveAgentModel = hermesState?.agentModel || current?.agentModel;
        const effectiveVisionModel = hermesState?.visionModel || current?.visionModel;
        if (agentSelect && effectiveAgentModel) agentSelect.value = effectiveAgentModel;
        if (visionSelect && effectiveVisionModel) visionSelect.value = effectiveVisionModel;

        // Status da chave
        if (effectiveProviderId) {
            const status = await window.lexApi.getApiKeyStatus(effectiveProviderId);
            updateKeyStatusBadge(status);
        }

        // Link de docs + placeholder
        updateProviderLink(effectiveProviderId);
        updateApiKeyPlaceholder(effectiveProviderId);
        renderHermesProviderState(_hermesProviderSnapshot);
    } catch (_) {}
}

const skillsState = {
    loaded: false,
    catalog: null,
    runtime: null,
    analytics: null,
    connectors: null,
    connectorsLoaded: false,
    brainDashboard: null,
    stage: 'home',
    selectedPromotionFlowId: '',
    selectedPromotionPreview: null,
    promotionActionInFlight: false,
    promotionActionMessage: '',
    promotionActionError: '',
    customizeTab: 'skills',
    selectedSkillId: '',
    selectedSkillContent: '',
    selectedSkillContentLoaded: false,
    filter: 'all',
    query: '',
};

function escapeSkillsHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function openSkillsInfoModal() {
    document.getElementById('skills-info-modal')?.classList.remove('hidden');
}

function closeSkillsInfoModal() {
    document.getElementById('skills-info-modal')?.classList.add('hidden');
}

function setSkillsStage(stage) {
    const nextStage = stage === 'details' ? 'details' : 'home';
    skillsState.stage = nextStage;
    document.getElementById('skills-home-panel')?.classList.toggle('hidden', nextStage !== 'home');
    document.getElementById('skills-detail-layout')?.classList.toggle('hidden', nextStage !== 'details');
}

function switchSkillsCustomizeTab(tab) {
    const nextTab = tab === 'connectors' ? 'connectors' : 'skills';
    skillsState.customizeTab = nextTab;
    setSkillsStage('details');

    document.querySelectorAll('[data-skills-tab]').forEach((node) => {
        node.classList.toggle('active', node.getAttribute('data-skills-tab') === nextTab);
    });

    document.querySelectorAll('[data-skills-panel]').forEach((node) => {
        const isActive = node.getAttribute('data-skills-panel') === nextTab;
        node.classList.toggle('hidden', !isActive);
        node.classList.toggle('active', isActive);
    });

    if (nextTab === 'connectors') {
        void loadSkillsConnectors();
    }
}

function getSkillsRelativePath(entry) {
    const roots = skillsState.catalog?.roots || {};
    const pathValue = String(entry?.path || '');
    const candidates = [roots.localHermes, roots.repoBundled, roots.repoOptional]
        .filter(Boolean)
        .map((root) => String(root).replace(/\\/g, '/'));
    const normalizedPath = pathValue.replace(/\\/g, '/');
    const matchingRoot = candidates.find((root) => normalizedPath.startsWith(root));
    if (!matchingRoot) return normalizedPath;
    return normalizedPath.slice(matchingRoot.length).replace(/^\/+/, '') || 'SKILL.md';
}

function renderSelectedSkillPreview(entry, options = {}) {
    const titleEl = document.getElementById('skills-file-title');
    const subtitleEl = document.getElementById('skills-file-subtitle');
    const badgesEl = document.getElementById('skills-file-badges');
    const metaEl = document.getElementById('skills-file-meta');
    const bodyEl = document.getElementById('skills-file-body');
    if (!titleEl || !subtitleEl || !badgesEl || !metaEl || !bodyEl) return;

    if (!entry) {
        titleEl.textContent = 'Selecione uma skill';
        subtitleEl.textContent = 'Abra uma habilidade na arvore para ler o conteudo e revisar o contexto.';
        badgesEl.innerHTML = '';
        metaEl.innerHTML = '';
        bodyEl.innerHTML = '<p>O conteudo real da <code>SKILL.md</code> aparecera aqui.</p>';
        return;
    }

    titleEl.textContent = entry.name || 'Skill';
    subtitleEl.textContent = options.loading
        ? 'Carregando o conteudo real da skill...'
        : entry.description || 'Skill sem resumo adicional.';

    badgesEl.innerHTML = [
        `<span class="skills-file-badge">${escapeSkillsHtml(entry.command || '/skill')}</span>`,
        `<span class="skills-file-badge">${escapeSkillsHtml(entry.sourceLabel || 'Origem')}</span>`,
        `<span class="skills-file-badge">${escapeSkillsHtml(entry.category || 'geral')}</span>`,
    ].join('');

    metaEl.innerHTML = [
        `<span class="skills-file-meta-item">Arquivo: ${escapeSkillsHtml(getSkillsRelativePath(entry))}</span>`,
        entry.lastModifiedAt ? `<span class="skills-file-meta-item">Atualizada: ${escapeSkillsHtml(new Date(entry.lastModifiedAt).toLocaleDateString('pt-BR'))}</span>` : '',
        entry.isLocalOnly ? '<span class="skills-file-meta-item">Local/aprendida</span>' : '',
    ].filter(Boolean).join('');

    if (options.loading) {
        bodyEl.innerHTML = '<p>Carregando <code>SKILL.md</code>...</p>';
        return;
    }

    const content = String(options.content || '').trim();
    bodyEl.innerHTML = content
        ? renderMarkdownSafe(content)
        : `<p>${escapeSkillsHtml(entry.description || 'Skill sem conteudo adicional.')}</p>`;
}

async function loadSelectedSkillContent(entry) {
    if (!entry) {
        skillsState.selectedSkillContent = '';
        skillsState.selectedSkillContentLoaded = false;
        renderSelectedSkillPreview(null);
        return;
    }

    renderSelectedSkillPreview(entry, { loading: true });

    if (!window.skillsApi?.readSkillFile) {
        skillsState.selectedSkillContent = entry.description || '';
        skillsState.selectedSkillContentLoaded = false;
        renderSelectedSkillPreview(entry, { content: entry.description || '' });
        return;
    }

    try {
        const result = await window.skillsApi.readSkillFile(entry.path);
        if (entry.id !== skillsState.selectedSkillId) return;
        skillsState.selectedSkillContent = result?.success ? String(result.content || '') : (entry.description || '');
        skillsState.selectedSkillContentLoaded = !!result?.success;
        renderSelectedSkillPreview(entry, { content: skillsState.selectedSkillContent });
    } catch (error) {
        console.error('[Skills] Erro ao ler SKILL.md:', error);
        if (entry.id !== skillsState.selectedSkillId) return;
        skillsState.selectedSkillContent = entry.description || '';
        skillsState.selectedSkillContentLoaded = false;
        renderSelectedSkillPreview(entry, { content: skillsState.selectedSkillContent });
    }
}

function getConnectorStatusMeta(item, type) {
    if (type === 'mcp') {
        if (item?.enabled) return { label: 'habilitado', tone: 'live' };
        return { label: 'desligado', tone: 'idle' };
    }

    if (item?.connected) return { label: 'conectado', tone: 'live' };
    if (item?.enabled) return { label: 'habilitado', tone: 'warm' };
    if (item?.hasCredentials) return { label: 'configurado', tone: 'soft' };
    return { label: 'desligado', tone: 'idle' };
}

function renderSkillsConnectorsSummary(payload) {
    const snapshot = payload?.snapshot || null;
    const mcpServers = Array.isArray(snapshot?.mcpServers) ? snapshot.mcpServers : [];
    const gatewayPlatforms = Array.isArray(snapshot?.gatewayPlatforms) ? snapshot.gatewayPlatforms : [];
    const total = mcpServers.length + gatewayPlatforms.length;

    const totalEl = document.getElementById('skills-connectors-total');
    const connectedEl = document.getElementById('skills-connectors-connected');
    const readyEl = document.getElementById('skills-connectors-ready');
    const noteEl = document.getElementById('skills-connectors-note');

    if (totalEl) totalEl.textContent = String(total || 0);
    if (connectedEl) connectedEl.textContent = String(mcpServers.length || 0);
    if (readyEl) readyEl.textContent = String(gatewayPlatforms.length || 0);

    if (!noteEl) return;

    if (!snapshot?.available) {
        noteEl.textContent = snapshot?.error
            ? `O Hermes nao respondeu com o mapa de conectores: ${snapshot.error}`
            : 'O snapshot de conectores do Hermes nao esta disponivel agora.';
        return;
    }

    const enabledMcp = mcpServers.filter((item) => item?.enabled).length;
    const connectedGateway = gatewayPlatforms.filter((item) => item?.connected).length;
    const runtime = snapshot.gatewayRuntime || null;
    const runtimeLabel = runtime?.running
        ? `gateway em execucao via ${runtime.manager || 'runtime local'}`
        : `gateway parado (${runtime?.manager || 'sem manager detectado'})`;

    noteEl.textContent =
        `${enabledMcp}/${mcpServers.length} MCP habilitados, ` +
        `${connectedGateway}/${gatewayPlatforms.length} plataformas de gateway conectadas; ${runtimeLabel}.`;
}

function renderSkillsConnectorsRuntime(snapshot) {
    const runtimeEl = document.getElementById('skills-connectors-runtime');
    if (!runtimeEl) return;

    if (!snapshot?.available) {
        runtimeEl.innerHTML = `<div class="skills-empty-state">${escapeSkillsHtml(snapshot?.error || 'Runtime do Hermes indisponivel.')}</div>`;
        return;
    }

    const runtime = snapshot.gatewayRuntime || {};
    const status = runtime.running ? 'Em execucao' : 'Parado';
    const service = runtime.serviceInstalled
        ? (runtime.serviceRunning ? 'Servico ativo' : 'Servico instalado')
        : 'Sem servico instalado';
    const pids = Array.isArray(runtime.gatewayPids) && runtime.gatewayPids.length
        ? runtime.gatewayPids.join(', ')
        : 'nenhum PID visivel';

    runtimeEl.innerHTML = `
        <div class="skills-connectors-runtime-grid">
            <div class="skills-sidecard">
                <span class="skills-sidecard-kicker">Gateway Hermes</span>
                <strong class="skills-connector-runtime-title">${escapeSkillsHtml(status)}</strong>
                <p class="skills-side-note">${escapeSkillsHtml(runtime.manager || 'manual process')}</p>
            </div>
            <div class="skills-sidecard">
                <span class="skills-sidecard-kicker">Servico</span>
                <strong class="skills-connector-runtime-title">${escapeSkillsHtml(service)}</strong>
                <p class="skills-side-note">${escapeSkillsHtml(runtime.serviceScope || 'escopo nao informado')}</p>
            </div>
            <div class="skills-sidecard">
                <span class="skills-sidecard-kicker">Projeto WSL</span>
                <strong class="skills-connector-runtime-title">${escapeSkillsHtml(snapshot.projectPath || '--')}</strong>
                <p class="skills-side-note">Distro ${escapeSkillsHtml(snapshot.distro || '--')}</p>
            </div>
            <div class="skills-sidecard">
                <span class="skills-sidecard-kicker">Config</span>
                <strong class="skills-connector-runtime-title">${escapeSkillsHtml(snapshot.configPath || '--')}</strong>
                <p class="skills-side-note">PIDs: ${escapeSkillsHtml(pids)}</p>
            </div>
        </div>
    `;
}

function renderSkillsConnectorGroup(title, kicker, items, type) {
    if (!Array.isArray(items) || items.length === 0) {
        return `
            <section class="skills-connector-group">
                <div class="skills-preview-head">
                    <div>
                        <span class="skills-sidecard-kicker">${escapeSkillsHtml(kicker)}</span>
                        <h3>${escapeSkillsHtml(title)}</h3>
                    </div>
                    <span class="skills-preview-meta">0 itens</span>
                </div>
                <div class="skills-empty-state">Nenhum item encontrado nesta camada.</div>
            </section>
        `;
    }

    const cards = items.map((item) => {
        const status = getConnectorStatusMeta(item, type);
        const meta = [];
        if (type === 'mcp') {
            meta.push(`Transporte: ${item.transport || 'unknown'}`);
            if (item.command) meta.push(`Comando: ${item.command}`);
            if (item.url) meta.push(`URL: ${item.url}`);
            if (item.argsCount) meta.push(`Args: ${item.argsCount}`);
            if (Array.isArray(item.toolFilters) && item.toolFilters.length) {
                meta.push(`Filtros: ${item.toolFilters.join(', ')}`);
            }
        } else {
            meta.push(`Tipo: ${item.kind || 'general'}`);
            if (item.toolset) meta.push(`Toolset: ${item.toolset}`);
            meta.push(`Home channel: ${item.hasHomeChannel ? 'sim' : 'nao'}`);
            if (Array.isArray(item.extraKeys) && item.extraKeys.length) {
                meta.push(`Campos: ${item.extraKeys.join(', ')}`);
            }
        }

        return `
            <article class="skills-connector-card">
                <div class="skills-connector-header">
                    <div>
                        <strong class="skills-connector-name">${escapeSkillsHtml(item.name || item.label || item.id || 'Connector')}</strong>
                        <div class="skills-connector-id">${escapeSkillsHtml(item.id || '')}</div>
                    </div>
                    <span class="skills-connector-badge is-${escapeSkillsHtml(status.tone)}">${escapeSkillsHtml(status.label)}</span>
                </div>
                <div class="skills-connector-meta">
                    ${meta.map((line) => `<span>${escapeSkillsHtml(line)}</span>`).join('')}
                </div>
            </article>
        `;
    }).join('');

    return `
        <section class="skills-connector-group">
            <div class="skills-preview-head">
                <div>
                    <span class="skills-sidecard-kicker">${escapeSkillsHtml(kicker)}</span>
                    <h3>${escapeSkillsHtml(title)}</h3>
                </div>
                <span class="skills-preview-meta">${items.length} itens</span>
            </div>
            <div class="skills-connector-grid">${cards}</div>
        </section>
    `;
}

function renderSkillsConnectorsGroups(snapshot) {
    const groupsEl = document.getElementById('skills-connectors-groups');
    if (!groupsEl) return;

    if (!snapshot?.available) {
        groupsEl.innerHTML = `<div class="skills-empty-state">${escapeSkillsHtml(snapshot?.error || 'Connectors do Hermes indisponiveis.')}</div>`;
        return;
    }

    groupsEl.innerHTML = [
        renderSkillsConnectorGroup('Servidores MCP do Hermes', 'MCP', snapshot.mcpServers || [], 'mcp'),
        renderSkillsConnectorGroup('Plataformas e gateways herdados', 'Gateway', snapshot.gatewayPlatforms || [], 'gateway'),
    ].join('');
}

async function loadSkillsConnectors(force = false) {
    const runtimeEl = document.getElementById('skills-connectors-runtime');
    const groupsEl = document.getElementById('skills-connectors-groups');
    const noteEl = document.getElementById('skills-connectors-note');
    if (!runtimeEl || !groupsEl) return;

    if (skillsState.connectorsLoaded && !force && skillsState.connectors) {
        renderSkillsConnectorsSummary(skillsState.connectors);
        renderSkillsConnectorsRuntime(skillsState.connectors.snapshot);
        renderSkillsConnectorsGroups(skillsState.connectors.snapshot);
        return;
    }

    runtimeEl.innerHTML = '<div class="skills-empty-state">Carregando runtime do Hermes...</div>';
    groupsEl.innerHTML = '<div class="skills-empty-state">Carregando conectores do Hermes...</div>';
    if (noteEl) noteEl.textContent = 'Lendo MCP, gateway e integracoes herdadas do Hermes...';

    try {
        const snapshotResult = await window.skillsApi?.getConnectorsSnapshot?.();
        const snapshot = snapshotResult?.success ? snapshotResult.snapshot : {
            available: false,
            error: snapshotResult?.error || 'Falha ao consultar snapshot de connectors.',
            mcpServers: [],
            gatewayPlatforms: [],
        };
        const payload = { snapshot };

        skillsState.connectors = payload;
        skillsState.connectorsLoaded = true;
        renderSkillsConnectorsSummary(payload);
        renderSkillsConnectorsRuntime(snapshot);
        renderSkillsConnectorsGroups(snapshot);
    } catch (error) {
        console.error('[Skills] Erro ao carregar connectors:', error);
        const message = escapeSkillsHtml(error?.message || 'Falha ao carregar connectors.');
        if (noteEl) noteEl.textContent = 'Nao foi possivel carregar os connectors agora.';
        runtimeEl.innerHTML = `<div class="skills-empty-state">${message}</div>`;
        groupsEl.innerHTML = `<div class="skills-empty-state">${message}</div>`;
    }
}

function setupSkillsCustomizeShell() {
    const wrapper = document.querySelector('.skills-wrapper');
    if (!wrapper || wrapper.dataset.customizeBound === '1') return;
    wrapper.dataset.customizeBound = '1';

    document.getElementById('skills-home-open-skills')?.addEventListener('click', () => {
        switchSkillsCustomizeTab('skills');
    });

    document.getElementById('skills-home-open-connectors')?.addEventListener('click', () => {
        switchSkillsCustomizeTab('connectors');
    });

    document.querySelectorAll('[data-skills-tab]').forEach((node) => {
        node.addEventListener('click', () => {
            switchSkillsCustomizeTab(node.getAttribute('data-skills-tab') || 'skills');
        });
    });

    document.getElementById('skills-switch-connectors-btn')?.addEventListener('click', () => {
        switchSkillsCustomizeTab('connectors');
    });

    document.getElementById('skills-open-approval-btn')?.addEventListener('click', () => {
        switchSkillsCustomizeTab('skills');
        document.getElementById('skills-preview-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    ['skills-open-info-btn', 'skills-open-info-inline-btn', 'skills-open-create-btn'].forEach((id) => {
        document.getElementById(id)?.addEventListener('click', openSkillsInfoModal);
    });

    document.getElementById('skills-info-close')?.addEventListener('click', closeSkillsInfoModal);
    document.getElementById('skills-info-modal')?.addEventListener('click', (event) => {
        if (event.target === event.currentTarget) closeSkillsInfoModal();
    });
}

function renderSkillsRoots(roots) {
    const rootsEl = document.getElementById('skills-roots');
    if (!rootsEl || !roots) return;

    rootsEl.innerHTML = [
        ['Repo skills', roots.repoBundled],
        ['Optional', roots.repoOptional],
        ['Hermes home', roots.localHermes],
    ].map(([label, value]) => (
        `<div class="skills-root-chip"><strong>${escapeSkillsHtml(label)}</strong><span>${escapeSkillsHtml(value)}</span></div>`
    )).join('');
}

function updateSkillsMetrics(summary) {
    const entries = Array.isArray(skillsState.catalog?.entries) ? skillsState.catalog.entries : [];
    const legalEntries = entries.filter((entry) => entry?.isLegal);
    const pjeEntries = legalEntries.filter((entry) =>
        /pje|tribunal|processo|autos|consulta/i.test(`${entry?.name || ''} ${entry?.description || ''} ${entry?.category || ''}`),
    );
    const localEntries = legalEntries.filter((entry) => entry?.source === 'local-hermes');

    document.getElementById('skills-metric-total').textContent = String(legalEntries.length || summary?.legal || '--');
    document.getElementById('skills-metric-legal').textContent = String(pjeEntries.length || '--');
    document.getElementById('skills-metric-local').textContent = String(localEntries.length || '--');
}

function isPjeSkillEntry(entry) {
    const text = `${entry?.name || ''} ${entry?.description || ''} ${entry?.category || ''}`.toLowerCase();
    return /pje|tribunal|processo|autos|consulta|mural/.test(text);
}

function isDocumentSkillEntry(entry) {
    const text = `${entry?.name || ''} ${entry?.description || ''} ${entry?.category || ''}`.toLowerCase();
    return /document|petic|juris|sentenc|acord|analise|sumar|resumo|prova|contrato/.test(text);
}

function getPromotionTargetUiLabel(target) {
    if (target === 'skill') return 'Skill em potencial';
    if (target === 'playbook') return 'Playbook em potencial';
    return 'Nota em potencial';
}

function getPromotionTargetUiMeaning(target) {
    if (target === 'skill') return 'Procedimento maduro o bastante para futura habilidade acionavel.';
    if (target === 'playbook') return 'Procedimento repetivel que merece virar guia operacional.';
    return 'Aprendizado curto, memoria de caso/processo, contexto ou alerta util.';
}

function getFilteredSkillsEntries() {
    const entries = Array.isArray(skillsState.catalog?.entries)
        ? skillsState.catalog.entries.filter((entry) => entry?.isLegal)
        : [];
    const query = skillsState.query.trim().toLowerCase();

    return entries.filter((entry) => {
        if (skillsState.filter === 'pje' && !isPjeSkillEntry(entry)) return false;
        if (skillsState.filter === 'documentos' && !isDocumentSkillEntry(entry)) return false;
        if (skillsState.filter === 'local-hermes' && entry.source !== 'local-hermes') return false;
        if (!query) return true;

        const haystack = [
            entry.name,
            entry.command,
            entry.description,
            entry.category,
            entry.sourceLabel,
        ].join(' ').toLowerCase();

        return haystack.includes(query);
    });
}

function renderSkillsList() {
    const listEl = document.getElementById('skills-list');
    const treeEl = document.getElementById('skills-tree-list');
    if (listEl) listEl.classList.add('hidden');
    if (!treeEl) return;

    const entries = getFilteredSkillsEntries();
    if (!entries.length) {
        skillsState.selectedSkillId = '';
        treeEl.innerHTML = '<div class="skills-empty-state">Nenhuma habilidade juridica encontrada para esse filtro.</div>';
        renderSelectedSkillPreview(null);
        return;
    }

    const groups = new Map();
    for (const entry of entries) {
        const sourceKey = entry.sourceLabel || 'Skills';
        if (!groups.has(sourceKey)) groups.set(sourceKey, new Map());
        const categoryMap = groups.get(sourceKey);
        const categoryKey = entry.category || 'geral';
        if (!categoryMap.has(categoryKey)) categoryMap.set(categoryKey, []);
        categoryMap.get(categoryKey).push(entry);
    }

    const previousActiveId = skillsState.selectedSkillId;
    const activeId = entries.some((entry) => entry.id === skillsState.selectedSkillId)
        ? skillsState.selectedSkillId
        : entries[0]?.id || '';
    if (activeId !== previousActiveId) {
        skillsState.selectedSkillContent = '';
        skillsState.selectedSkillContentLoaded = false;
    }
    skillsState.selectedSkillId = activeId;

    treeEl.innerHTML = Array.from(groups.entries()).map(([sourceLabel, categoryMap]) => `
        <details class="skills-tree-group" open>
            <summary class="skills-tree-group-summary">${escapeSkillsHtml(sourceLabel)}</summary>
            ${Array.from(categoryMap.entries()).map(([category, categoryEntries]) => `
                <details class="skills-tree-folder" open>
                    <summary class="skills-tree-folder-summary">${escapeSkillsHtml(category)}</summary>
                    <div class="skills-tree-items">
                        ${categoryEntries.map((entry) => `
                            <button type="button" class="skills-tree-item${entry.id === activeId ? ' active' : ''}" data-skill-id="${escapeSkillsHtml(entry.id)}">
                                <span class="skills-tree-item-icon">#</span>
                                <span class="skills-tree-item-label">
                                    <strong>${escapeSkillsHtml(entry.name)}</strong>
                                    <span>${escapeSkillsHtml(entry.command)}</span>
                                </span>
                            </button>
                        `).join('')}
                    </div>
                </details>
            `).join('')}
        </details>
    `).join('');

    treeEl.querySelectorAll('.skills-tree-item').forEach((node) => {
        node.addEventListener('click', () => {
            const skillId = node.getAttribute('data-skill-id') || '';
            if (!skillId || skillId === skillsState.selectedSkillId) return;
            skillsState.selectedSkillId = skillId;
            skillsState.selectedSkillContent = '';
            skillsState.selectedSkillContentLoaded = false;
            renderSkillsList();
        });
    });

    const activeEntry = entries.find((entry) => entry.id === activeId) || entries[0] || null;
    if (!activeEntry) {
        renderSelectedSkillPreview(null);
        return;
    }

    if (skillsState.selectedSkillContentLoaded && activeEntry.id === activeId) {
        renderSelectedSkillPreview(activeEntry, { content: skillsState.selectedSkillContent });
        return;
    }

    void loadSelectedSkillContent(activeEntry);
}

function renderSkillsRuntime(snapshot) {
    const runtimeNoteEl = document.getElementById('skills-runtime-note');
    if (!runtimeNoteEl) return;

    if (!snapshot?.available) {
        runtimeNoteEl.textContent = snapshot?.error
            ? `Runtime Hermes indisponivel agora: ${snapshot.error}`
            : 'Runtime Hermes indisponivel agora.';
        return;
    }

    const active = Number(snapshot.activeSkills || 0);
    const total = Number(snapshot.totalSkills || 0);
    const disabled = Number(snapshot.disabledSkills || 0);
    const legal = Number(snapshot.legalSkills || 0);
    const distro = snapshot.distro || 'WSL';
    runtimeNoteEl.innerHTML = [
        `Runtime Hermes ativa em <strong>${escapeSkillsHtml(distro)}</strong>.`,
        `Hoje a Lex enxerga <strong>${active}</strong> skills ativas de um total de ${total}, com ${disabled} desabilitadas e ${legal} legais ativas.`,
        snapshot.hermesHome ? `Hermes home: ${escapeSkillsHtml(snapshot.hermesHome)}` : '',
    ].filter(Boolean).join(' ');
}

function formatSkillsRelativeTime(isoString) {
    if (!isoString) return 'sem data';
    const ts = new Date(isoString).getTime();
    if (!Number.isFinite(ts)) return 'sem data';

    const diffMs = Date.now() - ts;
    const diffMinutes = Math.max(0, Math.round(diffMs / 60000));
    if (diffMinutes < 1) return 'agora';
    if (diffMinutes < 60) return `${diffMinutes} min atras`;

    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} h atras`;

    const diffDays = Math.round(diffHours / 24);
    if (diffDays < 30) return `${diffDays} d atras`;

    return new Date(ts).toLocaleDateString('pt-BR');
}

function renderSkillsMemoryState(snapshot) {
    const memoryStateEl = document.getElementById('skills-memory-state');
    const activityStateEl = document.getElementById('skills-activity-state');
    if (!memoryStateEl || !activityStateEl) return;

    if (!snapshot?.available) {
        memoryStateEl.innerHTML = '<li>Runtime Hermes indisponivel para ler memoria agora.</li>';
        activityStateEl.innerHTML = '<li>Sem atividade recente enquanto a runtime estiver off.</li>';
        return;
    }

    const memoryProvider = snapshot.memoryProvider || 'builtin';
    const memoryFiles = Array.isArray(snapshot.memoryFiles) ? snapshot.memoryFiles : [];
    const recentSkillUpdates = Array.isArray(snapshot.recentSkillUpdates) ? snapshot.recentSkillUpdates : [];

    memoryStateEl.innerHTML = [
        `<li><strong>Provider:</strong> ${escapeSkillsHtml(memoryProvider === 'builtin' ? 'built-in only' : memoryProvider)}</li>`,
        snapshot.memoriesDir ? `<li><strong>Onde mora:</strong> ${escapeSkillsHtml(snapshot.memoriesDir)}</li>` : '',
        ...memoryFiles.map((file) => {
            if (!file?.exists) {
                return `<li><strong>${escapeSkillsHtml(file?.name || 'memoria')}:</strong> ainda nao criado</li>`;
            }
            return `<li><strong>${escapeSkillsHtml(file.name)}:</strong> ${Number(file.entryCount || 0)} entradas, ${Number(file.charCount || 0)} chars, atualizado ${escapeSkillsHtml(formatSkillsRelativeTime(file.modifiedAt))}</li>`;
        }),
    ].filter(Boolean).join('');

    if (!recentSkillUpdates.length) {
        activityStateEl.innerHTML = '<li>Nenhuma skill local recente detectada na runtime.</li>';
        return;
    }

    activityStateEl.innerHTML = recentSkillUpdates.map((item) => {
        const label = item?.name || 'skill';
        const when = formatSkillsRelativeTime(item?.modifiedAt);
        return `<li><strong>${escapeSkillsHtml(label)}:</strong> curada/atualizada ${escapeSkillsHtml(when)}</li>`;
    }).join('');
}

function renderSkillsUsageState(summary) {
    const usageStateEl = document.getElementById('skills-usage-state');
    if (!usageStateEl) return;

    const recentCalls = Array.isArray(summary?.recentSkillCalls) ? summary.recentSkillCalls : [];
    if (!recentCalls.length) {
        usageStateEl.innerHTML = '<li>Nenhuma skill usada ainda nesta sessao.</li>';
        return;
    }

    const grouped = new Map();
    for (const item of recentCalls) {
        const skill = String(item?.skill || '').trim();
        if (!skill) continue;
        if (!grouped.has(skill)) {
            grouped.set(skill, {
                skill,
                count: 0,
                successCount: 0,
                lastAt: item?.at || '',
            });
        }
        const current = grouped.get(skill);
        current.count += 1;
        if (item?.success) current.successCount += 1;
        if (!current.lastAt && item?.at) current.lastAt = item.at;
    }

    const items = Array.from(grouped.values()).slice(0, 6);
    usageStateEl.innerHTML = items.map((item) => {
        const successInfo = item.successCount === item.count
            ? 'ok'
            : `${item.successCount}/${item.count} ok`;
        return `<li><strong>${escapeSkillsHtml(item.skill)}:</strong> usada ${item.count}x, ${escapeSkillsHtml(successInfo)}, por ultimo ${escapeSkillsHtml(formatSkillsRelativeTime(item.lastAt))}</li>`;
    }).join('');
}

function renderSkillsPromotionState(dashboard) {
    const promotionStateEl = document.getElementById('skills-promotion-state');
    if (!promotionStateEl) return;

    const topFlows = Array.isArray(dashboard?.topFlows) ? dashboard.topFlows : [];
    if (!topFlows.length) {
        promotionStateEl.innerHTML = '<li>Nenhum flow recorrente forte o suficiente para promover ainda.</li>';
        return;
    }

    const candidates = topFlows
        .filter((flow) => Number(flow?.instances || 0) >= 2 && Number(flow?.confidence || 0) >= 0.55)
        .slice(0, 4)
        .map((flow) => {
            const tools = Array.isArray(flow?.tools) ? flow.tools : [];
            const tribunal = flow?.tribunal || '?';
            const context = flow?.pjeContext || '';
            const isSkillCandidate = tools.length >= 3 || tools.some((tool) => /browser_use|exploration/i.test(String(tool || '')));
            return {
                tribunal,
                context,
                instances: Number(flow?.instances || 0),
                confidence: Number(flow?.confidence || 0),
                recommendation: isSkillCandidate ? 'candidato a skill/playbook' : 'candidato a nota/playbook',
            };
        });

    if (!candidates.length) {
        promotionStateEl.innerHTML = '<li>Flows existem, mas ainda sem recorrencia ou confianca para promocao duravel.</li>';
        return;
    }

    promotionStateEl.innerHTML = candidates.map((candidate) => (
        `<li><strong>${escapeSkillsHtml(candidate.tribunal)} ${candidate.context ? `· ${escapeSkillsHtml(candidate.context)}` : ''}</strong><br>${escapeSkillsHtml(candidate.recommendation)} · ${candidate.instances}x · conf ${candidate.confidence.toFixed(2)}</li>`
    )).join('');
}

// Politica centralizada: usa candidatos calculados pelo Brain dashboard
// em vez de heuristica inline de UI.
function renderSkillsPromotionState(dashboard) {
    const promotionStateEl = document.getElementById('skills-promotion-state');
    if (!promotionStateEl) return;

    const candidates = Array.isArray(dashboard?.promotionCandidates) ? dashboard.promotionCandidates : [];
    if (!candidates.length) {
        promotionStateEl.innerHTML = '<li>Nenhum flow recorrente forte o suficiente para promover ainda.</li>';
        return;
    }

    promotionStateEl.innerHTML = candidates.slice(0, 4).map((candidate) => (
        `<li><strong>${escapeSkillsHtml(candidate.tribunal || '?')}${candidate.pjeContext ? ` · ${escapeSkillsHtml(candidate.pjeContext)}` : ''}</strong><br>${escapeSkillsHtml(candidate.target)} · ${candidate.instances}x · conf ${candidate.confidence.toFixed(2)}<br><span class="skills-side-note">${escapeSkillsHtml(candidate.rationale || '')}</span></li>`
    )).join('');
}

function renderSkillsPromotionState(dashboard) {
    const promotionStateEl = document.getElementById('skills-promotion-state');
    if (!promotionStateEl) return;

    const candidates = Array.isArray(dashboard?.promotionCandidates) ? dashboard.promotionCandidates : [];
    if (!candidates.length) {
        skillsState.selectedPromotionFlowId = '';
        promotionStateEl.innerHTML = '<li>Nenhum flow recorrente forte o suficiente para promover ainda.</li>';
        renderSkillsPromotionPreview(null);
        return;
    }

    const visibleCandidates = candidates.slice(0, 4);
    const activeFlowId = visibleCandidates.some((candidate) => candidate.flowId === skillsState.selectedPromotionFlowId)
        ? skillsState.selectedPromotionFlowId
        : visibleCandidates[0]?.flowId;

    skillsState.selectedPromotionFlowId = activeFlowId || '';

    promotionStateEl.innerHTML = visibleCandidates.map((candidate) => (
        `<li><button type="button" class="skills-promotion-item${candidate.flowId === activeFlowId ? ' active' : ''}" data-flow-id="${escapeSkillsHtml(candidate.flowId)}" data-target="${escapeSkillsHtml(candidate.target)}"><strong>${escapeSkillsHtml(candidate.tribunal || '?')}${candidate.pjeContext ? ` · ${escapeSkillsHtml(candidate.pjeContext)}` : ''}</strong><br>${escapeSkillsHtml(candidate.target)} · ${candidate.instances}x · conf ${candidate.confidence.toFixed(2)}<br><span class="skills-side-note">${escapeSkillsHtml(candidate.rationale || '')}</span></button></li>`
    )).join('');

    promotionStateEl.querySelectorAll('.skills-promotion-item').forEach((node) => {
        node.addEventListener('click', () => {
            const flowId = node.getAttribute('data-flow-id') || '';
            const target = node.getAttribute('data-target') || '';
            skillsState.selectedPromotionFlowId = flowId;
            renderSkillsPromotionState(skillsState.brainDashboard);
            loadSkillsPromotionPreview(flowId, target);
        });
    });

    if (activeFlowId) {
        const activeCandidate = visibleCandidates.find((candidate) => candidate.flowId === activeFlowId);
        loadSkillsPromotionPreview(activeFlowId, activeCandidate?.target || '');
    }
}

function renderSkillsPromotionPreview(preview) {
    const titleEl = document.getElementById('skills-preview-title');
    const metaEl = document.getElementById('skills-preview-meta');
    const bodyEl = document.getElementById('skills-preview-body');
    if (!titleEl || !metaEl || !bodyEl) return;

    if (!preview?.ok) {
        titleEl.textContent = 'Nenhum candidato selecionado';
        metaEl.textContent = 'Aguardando flow candidato.';
        bodyEl.textContent = 'Selecione um candidato de promocao para ver um rascunho de nota, playbook ou skill.';
        return;
    }

    titleEl.textContent = preview.label || 'Preview de promocao';
    metaEl.textContent = `${preview.target || 'nota'} · ${preview.tribunal || '?'}${preview.pjeContext ? ` · ${preview.pjeContext}` : ''}`;
    bodyEl.innerHTML = renderMarkdownSafe(preview.markdown || '');
}

async function loadSkillsPromotionPreview(flowId, target) {
    if (!flowId || !window.brainApi?.getPromotionPreview) {
        renderSkillsPromotionPreview(null);
        return;
    }

    try {
        const preview = await window.brainApi.getPromotionPreview(flowId, target || undefined);
        renderSkillsPromotionPreview(preview);
    } catch (error) {
        console.error('[Skills] Erro ao carregar preview de promocao:', error);
        renderSkillsPromotionPreview(null);
    }
}

function updateSkillsPromotionActions() {
    const noteBtn = document.getElementById('skills-curate-note-btn');
    const playbookBtn = document.getElementById('skills-curate-playbook-btn');
    const brainBtn = document.getElementById('skills-curate-brain-btn');
    const discardBtn = document.getElementById('skills-curate-discard-btn');
    const saveStateEl = document.getElementById('skills-preview-save-state');
    if (!noteBtn || !playbookBtn || !brainBtn || !discardBtn || !saveStateEl) return;

    const preview = skillsState.selectedPromotionPreview;
    const disabled = !preview?.ok || skillsState.promotionActionInFlight;
    noteBtn.disabled = disabled;
    playbookBtn.disabled = disabled;
    brainBtn.disabled = disabled;
    discardBtn.disabled = disabled;

    if (skillsState.promotionActionInFlight) {
        saveStateEl.textContent = 'Aplicando decisao de curadoria...';
        return;
    }

    if (skillsState.promotionActionError) {
        saveStateEl.textContent = `Falha ao aplicar curadoria: ${skillsState.promotionActionError}`;
        return;
    }

    if (skillsState.promotionActionMessage) {
        saveStateEl.innerHTML = skillsState.promotionActionMessage;
        return;
    }

    if (!preview?.ok) {
        saveStateEl.textContent = 'Depois da revisao, escolha se isso vira nota, playbook, fica so no Brain ou deve ser descartado.';
        return;
    }

    saveStateEl.textContent = [
        'Nota = memoria curta de caso/processo, contexto ou alerta.',
        'Playbook = procedimento repetivel.',
        'Manter no Brain = deixa como memoria operacional.',
        'Descartar = oculta a sugestao atual.',
    ].join(' ');
}

function setupSkillsPromotionActions() {
    const noteBtn = document.getElementById('skills-curate-note-btn');
    const playbookBtn = document.getElementById('skills-curate-playbook-btn');
    const brainBtn = document.getElementById('skills-curate-brain-btn');
    const discardBtn = document.getElementById('skills-curate-discard-btn');
    if (!noteBtn || !playbookBtn || !brainBtn || !discardBtn || noteBtn.dataset.bound === '1') return;
    noteBtn.dataset.bound = '1';

    const runCuration = async (action) => {
        const preview = skillsState.selectedPromotionPreview;
        if (!preview?.ok || !window.brainApi?.curatePromotion || skillsState.promotionActionInFlight) return;

        skillsState.promotionActionInFlight = true;
        skillsState.promotionActionMessage = '';
        skillsState.promotionActionError = '';
        updateSkillsPromotionActions();

        try {
            const result = await window.brainApi.curatePromotion(preview.flowId, action);
            if (!result?.ok) {
                throw new Error(result?.error || 'Falha ao aplicar curadoria');
            }

            if (action === 'nota' || action === 'playbook') {
                skillsState.promotionActionMessage = `${action === 'nota' ? 'Nota' : 'Playbook'} criado em <code>${escapeSkillsHtml(result.relativePath || result.path || '')}</code>.`;
            } else if (action === 'brain_only') {
                skillsState.promotionActionMessage = 'Sugestao marcada para permanecer so no Brain.';
            } else {
                skillsState.promotionActionMessage = 'Sugestao descartada desta fila de promocao.';
            }

            skillsState.brainDashboard = await window.brainApi.getDashboard?.({ windowDays: 7, topFlowsLimit: 8 }) || skillsState.brainDashboard;
            renderSkillsPromotionState(skillsState.brainDashboard);
        } catch (error) {
            console.error('[Skills] Erro ao aplicar curadoria de promocao:', error);
            skillsState.promotionActionError = error?.message || String(error || 'Falha ao aplicar curadoria');
        } finally {
            skillsState.promotionActionInFlight = false;
            updateSkillsPromotionActions();
        }
    };

    noteBtn.addEventListener('click', () => { void runCuration('nota'); });
    playbookBtn.addEventListener('click', () => { void runCuration('playbook'); });
    brainBtn.addEventListener('click', () => { void runCuration('brain_only'); });
    discardBtn.addEventListener('click', () => { void runCuration('discarded'); });

    updateSkillsPromotionActions();
}

function renderSkillsPromotionPreview(preview) {
    const titleEl = document.getElementById('skills-preview-title');
    const metaEl = document.getElementById('skills-preview-meta');
    const bodyEl = document.getElementById('skills-preview-body');
    if (!titleEl || !metaEl || !bodyEl) return;

    skillsState.selectedPromotionPreview = preview?.ok ? preview : null;

    if (!preview?.ok) {
        titleEl.textContent = 'Nenhum candidato selecionado';
        metaEl.textContent = 'Aguardando flow candidato.';
        bodyEl.textContent = 'Selecione um candidato de promocao para ver um rascunho de nota, playbook ou skill.';
        updateSkillsPromotionActions();
        return;
    }

    titleEl.textContent = preview.label || 'Preview de promocao';
    metaEl.textContent = `${preview.target || 'nota'} | ${preview.tribunal || '?'}${preview.pjeContext ? ` | ${preview.pjeContext}` : ''}`;
    bodyEl.innerHTML = renderMarkdownSafe(preview.markdown || '');
    updateSkillsPromotionActions();
}

async function loadSkillsPromotionPreview(flowId, target) {
    if (!flowId || !window.brainApi?.getPromotionPreview) {
        renderSkillsPromotionPreview(null);
        return;
    }

    try {
        const preview = await window.brainApi.getPromotionPreview(flowId, target || undefined);
        if (flowId !== skillsState.selectedPromotionFlowId) return;
        renderSkillsPromotionPreview(preview);
    } catch (error) {
        console.error('[Skills] Erro ao carregar preview de promocao:', error);
        renderSkillsPromotionPreview(null);
    }
}

function renderSkillsPromotionState(dashboard) {
    const promotionStateEl = document.getElementById('skills-promotion-state');
    if (!promotionStateEl) return;

    const candidates = Array.isArray(dashboard?.promotionCandidates) ? dashboard.promotionCandidates : [];
    if (!candidates.length) {
        skillsState.selectedPromotionFlowId = '';
        skillsState.selectedPromotionPreview = null;
        skillsState.promotionActionMessage = '';
        skillsState.promotionActionError = '';
        promotionStateEl.innerHTML = '<li>Nenhum flow recorrente forte o suficiente para promover ainda.</li>';
        renderSkillsPromotionPreview(null);
        return;
    }

    const visibleCandidates = candidates.slice(0, 4);
    const activeFlowId = visibleCandidates.some((candidate) => candidate.flowId === skillsState.selectedPromotionFlowId)
        ? skillsState.selectedPromotionFlowId
        : visibleCandidates[0]?.flowId;

    skillsState.selectedPromotionFlowId = activeFlowId || '';

    promotionStateEl.innerHTML = visibleCandidates.map((candidate) => (
        `<li><button type="button" class="skills-promotion-item${candidate.flowId === activeFlowId ? ' active' : ''}" data-flow-id="${escapeSkillsHtml(candidate.flowId)}" data-target="${escapeSkillsHtml(candidate.target)}"><strong>${escapeSkillsHtml(candidate.tribunal || '?')}${candidate.pjeContext ? ` | ${escapeSkillsHtml(candidate.pjeContext)}` : ''}</strong><br>${escapeSkillsHtml(candidate.target)} | ${candidate.instances}x | conf ${candidate.confidence.toFixed(2)}<br><span class="skills-side-note">${escapeSkillsHtml(candidate.rationale || '')}</span></button></li>`
    )).join('');

    promotionStateEl.querySelectorAll('.skills-promotion-item').forEach((node) => {
        node.addEventListener('click', () => {
            const flowId = node.getAttribute('data-flow-id') || '';
            const target = node.getAttribute('data-target') || '';
            skillsState.selectedPromotionFlowId = flowId;
            skillsState.selectedPromotionPreview = null;
            skillsState.promotionActionMessage = '';
            skillsState.promotionActionError = '';
            renderSkillsPromotionState(skillsState.brainDashboard);
            loadSkillsPromotionPreview(flowId, target);
        });
    });

    if (activeFlowId) {
        const activeCandidate = visibleCandidates.find((candidate) => candidate.flowId === activeFlowId);
        loadSkillsPromotionPreview(activeFlowId, activeCandidate?.target || '');
    } else {
        renderSkillsPromotionPreview(null);
    }
}

function renderSkillsPromotionPreview(preview) {
    const titleEl = document.getElementById('skills-preview-title');
    const metaEl = document.getElementById('skills-preview-meta');
    const bodyEl = document.getElementById('skills-preview-body');
    if (!titleEl || !metaEl || !bodyEl) return;

    skillsState.selectedPromotionPreview = preview?.ok ? preview : null;

    if (!preview?.ok) {
        titleEl.textContent = 'Nenhum candidato selecionado';
        metaEl.textContent = 'Escolha um candidato de promocao para revisar a proposta.';
        bodyEl.innerHTML = [
            '<p><strong>O que acontece aqui:</strong> quando a Lex detecta um flow recorrente e confiavel, ela sugere transformar esse aprendizado em conhecimento duravel.</p>',
            '<p><strong>O que o rascunho faz:</strong> ele gera um arquivo Markdown em revisao. Isso ainda nao ativa skill nova e nao publica nada automaticamente.</p>',
            '<p><strong>Importante:</strong> isso vale tanto para trilhas PJe quanto para memoria de casos, processos, documentos e atuacao juridica.</p>',
        ].join('');
        updateSkillsPromotionActions();
        return;
    }

    const targetLabel = getPromotionTargetUiLabel(preview.target);

    titleEl.textContent = preview.label || 'Preview de promocao';
    metaEl.textContent = `${targetLabel} | ${preview.tribunal || '?'}${preview.pjeContext ? ` | ${preview.pjeContext}` : ''}`;
    bodyEl.innerHTML = renderMarkdownSafe(preview.markdown || '');
    updateSkillsPromotionActions();
}

async function loadSkillsPromotionPreview(flowId, target) {
    if (!flowId || !window.brainApi?.getPromotionPreview) {
        renderSkillsPromotionPreview(null);
        return;
    }

    try {
        const preview = await window.brainApi.getPromotionPreview(flowId, target || undefined);
        if (flowId !== skillsState.selectedPromotionFlowId) return;
        renderSkillsPromotionPreview(preview);
    } catch (error) {
        console.error('[Skills] Erro ao carregar preview de promocao:', error);
        renderSkillsPromotionPreview(null);
    }
}

function renderSkillsPromotionState(dashboard) {
    const promotionStateEl = document.getElementById('skills-promotion-state');
    if (!promotionStateEl) return;

    const candidates = Array.isArray(dashboard?.promotionCandidates) ? dashboard.promotionCandidates : [];
    if (!candidates.length) {
        skillsState.selectedPromotionFlowId = '';
        skillsState.selectedPromotionPreview = null;
        promotionStateEl.innerHTML = '<li>Nenhum aprendizado recorrente forte o suficiente para promover ainda.</li>';
        renderSkillsPromotionPreview(null);
        return;
    }

    const visibleCandidates = candidates.slice(0, 4);
    const activeFlowId = visibleCandidates.some((candidate) => candidate.flowId === skillsState.selectedPromotionFlowId)
        ? skillsState.selectedPromotionFlowId
        : visibleCandidates[0]?.flowId;

    skillsState.selectedPromotionFlowId = activeFlowId || '';

    promotionStateEl.innerHTML = visibleCandidates.map((candidate) => {
        const targetLabel = candidate.target === 'skill'
            ? 'skill'
            : candidate.target === 'playbook'
                ? 'playbook'
                : 'nota';
        const meaning = getPromotionTargetUiMeaning(candidate.target);
        return `<li><button type="button" class="skills-promotion-item${candidate.flowId === activeFlowId ? ' active' : ''}" data-flow-id="${escapeSkillsHtml(candidate.flowId)}" data-target="${escapeSkillsHtml(candidate.target)}"><strong>${escapeSkillsHtml(candidate.tribunal || '?')}${candidate.pjeContext ? ` | ${escapeSkillsHtml(candidate.pjeContext)}` : ''}</strong><br>candidato a ${escapeSkillsHtml(targetLabel)} | ${candidate.instances}x | conf ${candidate.confidence.toFixed(2)}<br><span class="skills-side-note">${escapeSkillsHtml(candidate.rationale || '')}</span><br><span class="skills-side-note">${escapeSkillsHtml(meaning)}</span></button></li>`;
    }).join('');

    promotionStateEl.querySelectorAll('.skills-promotion-item').forEach((node) => {
        node.addEventListener('click', () => {
            const flowId = node.getAttribute('data-flow-id') || '';
            const target = node.getAttribute('data-target') || '';
            skillsState.selectedPromotionFlowId = flowId;
            skillsState.selectedPromotionPreview = null;
            skillsState.promotionActionMessage = '';
            skillsState.promotionActionError = '';
            renderSkillsPromotionState(skillsState.brainDashboard);
            loadSkillsPromotionPreview(flowId, target);
        });
    });

    if (activeFlowId) {
        const activeCandidate = visibleCandidates.find((candidate) => candidate.flowId === activeFlowId);
        loadSkillsPromotionPreview(activeFlowId, activeCandidate?.target || '');
    } else {
        renderSkillsPromotionPreview(null);
    }
}

async function renderSkillsBrainState() {
    const brainStateEl = document.getElementById('skills-brain-state');
    if (!brainStateEl || !window.brainApi?.getPreference) return;

    try {
        const replayEnabled = await window.brainApi.getPreference('replay.enabled', true);
        const confirmBeforeExecute = await window.brainApi.getPreference('replay.confirmBeforeExecute', false);
        brainStateEl.innerHTML = [
            `<li><strong>Replay:</strong> ${replayEnabled ? 'ligado' : 'desligado'}</li>`,
            `<li><strong>Confirmacao:</strong> ${confirmBeforeExecute ? 'antes de executar' : 'execucao direta quando houver replay'}</li>`,
            `<li><strong>Papel atual:</strong> execucao situada e aceleracao opcional</li>`,
        ].join('');
    } catch (error) {
        console.error('[Skills] Erro ao carregar estado do Brain:', error);
        brainStateEl.innerHTML = '<li>Nao foi possivel ler o estado do Brain agora.</li>';
    }
}

function setupSkillsFilters() {
    const filterGroup = document.getElementById('skills-filter-group');
    if (!filterGroup || filterGroup.dataset.bound === '1') return;
    filterGroup.dataset.bound = '1';

    filterGroup.addEventListener('click', (event) => {
        const btn = event.target.closest('.skills-filter');
        if (!btn) return;
        skillsState.filter = btn.dataset.filter || 'all';
        filterGroup.querySelectorAll('.skills-filter').forEach((node) => node.classList.remove('active'));
        btn.classList.add('active');
        renderSkillsList();
    });

    const searchInput = document.getElementById('skills-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            skillsState.query = searchInput.value || '';
            renderSkillsList();
        });
    }
}

async function initSkillsView(force = false) {
    setupSkillsCustomizeShell();
    setupSkillsFilters();
    setupSkillsPromotionActions();
    setSkillsStage(skillsState.stage);

    if (skillsState.loaded && !force) {
        renderSkillsRuntime(skillsState.runtime);
        renderSkillsMemoryState(skillsState.runtime);
        renderSkillsUsageState(skillsState.analytics);
        renderSkillsPromotionState(skillsState.brainDashboard);
        renderSkillsBrainState().catch?.(() => {});
        renderSkillsList();
        if (skillsState.stage === 'details') {
            switchSkillsCustomizeTab(skillsState.customizeTab);
        }
        return;
    }

    const listEl = document.getElementById('skills-list');
    const runtimeNoteEl = document.getElementById('skills-runtime-note');
    if (listEl) listEl.innerHTML = '<div class="skills-empty-state">Carregando catalogo de habilidades...</div>';
    renderSkillsBrainState().catch?.(() => {});

    try {
        const [result, runtimeResult, analyticsSummary, brainDashboard] = await Promise.all([
            window.skillsApi?.listCatalog?.(),
            window.skillsApi?.getRuntimeSnapshot?.(),
            window.lexApi?.getAnalyticsSummary?.(),
            window.brainApi?.getDashboard?.({ windowDays: 7, topFlowsLimit: 8 }),
        ]);
        if (!result?.success || !result.catalog) {
            throw new Error(result?.error || 'Catalogo indisponivel.');
        }

        skillsState.catalog = result.catalog;
        skillsState.runtime = runtimeResult?.success ? (runtimeResult.snapshot || null) : null;
        skillsState.analytics = analyticsSummary || null;
        skillsState.brainDashboard = brainDashboard || null;
        skillsState.loaded = true;

        updateSkillsMetrics(result.catalog.summary || {});
        renderSkillsRoots(result.catalog.roots || {});
        if (runtimeNoteEl && !skillsState.runtime) {
            runtimeNoteEl.textContent = result.catalog.runtimeNote || 'Catalogo carregado.';
        }
        renderSkillsRuntime(skillsState.runtime);
        renderSkillsMemoryState(skillsState.runtime);
        renderSkillsUsageState(skillsState.analytics);
        renderSkillsPromotionState(skillsState.brainDashboard);
        renderSkillsList();
        if (skillsState.stage === 'details') {
            switchSkillsCustomizeTab(skillsState.customizeTab);
        }
    } catch (error) {
        console.error('[Skills] Erro ao carregar catalogo:', error);
        if (runtimeNoteEl) {
            runtimeNoteEl.textContent = 'Nao foi possivel carregar o catalogo de skills agora.';
        }
        renderSkillsMemoryState(null);
        renderSkillsUsageState(null);
        renderSkillsPromotionState(null);
        if (listEl) {
            listEl.innerHTML = `<div class="skills-empty-state">${escapeSkillsHtml(error?.message || 'Falha ao carregar skills.')}</div>`;
        }
        if (skillsState.stage === 'details') {
            switchSkillsCustomizeTab(skillsState.customizeTab);
        }
    }
}

function populateModelSelects(providerId, keepCurrent) {
    if (!_providerPresets || !_providerPresets[providerId]) return;
    const preset = _providerPresets[providerId];
    const models = preset.models || [];

    const agentSelect = document.getElementById('ai-agent-model');
    const visionSelect = document.getElementById('ai-vision-model');

    // Separa modelos gratuitos dos pagos (OpenRouter usa ":free" no id)
    const freeModels = models.filter(m => m.id.includes(':free'));
    const paidModels = models.filter(m => !m.id.includes(':free'));
    const hasGroups = freeModels.length > 0 && paidModels.length > 0;

    function buildOptions(modelList) {
        if (!hasGroups) {
            return modelList.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
        }
        let html = '';
        if (freeModels.length > 0) {
            html += '<optgroup label="Gratuitos">';
            html += freeModels.filter(m => modelList.includes(m)).map(m =>
                `<option value="${m.id}">${m.name}</option>`
            ).join('');
            html += '</optgroup>';
        }
        if (paidModels.length > 0) {
            html += '<optgroup label="Pagos">';
            html += paidModels.filter(m => modelList.includes(m)).map(m =>
                `<option value="${m.id}">${m.name}</option>`
            ).join('');
            html += '</optgroup>';
        }
        return html;
    }

    if (agentSelect) {
        // Agente (texto): modelos sem vision primeiro, depois todos como fallback
        const textModels = models.filter(m => !m.vision);
        const agentList = textModels.length > 0 ? textModels : models;
        agentSelect.innerHTML = buildOptions(agentList);
        // Auto-seleciona default se não for manter o atual
        if (!keepCurrent && preset.defaultAgentModel) agentSelect.value = preset.defaultAgentModel;
    }
    if (visionSelect) {
        // Browser (vision): apenas modelos com vision
        const visionModels = models.filter(m => m.vision);
        visionSelect.innerHTML = buildOptions(visionModels.length > 0 ? visionModels : models);
        if (!keepCurrent && preset.defaultVisionModel) visionSelect.value = preset.defaultVisionModel;
    }
}

function updateProviderLink(providerId) {
    providerId = normalizeSettingsProvider(providerId);
    const link = document.getElementById('ai-provider-key-link');
    if (!link) return;
    const url = PROVIDER_KEY_LINKS[providerId] || '#';
    link.href = url;
    link.textContent = url.replace('https://', '');

    // Mostra dica especial para OpenRouter (grátis)
    const defaultHint = document.getElementById('ai-provider-hint');
    const freeHint = document.getElementById('ai-provider-free-hint');
    if (defaultHint && freeHint) {
        if (providerId === 'openrouter') {
            defaultHint.style.display = 'none';
            freeHint.style.display = 'block';
        } else if (providerId === 'ollama') {
            defaultHint.style.display = 'none';
            freeHint.style.display = 'none';
        } else {
            defaultHint.style.display = 'block';
            freeHint.style.display = 'none';
        }
    }

    // Esconde campo de API key para Ollama (não precisa de chave)
    const apiKeyField = document.getElementById('ai-api-key')?.closest('.settings-field');
    if (apiKeyField) apiKeyField.style.display = providerId === 'ollama' ? 'none' : '';

    // Mostra/esconde seção Ollama
    const ollamaSection = document.getElementById('ollama-section');
    if (ollamaSection) ollamaSection.style.display = providerId === 'ollama' ? '' : 'none';
    if (providerId === 'ollama') refreshOllamaStatus();
    syncProviderChoiceUI(providerId);
}

function updateApiKeyPlaceholder(providerId) {
    const input = document.getElementById('ai-api-key');
    if (!input) return;
    providerId = normalizeSettingsProvider(providerId);
    if (providerId === 'anthropic') {
        input.placeholder = 'Cole sua chave Claude aqui';
        return;
    }
    if (providerId === 'openai') {
        input.placeholder = 'Cole sua chave OpenAI aqui';
        return;
    }
    if (providerId === 'openrouter') {
        input.placeholder = 'Chave gratuita — crie em openrouter.ai/keys';
    } else {
        input.placeholder = 'Cole sua chave aqui';
    }
}

function updateKeyStatusBadge(status) {
    const el = document.getElementById('ai-key-status');
    if (!el) return;
    if (status?.configured) {
        el.textContent = '✓ ' + (status.preview || 'Configurada');
        el.style.color = 'var(--success-color)';
    } else {
        el.textContent = 'Nao configurada';
        el.style.color = 'var(--danger-color)';
    }
}

function showProviderSaveFeedback(message, tone = 'success') {
    const feedback = document.getElementById('provider-save-feedback');
    if (!feedback) return;
    feedback.textContent = message;
    feedback.style.color = tone === 'error' ? 'var(--danger-color)' : (tone === 'warn' ? 'var(--warning-color)' : 'var(--success-color)');
    feedback.classList.remove('hidden');
    if (tone === 'success') {
        setTimeout(() => feedback.classList.add('hidden'), 3000);
    }
}

function renderHermesProviderState(snapshot) {
    const badge = document.getElementById('hermes-provider-badge');
    const caption = document.getElementById('hermes-provider-caption');
    const providerValue = document.getElementById('hermes-provider-value');
    const modelValue = document.getElementById('hermes-model-value');
    const visionValue = document.getElementById('hermes-vision-value');
    const meta = document.getElementById('hermes-provider-meta');
    if (!badge || !caption || !providerValue || !modelValue || !visionValue || !meta) return;

    badge.className = 'settings-engine-badge';

    if (!snapshot?.available) {
        badge.classList.add('is-error');
        badge.textContent = 'Hermes indisponivel';
        caption.textContent = snapshot?.error || 'Nao foi possivel ler a configuracao do Console Lex.';
        providerValue.textContent = '-';
        modelValue.textContent = '-';
        visionValue.textContent = '-';
        meta.textContent = snapshot?.source ? `Runtime: ${snapshot.source}` : '';
        return;
    }

    const selectedProvider = document.getElementById('ai-provider')?.value || '';
    const selectedAgent = document.getElementById('ai-agent-model')?.value || '';
    const selectedVision = document.getElementById('ai-vision-model')?.value || '';
    const isSynced =
        snapshot.desktopProviderId === selectedProvider &&
        (!snapshot.agentModel || snapshot.agentModel === selectedAgent) &&
        (!snapshot.visionModel || snapshot.visionModel === selectedVision);

    badge.classList.add(isSynced ? 'is-ok' : 'is-warn');
    badge.textContent = isSynced ? 'Sincronizado com Hermes' : 'Hermes com estado diferente';
    caption.textContent = isSynced
        ? 'O Console Lex esta alinhado com a configuracao visual.'
        : 'Ha alteracoes na tela que ainda nao foram aplicadas ao Console Lex.';
    providerValue.textContent = snapshot.hermesProviderId || '-';
    modelValue.textContent = snapshot.agentModel || '-';
    visionValue.textContent = snapshot.visionModel || '-';

    const metaParts = [];
    if (snapshot.source) metaParts.push(`Runtime: ${snapshot.source}`);
    if (snapshot.configPath) metaParts.push(`Config: ${snapshot.configPath}`);
    if (snapshot.envPath) metaParts.push(`Secrets: ${snapshot.envPath}`);
    meta.textContent = metaParts.join('  |  ');
}

async function refreshHermesProviderState() {
    if (!window.lexApi.getLexEngineProviderState) return null;
    try {
        const snapshot = await window.lexApi.getLexEngineProviderState();
        _hermesProviderSnapshot = snapshot;
        renderHermesProviderState(snapshot);
        return snapshot;
    } catch (e) {
        const snapshot = { available: false, error: e?.message || 'Falha ao consultar Hermes.' };
        _hermesProviderSnapshot = snapshot;
        renderHermesProviderState(snapshot);
        return snapshot;
    }
}

function applyHermesProviderSnapshotToSettings(snapshot) {
    if (!snapshot?.available || !snapshot?.desktopProviderId) return;

    const providerId = normalizeSettingsProvider(snapshot.desktopProviderId);
    const providerSelect = document.getElementById('ai-provider');
    if (providerSelect) {
        providerSelect.value = providerId;
    }

    populateModelSelects(providerId, true);

    const agentSelect = document.getElementById('ai-agent-model');
    const visionSelect = document.getElementById('ai-vision-model');
    if (agentSelect && snapshot.agentModel) {
        agentSelect.value = snapshot.agentModel;
    }
    if (visionSelect && snapshot.visionModel) {
        visionSelect.value = snapshot.visionModel;
    }

    updateProviderLink(providerId);
    updateApiKeyPlaceholder(providerId);
    syncProviderChoiceUI(providerId);
}

async function restartConsoleAfterProviderChange() {
    if (typeof window.lexTerminalRestartEngine !== 'function') return;
    try {
        await window.lexTerminalRestartEngine('Provider atualizado. Console Lex reiniciado para carregar a chave nova.');
    } catch (e) {
        console.warn('[Settings] Nao foi possivel reiniciar Console Lex apos provider change:', e);
    }
}

async function saveProviderSettings() {
    const providerId = normalizeSettingsProvider(document.getElementById('ai-provider')?.value);
    const apiKey = document.getElementById('ai-api-key')?.value?.trim();
    const agentModel = document.getElementById('ai-agent-model')?.value;
    const visionModel = document.getElementById('ai-vision-model')?.value;

    if (!providerId) return false;

    try {
        if (providerId !== 'ollama' && !apiKey) {
            const existingStatus = await window.lexApi.getApiKeyStatus(providerId);
            if (!existingStatus?.configured) {
                updateKeyStatusBadge(existingStatus);
                showProviderSaveFeedback('Cole e teste uma chave antes de aplicar.', 'error');
                return false;
            }
        }
        if (apiKey) {
            await window.lexApi.setApiKey(providerId, apiKey);
            document.getElementById('ai-api-key').value = '';
        }
        if (agentModel && visionModel) {
            await window.lexApi.setProvider({ providerId, agentModel, visionModel });
        }
        const status = await window.lexApi.getApiKeyStatus(providerId);
        updateKeyStatusBadge(status);
        const snapshot = await refreshHermesProviderState();
        applyHermesProviderSnapshotToSettings(snapshot);
        await restartConsoleAfterProviderChange();
        showProviderSaveFeedback('Configuracao aplicada ao Console Lex.');
        return true;
    } catch (e) {
        console.error('[Settings] Erro ao salvar provider:', e);
        showProviderSaveFeedback('Nao foi possivel aplicar a configuracao no Hermes.', 'error');
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Preferences (perfil)
// ─────────────────────────────────────────────────────────────────────────────

async function loadPreferences() {
    try {
        const prefs = await window.lexApi.getPreferences();
        if (!prefs) return;

        const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
        set('pref-display-name', prefs.displayName);
        set('pref-full-name', prefs.fullName);
        set('pref-role', prefs.role);
        set('pref-oab', prefs.oab);
        set('pref-tribunal', prefs.tribunal);
    } catch (_) {}
}

async function saveSettings() {
    const get = id => document.getElementById(id)?.value?.trim() || '';
    const prefs = {
        displayName: get('pref-display-name'),
        fullName: get('pref-full-name'),
        role: get('pref-role'),
        oab: get('pref-oab'),
        tribunal: get('pref-tribunal'),
    };

    // Salva provider junto
    await saveProviderSettings();

    try {
        await window.lexApi.savePreferences(prefs);
        const feedback = document.getElementById('settings-save-feedback');
        if (feedback) {
            feedback.classList.remove('hidden');
            setTimeout(() => feedback.classList.add('hidden'), 2500);
        }
    } catch (_) {}
}

// ── Ollama (Modelo Local) ────────────────────────────────────────────────────

let _ollamaPulling = false;

async function refreshOllamaStatus() {
    if (!window.lexApi?.ollamaStatus) return;
    const dot = document.getElementById('ollama-status-dot');
    const text = document.getElementById('ollama-status-text');
    const notFound = document.getElementById('ollama-not-found');
    const modelsArea = document.getElementById('ollama-models-area');

    try {
        const status = await window.lexApi.ollamaStatus();
        console.log('[Ollama] Status:', status);
        if (status?.running) {
            if (dot) dot.style.background = 'var(--success-color)';
            if (text) text.textContent = `Ollama rodando${status.version ? ' (v' + status.version + ')' : ''} — ${status.models.length} modelo(s) instalado(s)`;
            if (notFound) notFound.style.display = 'none';
            if (modelsArea) modelsArea.style.display = '';
            await renderOllamaModels();
        } else {
            if (dot) dot.style.background = 'var(--danger-color)';
            if (text) text.textContent = 'Ollama nao detectado';
            if (notFound) notFound.style.display = '';
            if (modelsArea) modelsArea.style.display = 'none';
        }
    } catch (e) {
        console.error('[Ollama] Erro ao verificar:', e);
        if (dot) dot.style.background = 'var(--danger-color)';
        if (text) text.textContent = 'Ollama nao detectado — verifique se esta instalado e rodando';
        if (notFound) notFound.style.display = '';
        if (modelsArea) modelsArea.style.display = 'none';
    }
}

async function renderOllamaModels() {
    const list = document.getElementById('ollama-models-list');
    if (!list || !window.lexApi?.ollamaRecommended) return;

    try {
        const models = await window.lexApi.ollamaRecommended();
        list.innerHTML = models.map(m => `
            <div class="ollama-model-card" data-model="${m.id}" style="
                background:var(--bg-secondary);border:1px solid ${m.installed ? 'var(--success-color)' : 'var(--border-color)'};border-radius:10px;
                padding:10px 14px;display:flex;align-items:center;gap:12px;
            ">
                <div style="flex:1;min-width:0">
                    <div style="font-size:13px;font-weight:600;color:${m.installed ? 'var(--success-color)' : 'var(--text-primary)'}">${m.name}${m.vision ? ' <span style="font-size:10px;background:var(--accent-strong);color:var(--text-primary);padding:1px 6px;border-radius:4px;margin-left:4px">vision</span>' : ''}</div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${m.description}</div>
                    <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${m.size} · RAM minima: ${m.minRam}</div>
                </div>
                <div style="flex-shrink:0">
                    ${m.installed
                        ? `<button class="ollama-btn-remove" data-model="${m.id}" style="
                            background:none;border:1px solid var(--border-strong);border-radius:6px;color:var(--danger-color);
                            font-size:11px;padding:4px 10px;cursor:pointer">Remover</button>`
                        : `<button class="ollama-btn-install" data-model="${m.id}" style="
                            background:var(--accent-strong);border:1px solid var(--accent-color);border-radius:6px;color:var(--text-primary);
                            font-size:11px;padding:4px 10px;cursor:pointer">Baixar</button>`
                    }
                </div>
            </div>
        `).join('');

        // Bind install buttons
        list.querySelectorAll('.ollama-btn-install').forEach(btn => {
            btn.addEventListener('click', () => ollamaPullModel(btn.dataset.model));
        });

        // Bind remove buttons
        list.querySelectorAll('.ollama-btn-remove').forEach(btn => {
            btn.addEventListener('click', () => ollamaRemoveModel(btn.dataset.model));
        });
    } catch (e) {
        list.innerHTML = '<div style="font-size:12px;color:var(--danger-color)">Erro ao carregar modelos</div>';
    }
}

async function ollamaPullModel(modelId) {
    if (_ollamaPulling) return;
    _ollamaPulling = true;

    const pullBar = document.getElementById('ollama-pull-bar');
    const pullLabel = document.getElementById('ollama-pull-label');
    const pullPercent = document.getElementById('ollama-pull-percent');
    const pullFill = document.getElementById('ollama-pull-fill');
    const pullStatus = document.getElementById('ollama-pull-status');

    if (pullBar) pullBar.style.display = '';
    if (pullLabel) pullLabel.textContent = `Baixando ${modelId}...`;
    if (pullPercent) pullPercent.textContent = '0%';
    if (pullFill) pullFill.style.width = '0%';
    if (pullStatus) pullStatus.textContent = 'Iniciando download...';

    // Disable install buttons during download
    document.querySelectorAll('.ollama-btn-install').forEach(b => b.disabled = true);

    // Listen for progress
    if (window.lexApi.onOllamaPullProgress) {
        window.lexApi.onOllamaPullProgress((data) => {
            const pct = data.percent || 0;
            if (pullPercent) pullPercent.textContent = pct + '%';
            if (pullFill) pullFill.style.width = pct + '%';
            if (pullStatus) pullStatus.textContent = data.status || '';
        });
    }

    if (window.lexApi.onOllamaPullComplete) {
        window.lexApi.onOllamaPullComplete(() => {
            if (pullLabel) pullLabel.textContent = 'Download concluido!';
            if (pullPercent) pullPercent.textContent = '100%';
            if (pullFill) pullFill.style.width = '100%';
            if (pullStatus) pullStatus.textContent = '';
            _ollamaPulling = false;
            cleanupPullListeners();
            setTimeout(() => {
                if (pullBar) pullBar.style.display = 'none';
                refreshOllamaStatus();
            }, 2000);
        });
    }

    if (window.lexApi.onOllamaPullError) {
        window.lexApi.onOllamaPullError((data) => {
            if (pullLabel) pullLabel.textContent = 'Erro no download';
            if (pullStatus) pullStatus.textContent = data.error || 'Erro desconhecido';
            if (pullPercent) pullPercent.textContent = '';
            _ollamaPulling = false;
            cleanupPullListeners();
            document.querySelectorAll('.ollama-btn-install').forEach(b => b.disabled = false);
        });
    }

    try {
        await window.lexApi.ollamaPull(modelId);
    } catch (e) {
        if (pullLabel) pullLabel.textContent = 'Erro';
        if (pullStatus) pullStatus.textContent = e.message || 'Falha ao iniciar download';
        _ollamaPulling = false;
        cleanupPullListeners();
    }
}

function cleanupPullListeners() {
    if (window.lexApi?.offOllamaPullEvents) window.lexApi.offOllamaPullEvents();
    document.querySelectorAll('.ollama-btn-install').forEach(b => b.disabled = false);
}

async function ollamaRemoveModel(modelId) {
    if (!window.lexApi?.ollamaDelete) return;
    if (!confirm(`Remover o modelo "${modelId}"? O download precisara ser refeito.`)) return;
    try {
        await window.lexApi.ollamaDelete(modelId);
        await refreshOllamaStatus();
    } catch (e) {
        console.error('[Ollama] Erro ao remover modelo:', e);
    }
}

let _ollamaPollingInterval = null;

function initOllamaSettings() {
    // Initial check — show section if provider is already ollama
    const providerSelect = document.getElementById('ai-provider');
    if (providerSelect?.value === 'ollama') {
        const ollamaSection = document.getElementById('ollama-section');
        if (ollamaSection) ollamaSection.style.display = '';
        const apiKeyField = document.getElementById('ai-api-key')?.closest('.settings-field');
        if (apiKeyField) apiKeyField.style.display = 'none';
        refreshOllamaStatus();
    }

    // Botão instalar Ollama
    const btnInstall = document.getElementById('btn-ollama-install');
    if (btnInstall) {
        btnInstall.addEventListener('click', () => startOllamaInstall());
    }
}

async function startOllamaInstall() {
    if (!window.lexApi?.ollamaDownloadInstaller) return;

    const btn = document.getElementById('btn-ollama-install');
    const bar = document.getElementById('ollama-install-bar');
    const label = document.getElementById('ollama-install-label');
    const percent = document.getElementById('ollama-install-percent');
    const fill = document.getElementById('ollama-install-fill');
    const status = document.getElementById('ollama-install-status');

    if (btn) { btn.disabled = true; btn.textContent = 'Baixando...'; }
    if (bar) bar.style.display = '';

    // Listener de progresso
    if (window.lexApi.onOllamaInstallProgress) {
        window.lexApi.onOllamaInstallProgress((data) => {
            if (data.status === 'downloading') {
                if (label) label.textContent = 'Baixando installer...';
                if (percent) percent.textContent = (data.percent || 0) + '%';
                if (fill) fill.style.width = (data.percent || 0) + '%';
            } else if (data.status === 'opening') {
                if (label) label.textContent = 'Abrindo installer...';
                if (percent) percent.textContent = '100%';
                if (fill) fill.style.width = '100%';
                if (status) status.textContent = 'Conclua a instalacao na janela que abriu. A LEX vai detectar automaticamente.';
            } else if (data.status === 'error') {
                if (label) label.textContent = 'Erro no download';
                if (status) status.textContent = data.error || 'Tente novamente';
                if (btn) { btn.disabled = false; btn.textContent = 'Tentar novamente'; }
            }
        });
    }

    try {
        const result = await window.lexApi.ollamaDownloadInstaller();
        if (window.lexApi.offOllamaInstallProgress) window.lexApi.offOllamaInstallProgress();

        if (result?.success) {
            if (btn) btn.textContent = 'Aguardando instalacao...';
            if (status) status.textContent = 'Conclua a instalacao. A LEX detecta automaticamente quando o Ollama iniciar.';
            // Inicia polling para detectar quando Ollama começa a rodar
            startOllamaDetectionPolling();
        } else {
            if (btn) { btn.disabled = false; btn.textContent = 'Tentar novamente'; }
            if (status) status.textContent = result?.error || 'Erro ao baixar installer';
        }
    } catch (e) {
        if (window.lexApi.offOllamaInstallProgress) window.lexApi.offOllamaInstallProgress();
        if (btn) { btn.disabled = false; btn.textContent = 'Tentar novamente'; }
        if (status) status.textContent = e.message || 'Erro inesperado';
    }
}

function startOllamaDetectionPolling() {
    if (_ollamaPollingInterval) clearInterval(_ollamaPollingInterval);

    _ollamaPollingInterval = setInterval(async () => {
        if (!window.lexApi?.ollamaIsRunning) return;
        try {
            const running = await window.lexApi.ollamaIsRunning();
            if (running) {
                clearInterval(_ollamaPollingInterval);
                _ollamaPollingInterval = null;
                // Ollama detectado! Atualiza a UI
                await refreshOllamaStatus();
            }
        } catch { /* ignora, tenta de novo */ }
    }, 3000); // checa a cada 3s

    // Para de tentar após 5 minutos
    setTimeout(() => {
        if (_ollamaPollingInterval) {
            clearInterval(_ollamaPollingInterval);
            _ollamaPollingInterval = null;
        }
    }, 5 * 60 * 1000);
}

// ── Telegram 24/7 ───────────────────────────────────────────────────────────

async function initTelegramSettings() {
    const tokenInput = document.getElementById('telegram-token');
    const userIdInput = document.getElementById('telegram-userid');
    const btnSave = document.getElementById('btn-telegram-save');
    const btnToggle = document.getElementById('btn-telegram-toggle');
    const statusEl = document.getElementById('telegram-status');
    if (!tokenInput || !userIdInput || !btnSave || !btnToggle || !statusEl) return;

    function setStatus(msg, color = '#888') {
        statusEl.textContent = msg;
        statusEl.style.color = color;
    }

    async function refreshUI() {
        try {
            const cfg = await window.lexApi.telegramGetConfig();
            if (cfg.hasToken) tokenInput.placeholder = cfg.tokenPreview || '(token salvo)';
            if (cfg.userId) userIdInput.value = cfg.userId;

            if (cfg.running) {
                btnToggle.textContent = 'Desativar 24/7';
                btnToggle.style.background = '#dc2626';
                setStatus('Bot ativo — aguardando mensagens no Telegram', 'var(--success-color)');
            } else {
                btnToggle.textContent = 'Ativar 24/7';
                btnToggle.style.background = '';
                setStatus(cfg.hasToken ? 'Bot configurado. Clique em "Ativar 24/7" para ligar.' : 'Configure o token e seu ID para ativar.');
            }
        } catch (e) {
            setStatus('Erro ao carregar config: ' + e.message, 'var(--danger-color)');
        }
    }

    btnSave.addEventListener('click', async () => {
        const token = tokenInput.value.trim();
        const userId = parseInt(userIdInput.value.trim(), 10);
        if (!token && !userId) { setStatus('Preencha pelo menos um campo.', 'var(--danger-color)'); return; }
        btnSave.disabled = true;
        try {
            await window.lexApi.telegramSetConfig({ token: token || '', userId: userId || 0 });
            setStatus('Config salva!', 'var(--success-color)');
            tokenInput.value = '';
            await refreshUI();
        } catch (e) {
            setStatus('Erro: ' + e.message, 'var(--danger-color)');
        } finally {
            btnSave.disabled = false;
        }
    });

    btnToggle.addEventListener('click', async () => {
        btnToggle.disabled = true;
        try {
            const status = await window.lexApi.telegramGetStatus();
            if (status.running) {
                setStatus('Desativando...', 'var(--text-secondary)');
                const r = await window.lexApi.telegramDisable();
                if (r.error) { setStatus('Erro: ' + r.error, 'var(--danger-color)'); return; }
                setStatus('Bot desativado.', 'var(--text-secondary)');
            } else {
                setStatus('Ativando...', 'var(--text-secondary)');
                const r = await window.lexApi.telegramEnable();
                if (r.error) { setStatus('Erro: ' + r.error, 'var(--danger-color)'); return; }
                setStatus('Bot ativo! Mande /start para o bot no Telegram.', 'var(--success-color)');
            }
            await refreshUI();
        } catch (e) {
            setStatus('Erro: ' + e.message, 'var(--danger-color)');
        } finally {
            btnToggle.disabled = false;
        }
    });

    await refreshUI();
}

// ─────────────────────────────────────────────────────────────────────────────
// RAG — Indexação de documentos do workspace
// ─────────────────────────────────────────────────────────────────────────────

async function loadRagStats() {
    const statsEl = document.getElementById('rag-stats');
    if (!statsEl || !window.lexApi?.ragStats) return;
    try {
        const stats = await window.lexApi.ragStats();
        if (stats.chunks > 0) {
            statsEl.textContent = `Indice atual: ${stats.chunks} trechos de ${stats.arquivos} arquivo(s)`;
            statsEl.style.color = 'var(--success-color)';
        } else {
            statsEl.textContent = 'Nenhum documento indexado ainda.';
            statsEl.style.color = 'var(--text-secondary)';
        }
    } catch {
        statsEl.textContent = '';
    }
}

function initRagSettings() {
    loadRagStats();

    const btn = document.getElementById('btn-rag-index');
    const feedback = document.getElementById('rag-feedback');
    if (!btn) return;

    btn.addEventListener('click', async () => {
        if (!window.lexApi?.ragIndexWorkspace) return;
        btn.disabled = true;
        btn.textContent = 'Indexando...';
        if (feedback) { feedback.textContent = 'Lendo e indexando documentos...'; feedback.style.color = 'var(--text-secondary)'; }

        try {
            const res = await window.lexApi.ragIndexWorkspace();
            if (res.success) {
                if (feedback) {
                    feedback.textContent = `Concluido: ${res.chunks} trechos de ${res.arquivos} arquivo(s) indexados.`;
                    feedback.style.color = 'var(--success-color)';
                }
                loadRagStats();
            } else {
                if (feedback) { feedback.textContent = res.error || 'Erro ao indexar.'; feedback.style.color = 'var(--danger-color)'; }
            }
        } catch (e) {
            if (feedback) { feedback.textContent = 'Erro: ' + (e.message || 'falha desconhecida'); feedback.style.color = 'var(--danger-color)'; }
        } finally {
            btn.disabled = false;
            btn.textContent = 'Indexar documentos do workspace';
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Legislacao Brasileira — download e indexacao RAG
// ─────────────────────────────────────────────────────────────────────────────

async function loadLegislacaoStats() {
    const statsEl = document.getElementById('leg-stats');
    if (!statsEl || !window.lexApi?.ragLegislacaoStats) return;
    try {
        const stats = await window.lexApi.ragLegislacaoStats();
        if (stats.baixados > 0) {
            statsEl.textContent = `${stats.baixados}/${stats.total} codigos indexados localmente`;
            statsEl.style.color = 'var(--success-color)';
        } else {
            statsEl.textContent = 'Nenhum codigo baixado ainda.';
            statsEl.style.color = '#888';
        }
    } catch {
        statsEl.textContent = '';
    }
}

function initLegislacaoSettings() {
    loadLegislacaoStats();

    const btnDownload   = document.getElementById('btn-leg-download');
    const btnForcar     = document.getElementById('btn-leg-redownload');
    const progressEl    = document.getElementById('leg-progress');

    function startDownload(forcar) {
        if (!window.lexApi?.ragDownloadLegislacao) return;

        [btnDownload, btnForcar].forEach(b => b && (b.disabled = true));
        if (btnDownload) btnDownload.textContent = 'Baixando...';
        if (progressEl) progressEl.textContent = '';

        // Escuta progresso linha a linha
        window.lexApi.onRagLegislacaoProgress((msg) => {
            if (!progressEl) return;
            progressEl.textContent += msg + '\n';
            progressEl.scrollTop = progressEl.scrollHeight;
        });

        window.lexApi.ragDownloadLegislacao(forcar)
            .then((res) => {
                window.lexApi.offRagLegislacaoProgress();
                if (progressEl) {
                    const extra = `\nIndexados: ${res.indexResult?.chunks ?? 0} trechos de ${res.indexResult?.arquivos ?? 0} arquivo(s).`;
                    progressEl.textContent += extra;
                    progressEl.scrollTop = progressEl.scrollHeight;
                }
                loadLegislacaoStats();
                loadRagStats();
            })
            .catch((e) => {
                window.lexApi.offRagLegislacaoProgress();
                if (progressEl) { progressEl.textContent += '\nErro: ' + (e.message || 'falha'); }
            })
            .finally(() => {
                [btnDownload, btnForcar].forEach(b => b && (b.disabled = false));
                if (btnDownload) btnDownload.textContent = 'Baixar / Atualizar Legislacao';
            });
    }

    btnDownload?.addEventListener('click', () => startDownload(false));
    btnForcar?.addEventListener('click',   () => startDownload(true));
}

document.addEventListener('DOMContentLoaded', () => {
    loadPreferences();
    loadProviderSettings();

    // Settings tab navigation
    document.querySelectorAll('.settings-nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const tab = item.dataset.tab;
            document.querySelectorAll('.settings-nav-item').forEach(i => i.classList.remove('active'));
            document.querySelectorAll('.settings-tab-panel').forEach(p => p.classList.remove('active'));
            item.classList.add('active');
            const panel = document.getElementById('tab-' + tab);
            if (panel) panel.classList.add('active');
        });
    });

    // Settings save button
    const btnSaveSettings = document.getElementById('btn-save-settings');
    if (btnSaveSettings) btnSaveSettings.addEventListener('click', saveSettings);
    const btnSaveProvider = document.getElementById('btn-save-provider');
    if (btnSaveProvider) btnSaveProvider.addEventListener('click', saveProviderSettings);
    const btnRefreshHermesProvider = document.getElementById('btn-refresh-hermes-provider');
    if (btnRefreshHermesProvider) btnRefreshHermesProvider.addEventListener('click', refreshHermesProviderState);

    // Provider selector — re-popula modelos e atualiza link
    const providerSelect = document.getElementById('ai-provider');
    if (providerSelect) {
        providerSelect.addEventListener('change', () => {
            const pid = normalizeSettingsProvider(providerSelect.value);
            providerSelect.value = pid;
            populateModelSelects(pid);
            updateProviderLink(pid);
            updateApiKeyPlaceholder(pid);
            window.lexApi.getApiKeyStatus(pid).then(updateKeyStatusBadge).catch(() => {});
            renderHermesProviderState(_hermesProviderSnapshot);
        });
    }

    document.querySelectorAll('.provider-choice').forEach((btn) => {
        btn.addEventListener('click', () => {
            const pid = normalizeSettingsProvider(btn.dataset.provider);
            if (providerSelect) {
                providerSelect.value = pid;
                providerSelect.dispatchEvent(new Event('change'));
            }
        });
    });

    document.getElementById('ai-agent-model')?.addEventListener('change', () => renderHermesProviderState(_hermesProviderSnapshot));
    document.getElementById('ai-vision-model')?.addEventListener('change', () => renderHermesProviderState(_hermesProviderSnapshot));

    // Botão testar chave
    const btnTest = document.getElementById('btn-test-api');
    if (btnTest) {
        btnTest.addEventListener('click', async () => {
            const providerId = normalizeSettingsProvider(document.getElementById('ai-provider')?.value);
            const apiKey = document.getElementById('ai-api-key')?.value?.trim();
            const statusEl = document.getElementById('ai-key-status');
            if (!providerId) return;

            if (statusEl) { statusEl.textContent = 'Testando...'; statusEl.style.color = 'var(--text-secondary)'; }
            btnTest.disabled = true;
            const check = await window.lexApi.testApiKey(providerId, apiKey || '').catch(e => ({ success: false, error: e?.message || 'Falha no teste' }));
            if (!check?.success) {
                if (statusEl) { statusEl.textContent = 'Erro: ' + (check?.error || 'Chave recusada'); statusEl.style.color = 'var(--danger-color)'; }
                btnTest.disabled = false;
                return;
            }
            if (apiKey) await window.lexApi.setApiKey(providerId, apiKey);
            await window.lexApi.setProvider({
                providerId,
                agentModel: document.getElementById('ai-agent-model')?.value || '',
                visionModel: document.getElementById('ai-vision-model')?.value || '',
            });
            if (apiKey) document.getElementById('ai-api-key').value = '';
            await refreshHermesProviderState();
            await restartConsoleAfterProviderChange();
            if (statusEl) { statusEl.textContent = 'Funcionando, salvo e console reiniciado'; statusEl.style.color = 'var(--success-color)'; }
            btnTest.disabled = false;
            return;
        });
    }

    // Privacy onboarding (first-run dialog)
    initPrivacyOnboarding();

    // Privacy settings
    initPrivacySettings();

    // Analytics dashboard
    loadAnalyticsDashboard();
    const btnRefreshStats = document.getElementById('btn-refresh-stats');
    if (btnRefreshStats) btnRefreshStats.addEventListener('click', loadAnalyticsDashboard);

    // Ollama (Modelo Local)
    initOllamaSettings();

    // Telegram 24/7
    initTelegramSettings();

    // RAG — Indexação de documentos
    initRagSettings();

    // Legislacao Brasileira — download e indexacao
    initLegislacaoSettings();

    // Settings tab navigation
    initSettingsTabs();

});
// ============================================================================
// PLUGINS / INTEGRACOES UI
// ============================================================================

async function loadProfileCard() {
    if (!window.authApi?.getProfile) return;
    try {
        var profile = await window.authApi.getProfile();
        if (!profile) return;

        // Settings profile card
        var nameEl = document.getElementById('profile-name');
        var emailEl = document.getElementById('profile-email');
        var planEl = document.getElementById('profile-plan');
        var avatarEl = document.getElementById('profile-avatar');
        var placeholderEl = document.getElementById('profile-avatar-placeholder');
        var logoutBtn = document.getElementById('profile-logout-btn');

        if (nameEl) nameEl.textContent = profile.name || '';
        if (emailEl) emailEl.textContent = profile.email || '';
        if (planEl) {
            var labels = { pro: 'Pro', trial: 'Trial' };
            planEl.textContent = labels[profile.plan] || profile.plan;
        }

        // Sidebar avatar
        var sidebarAvatar = document.getElementById('sidebar-avatar');
        var sidebarPlaceholder = document.getElementById('sidebar-avatar-placeholder');
        var settingsIcon = document.getElementById('sidebar-settings-icon');

        if (profile.avatar) {
            // Tem foto — mostra nos dois lugares
            if (avatarEl) { avatarEl.src = profile.avatar; avatarEl.style.display = 'block'; }
            if (placeholderEl) placeholderEl.style.display = 'none';
            if (sidebarAvatar) { sidebarAvatar.src = profile.avatar; sidebarAvatar.style.display = 'block'; }
            if (sidebarPlaceholder) sidebarPlaceholder.style.display = 'none';
            if (settingsIcon) settingsIcon.style.display = 'none';
        } else {
            // Sem foto — mostra inicial
            var initial = (profile.name || 'U').charAt(0).toUpperCase();
            if (placeholderEl) { placeholderEl.textContent = initial; placeholderEl.style.display = 'flex'; }
            if (avatarEl) avatarEl.style.display = 'none';
            if (sidebarPlaceholder) { sidebarPlaceholder.textContent = initial; sidebarPlaceholder.style.display = 'flex'; }
            if (sidebarAvatar) sidebarAvatar.style.display = 'none';
            if (settingsIcon) settingsIcon.style.display = 'none';
        }

        if (logoutBtn) {
            logoutBtn.onclick = async function() {
                if (!confirm('Sair da conta?')) return;
                await window.authApi.signOut();
                location.reload();
            };
        }
    } catch (err) {
        console.error('[Profile] Erro:', err);
    }
}

function initSettingsTabs() {
    const navItems = document.querySelectorAll('.settings-nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const tab = item.getAttribute('data-tab');
            // Update nav active state
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            // Show correct panel
            document.querySelectorAll('.settings-tab-panel').forEach(p => p.classList.remove('active'));
            const panel = document.getElementById('tab-' + tab);
            if (panel) panel.classList.add('active');
            // Refresh data when switching to specific tabs
            if (tab === 'uso') loadAnalyticsDashboard();
            if (tab === 'perfil') loadProfileCard();
        });
    });
}


