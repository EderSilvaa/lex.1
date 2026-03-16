import { registerSkill } from '../../agent/executor';
import { pesquisaJurisprudencia } from './jurisprudencia';

export function registerPesquisaSkills(): void {
    registerSkill(pesquisaJurisprudencia);
    console.log('[Skills] Pesquisa registrada: pesquisa_jurisprudencia');
}
