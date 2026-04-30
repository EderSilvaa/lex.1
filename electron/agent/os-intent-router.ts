import type { AgentStep, ThinkDecision } from './types';

export type OsIntentHint = Pick<ThinkDecision, 'tipo' | 'skill' | 'parametros' | 'pergunta' | 'opcoes'> & {
    motivo: string;
};

type HintContext = {
    chatHistory?: string;
    passos?: AgentStep[];
};

function norm(text: string): string {
    return String(text || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function hasAny(text: string, patterns: RegExp[]): boolean {
    return patterns.some(p => p.test(text));
}

function pathFromText(text: string): string | undefined {
    if (/\bdownloads?\b|\barea de downloads?\b/.test(text)) return 'downloads';
    if (/\bdesktop\b|\barea de trabalho\b/.test(text)) return 'desktop';
    if (/\bdocumentos?\b|\bdocuments?\b/.test(text)) return 'documentos';
    if (/\bimagens?\b|\bpictures?\b/.test(text)) return 'imagens';
    if (/\bvideos?\b/.test(text)) return 'videos';
    if (/\bmusicas?\b|\bmusic\b/.test(text)) return 'musica';
    if (/[a-z]:\\/.test(text)) return undefined;
    return undefined;
}

function pathFromWindowsPath(text: string): string | undefined {
    const match = text.match(/[a-z]:\\[^\s"'`<>]+/i);
    return match?.[0];
}

function pathFromSteps(passos: AgentStep[] | undefined): string | undefined {
    if (!passos?.length) return undefined;

    for (const passo of [...passos].reverse()) {
        const paramsPath = passo.parametros?.['caminho'] || passo.parametros?.['origem'];
        if (typeof paramsPath === 'string' && paramsPath.trim()) return paramsPath.trim();

        const dados = passo.resultado?.dados;
        const dataPath = dados?.caminho || dados?.baseDir;
        if (typeof dataPath === 'string' && dataPath.trim()) {
            const normalized = norm(dataPath);
            return pathFromText(normalized) || dataPath;
        }
    }

    return undefined;
}

function inferCaminho(objetivoNorm: string, ctx?: HintContext): string {
    return pathFromText(objetivoNorm)
        || pathFromWindowsPath(objetivoNorm)
        || pathFromSteps(ctx?.passos)
        || pathFromText(norm(ctx?.chatHistory || ''))
        || pathFromWindowsPath(ctx?.chatHistory || '')
        || '~';
}

function isPcContext(text: string, ctx?: HintContext): boolean {
    const context = `${text}\n${norm(ctx?.chatHistory || '')}`;
    return hasAny(context, [
        /\bdownloads?\b/,
        /\bdesktop\b/,
        /\barea de trabalho\b/,
        /\bdocumentos?\b/,
        /\barquivos?\b/,
        /\bpastas?\b/,
        /\bpdfs?\b|\bdocx?\b|\bxlsx?\b|\btxt\b/,
        /[a-z]:\\/
    ]);
}

function wantsDryRun(text: string): boolean {
    return hasAny(text, [
        /\bdry[-_ ]?run\b/,
        /\bsimula/,
        /\bprevisualiza/,
        /\bpreview\b/,
        /\bmostra(?:r)?\s+(?:antes|o plano|o que)/,
        /\bver\s+(?:antes|o plano|o que)/,
        /\bconfere?\b/,
        /\bsem\s+(?:alterar|mexer|executar|deletar|apagar)/
    ]);
}

function processTargetFromText(text: string): string | undefined {
    const pid = text.match(/\bpid\s+(\d+)\b/);
    if (pid?.[1]) return pid[1];
    if (/\bword\b|\bwinword\b/.test(text)) return 'WINWORD.EXE';
    if (/\bexcel\b/.test(text)) return 'EXCEL.EXE';
    if (/\bchrome\b/.test(text)) return 'chrome.exe';
    if (/\bnode\b/.test(text)) return 'node.exe';
    return undefined;
}

export function suggestOsPlannerAction(objetivo: string, ctx: HintContext = {}): OsIntentHint | null {
    const text = norm(objetivo);
    const caminho = inferCaminho(text, ctx);

    if (hasAny(text, [/\bprocessos?\b/, /\bprogramas?\b/, /\bword\b/, /\bexcel\b/, /\bacrobat\b/, /\breader\b/, /\bpdf reader\b/])
        && hasAny(text, [/\bencerra/, /\bfechar?\b/, /\bfecha/, /\bfinaliza/, /\bmatar?\b/, /\blista/, /\blistar/, /\bmostra/])) {
        const querEncerrar = hasAny(text, [/\bencerra/, /\bfechar?\b/, /\bfecha/, /\bfinaliza/, /\bmatar?\b/]);
        if (querEncerrar && !hasAny(text, [/\bword\b/, /\bexcel\b/, /\bacrobat\b/, /\breader\b/, /\bchrome\b/, /\bnode\b/, /\bpid\s+\d+/])) {
            return {
                tipo: 'skill',
                skill: 'os_sistema',
                parametros: { operacao: 'processos' },
                motivo: 'antes de encerrar processos sem alvo exato, liste processos com os_sistema; nao use terminal'
            };
        }
        const alvo = querEncerrar ? processTargetFromText(text) : undefined;
        return {
            tipo: 'skill',
            skill: 'os_sistema',
            parametros: alvo
                ? { operacao: 'encerrar', alvo }
                : { operacao: querEncerrar ? 'encerrar' : 'processos' },
            motivo: 'listar ou encerrar processos deve usar os_sistema, nao terminal'
        };
    }

    const duplicate = hasAny(text, [/\bduplicad[oa]s?\b/, /\bcopias?\b/, /\bcopy\b/]);
    const duplicateByName = hasAny(text, [/\bnome obvio\b/, /\bpor nome\b/, /\bnomes? obvios?\b/, /\barquivo \(\d+\)/]);
    if (duplicate || duplicateByName) {
        if (duplicateByName) {
            return {
                tipo: 'skill',
                skill: 'os_buscar',
                parametros: { caminho, modo: 'duplicados_nome' },
                motivo: 'duplicatas por nome devem usar os_buscar modo duplicados_nome, nunca terminal'
            };
        }
        return {
            tipo: 'pergunta',
            pergunta: 'Que tipo de duplicado voce quer encontrar?',
            opcoes: ['Por nome obvio', 'Por conteudo', 'Especifico'],
            motivo: 'duplicado e ambiguo sem criterio; perguntar antes de varrer ou deletar'
        };
    }

    if (!isPcContext(text, ctx)) return null;

    if (hasAny(text, [/\bdelet/, /\bapag/, /\bremov/, /\bexclu/, /\blixeira\b/])) {
        const parametros = wantsDryRun(text) ? { dry_run: true } : {};
        return { tipo: 'skill', skill: 'os_deletar', parametros, motivo: 'delete de arquivos deve usar os_deletar com confirmacao' };
    }

    const organizingFiles = hasAny(text, [/\borganiza/, /\borganiz/, /\barruma/, /\bagrupa/, /\bagrupar/]);
    if (organizingFiles || hasAny(text, [/\bmover?\b/, /\bmov[a-z]*\b/, /\brenome/, /\bcopia[rr]?\b/])) {
        const parametros = wantsDryRun(text) || organizingFiles ? { dry_run: true } : {};
        return {
            tipo: 'skill',
            skill: 'os_mover',
            parametros,
            motivo: organizingFiles
                ? 'organizar/arrumar pasta deve comecar com dry_run em os_mover'
                : 'mover/copiar/renomear/criar pasta deve usar os_mover'
        };
    }

    if (hasAny(text, [/\babre?\b/, /\babrir\b/, /\babra\b/]) && hasAny(text, [/\barquivo\b/, /\bpasta\b/, /\bpdf\b/, /\bdocx\b/, /[a-z]:\\/])) {
        return { tipo: 'skill', skill: 'os_sistema', parametros: { operacao: 'abrir' }, motivo: 'abrir arquivo ou pasta local deve usar os_sistema abrir' };
    }

    if (hasAny(text, [/\btamanho\b/, /\bespaco\b/, /\bocupa\b/, /\bpesad[oa]\b/, /\bquantos?\s+(mb|gb|kb)\b/])) {
        return { tipo: 'skill', skill: 'os_tamanho', parametros: { caminho }, motivo: 'medir espaco de pasta deve usar os_tamanho' };
    }

    // Sprint 1 do OS-ROUTER-REWORK: busca foi removida do router determinístico.
    // A descricao enriquecida em os_buscar.ts (formato WHEN/WHEN NOT/examples)
    // guia o LLM diretamente. Manter apenas se descobrirmos regressão.

    if (hasAny(text, [/\blista/, /\bliste\b/, /\blistar/, /\bveja\b/, /\bver\b/, /\bmostra/, /\bmostrar/, /\bexibe/, /\bexibir/])) {
        return { tipo: 'skill', skill: 'os_listar', parametros: { caminho }, motivo: 'listar arquivos/pastas deve usar os_listar' };
    }

    return null;
}

export function formatOsIntentHint(hint: OsIntentHint): string {
    if (hint.tipo === 'skill') {
        return `Use tipo=skill com <skill>${hint.skill}</skill> e parametros ${JSON.stringify(hint.parametros || {})}. Motivo: ${hint.motivo}. Nao use terminal_executar para esta tarefa.`;
    }
    return `Use tipo=pergunta. Pergunta sugerida: "${hint.pergunta}". Opcoes: ${JSON.stringify(hint.opcoes || [])}. Motivo: ${hint.motivo}.`;
}
