#!/usr/bin/env node
/*
 * LEX CLI — npm bin shim
 *
 * Aponta para o entry compilado dentro de dist-electron/cli/index.js.
 * O __dirname desse arquivo é dist-electron/cli/, e backend-client.ts
 * (compilado para dist-electron/backend-client.js) usa __dirname dele
 * próprio para localizar dist-electron/backend/server.js — então tudo
 * funciona sem ajuste de paths.
 *
 * Logs internos ([Provider], [BackendClient], etc.) são silenciados por
 * padrão no CLI para não poluir o output. Use LEX_DEBUG=1 para ver tudo.
 */
if (!process.env.LEX_DEBUG) {
    const noop = () => {};
    console.log  = noop;
    console.warn = noop;
    console.info = noop;
    // console.error mantido — erros reais precisam aparecer
}

require('../dist-electron/cli/index.js');
