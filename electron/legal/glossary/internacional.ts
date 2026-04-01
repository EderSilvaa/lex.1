import type { LegalTerm } from './types';

/**
 * Glossário — Direito Internacional.
 */
export const INTERNACIONAL: LegalTerm[] = [
    { termo: 'tratado internacional', significado: 'Acordo formal entre Estados ou organizações internacionais.', uso: 'Internalizado por decreto legislativo + decreto presidencial.', area: ['internacional'], exemplo: 'O tratado internacional foi internalizado com status supralegal.' },
    { termo: 'homologação de sentença estrangeira', significado: 'Procedimento para validar decisão judicial estrangeira no Brasil.', uso: 'Competência do STJ (art. 105, I, "i", CF).', area: ['internacional'], exemplo: 'A sentença estrangeira de divórcio foi homologada pelo STJ.' },
    { termo: 'carta rogatória', significado: 'Instrumento de cooperação judicial internacional.', uso: 'Pedido de cumprimento de ato processual por autoridade estrangeira.', area: ['internacional'], exemplo: 'Foi expedida carta rogatória para citação do réu no exterior.' },
    { termo: 'extradição', significado: 'Entrega de pessoa acusada ou condenada a outro Estado.', uso: 'Depende de tratado ou promessa de reciprocidade (art. 81, Lei 13.445/17).', area: ['internacional', 'penal'], exemplo: 'O pedido de extradição foi deferido pelo STF.' },
    { termo: 'refúgio', significado: 'Proteção a pessoa perseguida por raça, religião, nacionalidade, grupo social ou opinião política.', uso: 'Regulado pela Lei 9.474/97 e Convenção de 1951.', area: ['internacional'], exemplo: 'O pedido de refúgio foi deferido pelo CONARE.' },
    { termo: 'arbitragem internacional', significado: 'Solução de controvérsias por árbitros em âmbito internacional.', uso: 'Cláusula compromissória em contratos internacionais.', area: ['internacional', 'empresarial'], exemplo: 'A disputa será resolvida por arbitragem na Câmara de Comércio Internacional.' },
    { termo: 'direito de asilo', significado: 'Proteção concedida por Estado a pessoa perseguida em outro país.', uso: 'Territorial (no próprio território) ou diplomático (em embaixada).', area: ['internacional'], exemplo: 'O asilo político foi concedido ao perseguido na embaixada brasileira.' },
    { termo: 'Convenção de Haia', significado: 'Tratados multilaterais sobre cooperação jurídica internacional.', uso: 'Abrange sequestro internacional de crianças, apostila, citação etc.', area: ['internacional', 'familia'], exemplo: 'A restituição da criança foi determinada com base na Convenção de Haia.' },
    { termo: 'cláusula de eleição de foro', significado: 'Estipulação contratual que define o foro competente para disputas.', uso: 'Em contratos internacionais, pode designar foro estrangeiro ou arbitral.', area: ['internacional', 'civil'], exemplo: 'As partes elegeram o foro de Londres para resolução de disputas.' },
    { termo: 'apostilamento', significado: 'Certificação de autenticidade de documento público para uso no exterior.', uso: 'Substitui a legalização consular (Convenção da Apostila de Haia).', area: ['internacional'], sinonimos: ['apostila de Haia'], exemplo: 'O diploma foi apostilado para uso no exterior.' },
];
