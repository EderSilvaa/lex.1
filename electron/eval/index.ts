/**
 * Eval — API pública.
 *
 * Uso típico (CLI ou handler IPC):
 *
 *   import { runEvalSuite, smokeSuite, makeRunGoal } from 'electron/eval';
 *   const snap = await runEvalSuite({
 *       tasks: smokeSuite,
 *       runGoal: makeRunGoal(),
 *       onProgress: (d, t, task) => console.log(`${d}/${t}: ${task.id}`),
 *   });
 *   console.log(snap.summary);
 *
 * makeRunGoal() retorna uma função que invoca o Orchestrator (phase 1) ou
 * o skill pje_browser_use diretamente. Mantida como factory pra que o eval
 * não acople a um caminho específico — o teste é o mesmo, muda só como
 * o goal é executado.
 */

export { runEvalSuite, diffSnapshots, loadSnapshots } from './runner';
export { smokeSuite } from './suites/smoke';
export type { EvalTask, EvalRunMetrics, EvalSnapshot } from './types';
export type { RunGoalFn } from './runner';

import type { RunGoalFn } from './runner';

/**
 * Factory padrão: executa o goal via skill pje_browser_use (se tribunal) ou
 * via Orchestrator (default). Detecta replay hit via parsing do output.
 *
 * Lazy import pra não acoplar o módulo de eval ao agent/orchestrator em
 * cenários de teste unitário.
 */
export function makeRunGoal(): RunGoalFn {
    return async (goal, opts) => {
        const errors: string[] = [];
        let output = '';
        let toolCalls = 0;
        let replayHit = false;
        let replayFlow: string | undefined;
        let replayConfidence: number | undefined;

        try {
            if (opts.tribunal) {
                // Caminho direto pelo skill pje_browser_use — mais representativo
                // do fluxo que queremos medir (explore-then-exploit).
                const { pjeBrowserUse } = await import('../skills/pje/browser-use');
                const result = await pjeBrowserUse.execute(
                    { task: goal, tribunal: opts.tribunal },
                    {} as any,
                );
                output = String(result.mensagem || result.erro || '');
                if (result.dados?.['replay']) {
                    replayHit = true;
                    replayFlow = result.dados['flow'];
                    replayConfidence = result.dados['confidence'];
                }
                if (result.dados?.['steps']) toolCalls = Number(result.dados['steps']);
                if (!result.sucesso && result.erro) errors.push(result.erro);
            } else {
                const { Orchestrator } = await import('../agent/orchestrator');
                const orch = new Orchestrator();
                const res = await orch.execute(goal);
                output = String(res ?? '');
            }
        } catch (err: any) {
            errors.push(err?.message ? String(err.message) : String(err));
        }

        // Heurística fallback para detectar replay quando dados.replay não foi
        // populado (ex: Orchestrator): procura marker no output.
        if (!replayHit && /\[Replay\]\s+SUCESSO/i.test(output)) {
            replayHit = true;
        }

        return { output, toolCalls, replayHit, replayFlow, replayConfidence, errors };
    };
}
