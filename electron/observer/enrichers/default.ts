/**
 * Default enricher — noop.
 * Usado para servers sem enrichment específico (filesystem, etc).
 * O Observer grava só input/output sem contexto de página.
 */

import type { Enricher } from '../types';

export const defaultEnricher: Enricher = {};
