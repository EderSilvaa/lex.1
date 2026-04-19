const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { randomUUID } = require('crypto');

const rootDir = process.cwd();
const userDataDir = path.join(rootDir, '.e2e-cli', 'ws-userdata');
const port = 19986;
const serverPath = path.join(rootDir, 'dist-electron', 'backend', 'server.js');

fs.mkdirSync(userDataDir, { recursive: true });

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createRpcClient(name) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const pending = new Map();
  const events = [];

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject, timer } = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(timer);
      if (msg.error) reject(new Error(msg.error));
      else resolve(msg.result);
      return;
    }

    if (msg.event) {
      events.push(msg);
    }
  });

  function call(method, params = {}, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${name}: timeout RPC ${method}`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  return { name, ws, events, call };
}

async function waitForOpen(ws, name) {
  if (ws.readyState === WebSocket.OPEN) return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name}: open timeout`)), 10000);
    ws.once('open', () => {
      clearTimeout(timer);
      resolve();
    });
    ws.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function main() {
  const backend = spawn('node', [serverPath], {
    cwd: rootDir,
    env: {
      ...process.env,
      LEX_BACKEND_PORT: String(port),
      LEX_USER_DATA: userDataDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let ready = false;
  const bootLogs = [];
  backend.stdout.on('data', (buf) => {
    const text = buf.toString();
    bootLogs.push(text);
    if (text.includes('READY on port')) ready = true;
  });
  backend.stderr.on('data', (buf) => {
    bootLogs.push(buf.toString());
  });

  const startedAt = Date.now();
  while (!ready && Date.now() - startedAt < 15000) {
    await wait(100);
  }
  if (!ready) {
    throw new Error(`Backend não ficou pronto.\n${bootLogs.join('')}`);
  }

  const client1 = createRpcClient('client1');
  const client2 = createRpcClient('client2');

  try {
    await waitForOpen(client1.ws, client1.name);
    await waitForOpen(client2.ws, client2.name);

    await client1.call('ping');
    await client2.call('ping');

    client1.events.length = 0;
    client2.events.length = 0;

    const resultA = await client1.call('agent-run', {
      objetivo: 'teste E2E de coexistencia',
      config: {},
      sessionId: randomUUID(),
    }, 30000);

    await wait(1500);

    const scenarioA = {
      rpcResult: resultA,
      client1Events: client1.events.map((e) => e.data?.type || e.event),
      client2Events: client2.events.map((e) => e.data?.type || e.event),
    };

    client1.events.length = 0;
    client2.events.length = 0;

    client2.ws.close();
    await wait(1000);

    const resultB = await client1.call('agent-run', {
      objetivo: 'teste E2E apos fechar segundo cliente',
      config: {},
      sessionId: randomUUID(),
    }, 30000);

    await wait(1500);

    const scenarioB = {
      rpcResult: resultB,
      client1Events: client1.events.map((e) => e.data?.type || e.event),
      client2Closed: client2.ws.readyState === WebSocket.CLOSED,
    };

    console.log(JSON.stringify({ scenarioA, scenarioB }, null, 2));
  } finally {
    try { client1.ws.close(); } catch {}
    try { client2.ws.close(); } catch {}
    try { backend.kill(); } catch {}
  }
}

main().catch((err) => {
  console.error(err.stack || String(err));
  process.exit(1);
});
