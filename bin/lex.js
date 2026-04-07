#!/usr/bin/env node
/*
 * LEX CLI — npm bin shim
 *
 * Aponta para o entry compilado dentro de dist-electron/cli/index.js.
 * O __dirname desse arquivo é dist-electron/cli/, e backend-client.ts
 * (compilado para dist-electron/backend-client.js) usa __dirname dele
 * próprio para localizar dist-electron/backend/server.js — então tudo
 * funciona sem ajuste de paths.
 */
require('../dist-electron/cli/index.js');
