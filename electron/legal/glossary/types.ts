/**
 * LegalTerm — Tipo de termo jurídico do glossário.
 */

export interface LegalTerm {
    termo: string;
    significado: string;
    uso: string;
    area: string[];
    origem?: 'latim' | 'frances' | 'portugues';
    sinonimos?: string[];
    exemplo?: string;
}
