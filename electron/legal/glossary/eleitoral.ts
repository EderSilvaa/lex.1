import type { LegalTerm } from './types';

/**
 * Glossário — Direito Eleitoral.
 */
export const ELEITORAL: LegalTerm[] = [
    { termo: 'propaganda eleitoral', significado: 'Divulgação de candidatura e propostas para captação de votos.', uso: 'Permitida após 16 de agosto do ano eleitoral (art. 36, Lei 9.504/97).', area: ['eleitoral'], exemplo: 'A propaganda eleitoral antecipada é vedada e sujeita a multa.' },
    { termo: 'abuso de poder econômico', significado: 'Uso indevido de recursos financeiros para influenciar o resultado eleitoral.', uso: 'Pode resultar em cassação do registro ou diploma (art. 22, LC 64/90).', area: ['eleitoral'], exemplo: 'O abuso de poder econômico foi comprovado pela compra de votos.' },
    { termo: 'AIJE', significado: 'Ação de Investigação Judicial Eleitoral.', uso: 'Apura abuso de poder econômico ou político nas eleições (art. 22, LC 64/90).', area: ['eleitoral'], sinonimos: ['ação de investigação judicial eleitoral'], exemplo: 'A AIJE foi julgada procedente, cassando o diploma do eleito.' },
    { termo: 'prestação de contas', significado: 'Obrigação de candidatos e partidos de demonstrar a origem e destino dos recursos de campanha.', uso: 'Prazo de 30 dias após as eleições (art. 28, Lei 9.504/97).', area: ['eleitoral'], exemplo: 'A prestação de contas foi rejeitada por irregularidades na arrecadação.' },
    { termo: 'inelegibilidade', significado: 'Impedimento jurídico para o exercício de mandato eletivo.', uso: 'Hipóteses na CF e na LC 64/90 (Lei da Ficha Limpa).', area: ['eleitoral'], exemplo: 'A condenação por órgão colegiado gera inelegibilidade por 8 anos (LC 135/2010).' },
    { termo: 'domicílio eleitoral', significado: 'Local onde o eleitor é inscrito para votar.', uso: 'Candidato deve ter domicílio eleitoral na circunscrição há pelo menos 6 meses.', area: ['eleitoral'], exemplo: 'O candidato transferiu seu domicílio eleitoral dentro do prazo legal.' },
    { termo: 'direito de resposta', significado: 'Direito de candidato ou partido ofendido de responder na mesma mídia.', uso: 'Previsto no art. 58 da Lei 9.504/97 — julgado em 24h.', area: ['eleitoral'], exemplo: 'Foi deferido o direito de resposta por ofensa na propaganda gratuita.' },
    { termo: 'cota de gênero', significado: 'Percentual mínimo de candidaturas de cada sexo.', uso: 'Mínimo de 30% e máximo de 70% para cada sexo (art. 10, §3º, Lei 9.504/97).', area: ['eleitoral'], exemplo: 'O partido não cumpriu a cota de gênero nas candidaturas.' },
    { termo: 'fundo eleitoral', significado: 'Fundo Especial de Financiamento de Campanha — recursos públicos para candidaturas.', uso: 'Distribuído aos partidos conforme critérios legais.', area: ['eleitoral'], sinonimos: ['FEFC'], exemplo: 'Os recursos do fundo eleitoral devem ser utilizados exclusivamente na campanha.' },
    { termo: 'diploma', significado: 'Documento que habilita o eleito a tomar posse no cargo.', uso: 'Expedido pela Justiça Eleitoral após proclamação dos resultados.', area: ['eleitoral'], exemplo: 'A cassação do diploma impede a posse no cargo eletivo.' },
];
