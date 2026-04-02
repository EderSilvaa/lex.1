/**
 * LEX Brain — SQLite Schema
 *
 * Cria tabelas, indices, FTS5 virtual tables e triggers.
 * Migrations incrementais via schema_version em metadata.
 */

import type Database from 'better-sqlite3';

export const SCHEMA_VERSION = 1;

const TABLES_SQL = `
-- =============================================
-- NODES (vertices do grafo de conhecimento)
-- =============================================
CREATE TABLE IF NOT EXISTS nodes (
    id          TEXT PRIMARY KEY,
    type        TEXT NOT NULL,
    label       TEXT NOT NULL,
    data        TEXT DEFAULT '{}',
    confidence  REAL DEFAULT 0.5,
    source      TEXT DEFAULT 'agent',
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    accessed_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
CREATE INDEX IF NOT EXISTS idx_nodes_updated ON nodes(updated_at);
CREATE INDEX IF NOT EXISTS idx_nodes_accessed ON nodes(accessed_at);

-- =============================================
-- EDGES (relacoes entre nodes)
-- =============================================
CREATE TABLE IF NOT EXISTS edges (
    id          TEXT PRIMARY KEY,
    source_id   TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target_id   TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    relation    TEXT NOT NULL,
    weight      REAL DEFAULT 1.0,
    data        TEXT DEFAULT '{}',
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    UNIQUE(source_id, target_id, relation)
);

CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
CREATE INDEX IF NOT EXISTS idx_edges_relation ON edges(relation);

-- =============================================
-- INTERACTIONS (substitui Memory.interacoes)
-- =============================================
CREATE TABLE IF NOT EXISTS interactions (
    id          TEXT PRIMARY KEY,
    objetivo    TEXT NOT NULL,
    resposta    TEXT DEFAULT '',
    passos      INTEGER DEFAULT 0,
    duracao     INTEGER DEFAULT 0,
    sucesso     INTEGER DEFAULT 0,
    created_at  INTEGER NOT NULL
);

-- =============================================
-- SELECTORS (migra selector-memory.ts)
-- =============================================
CREATE TABLE IF NOT EXISTS selectors (
    id              TEXT PRIMARY KEY,
    tribunal        TEXT NOT NULL,
    context         TEXT NOT NULL,
    selector_css    TEXT NOT NULL,
    success_count   INTEGER DEFAULT 0,
    failure_count   INTEGER DEFAULT 0,
    last_used       INTEGER NOT NULL,
    last_successful TEXT,
    UNIQUE(tribunal, context, selector_css)
);

CREATE INDEX IF NOT EXISTS idx_selectors_lookup ON selectors(tribunal, context);

-- =============================================
-- PREFERENCES (usuario + preferencias)
-- =============================================
CREATE TABLE IF NOT EXISTS preferences (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL
);

-- =============================================
-- METADATA (versao, dream state, etc.)
-- =============================================
CREATE TABLE IF NOT EXISTS metadata (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL
);
`;

const FTS5_SQL = `
-- FTS5 para nodes (busca full-text em label e data)
CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
    label,
    data,
    content=nodes,
    content_rowid=rowid,
    tokenize='unicode61 remove_diacritics 2'
);

-- FTS5 para interactions (substitui TF-IDF)
CREATE VIRTUAL TABLE IF NOT EXISTS interactions_fts USING fts5(
    objetivo,
    content=interactions,
    content_rowid=rowid,
    tokenize='unicode61 remove_diacritics 2'
);
`;

const TRIGGERS_SQL = `
-- Sync nodes → nodes_fts
CREATE TRIGGER IF NOT EXISTS nodes_fts_insert AFTER INSERT ON nodes BEGIN
    INSERT INTO nodes_fts(rowid, label, data) VALUES (new.rowid, new.label, new.data);
END;

CREATE TRIGGER IF NOT EXISTS nodes_fts_delete AFTER DELETE ON nodes BEGIN
    INSERT INTO nodes_fts(nodes_fts, rowid, label, data) VALUES ('delete', old.rowid, old.label, old.data);
END;

CREATE TRIGGER IF NOT EXISTS nodes_fts_update AFTER UPDATE ON nodes BEGIN
    INSERT INTO nodes_fts(nodes_fts, rowid, label, data) VALUES ('delete', old.rowid, old.label, old.data);
    INSERT INTO nodes_fts(rowid, label, data) VALUES (new.rowid, new.label, new.data);
END;

-- Sync interactions → interactions_fts
CREATE TRIGGER IF NOT EXISTS interactions_fts_insert AFTER INSERT ON interactions BEGIN
    INSERT INTO interactions_fts(rowid, objetivo) VALUES (new.rowid, new.objetivo);
END;

CREATE TRIGGER IF NOT EXISTS interactions_fts_delete AFTER DELETE ON interactions BEGIN
    INSERT INTO interactions_fts(interactions_fts, rowid, objetivo) VALUES ('delete', old.rowid, old.objetivo);
END;
`;

/** Aplica schema completo (idempotente via IF NOT EXISTS) */
export function applySchema(db: Database.Database): void {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(TABLES_SQL);
    db.exec(FTS5_SQL);
    db.exec(TRIGGERS_SQL);

    // Metadata inicial
    const insertMeta = db.prepare('INSERT OR IGNORE INTO metadata(key, value) VALUES (?, ?)');
    insertMeta.run('schema_version', String(SCHEMA_VERSION));
    insertMeta.run('dream_session_count', '0');
    insertMeta.run('migration_v0_done', '0');
}

/** Roda migrations incrementais */
export function runMigrations(db: Database.Database): void {
    const row = db.prepare('SELECT value FROM metadata WHERE key = ?').get('schema_version') as { value: string } | undefined;
    const currentVersion = row ? parseInt(row.value, 10) : 0;

    if (currentVersion >= SCHEMA_VERSION) return;

    // Futuras migrations aqui:
    // const MIGRATIONS: Record<number, (db: Database.Database) => void> = {
    //     2: (db) => { db.exec('ALTER TABLE nodes ADD COLUMN agent_type TEXT'); },
    // };

    db.prepare('UPDATE metadata SET value = ? WHERE key = ?').run(String(SCHEMA_VERSION), 'schema_version');
}
