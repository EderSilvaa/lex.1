import { registerSkill } from '../../agent/executor';
import { docAnalisar } from './analisar';
import { docGerar } from './gerar';

export function registerDocumentosSkills(): void {
    registerSkill(docAnalisar);
    registerSkill(docGerar);
    console.log('[Skills] Documentos registradas: doc_analisar, doc_gerar');
}
