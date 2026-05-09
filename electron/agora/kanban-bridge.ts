import { execFile } from 'child_process';
import * as fs from 'fs';

import {
    getLexEngineKanbanBridgeEnv,
    getLexEngineKanbanHomePath,
    getLexEngineRepoPath,
} from '../lex-engine';

const PYTHON_BRIDGE = String.raw`
import json
import os
import shlex
import sys
import subprocess
import time

from hermes_cli import kanban_db as kb

payload = json.loads(sys.stdin.read() or "{}")
action = payload.get("action", "list")
args = payload.get("args") or {}

STATUS_TO_COLUMN = {
    "triage": "entrada",
    "todo": "especificacao",
    "ready": "pronto_execucao",
    "running": "execucao",
    "blocked": "revisao",
    "done": "pronto",
    "archived": "arquivo",
}
COLUMN_TO_STATUS = {v: k for k, v in STATUS_TO_COLUMN.items()}
COLUMN_ORDER = ["entrada", "especificacao", "pronto_execucao", "execucao", "revisao", "pronto"]

def iso(ts):
    if not ts:
        return None
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(int(ts)))

def priority_label(value):
    value = int(value or 0)
    if value >= 2:
        return "Alta"
    if value <= -1:
        return "Baixa"
    return "Media"

def priority_value(value):
    text = str(value or "Media").strip().lower()
    if text.startswith("alta"):
        return 2
    if text.startswith("baixa"):
        return -1
    return 0

def progress_for_status(status):
    return {
        "triage": 5,
        "todo": 25,
        "ready": 40,
        "running": 65,
        "blocked": 80,
        "done": 100,
        "archived": 100,
    }.get(status, 10)

def guardrail_for_status(status):
    return {
        "triage": "Aguardando escopo",
        "todo": "Especificacao",
        "ready": "Pronto para worker",
        "running": "Worker ativo",
        "blocked": "HITL / bloqueado",
        "done": "Concluido",
        "archived": "Arquivado",
    }.get(status, "Supervisionado")

def event_dict(event):
    return {
        "id": event.id,
        "kind": event.kind,
        "payload": event.payload or {},
        "created_at": iso(event.created_at),
        "run_id": event.run_id,
    }

def run_dict(run):
    return {
        "id": run.id,
        "task_id": run.task_id,
        "profile": run.profile,
        "step_key": run.step_key,
        "status": run.status,
        "worker_pid": run.worker_pid,
        "started_at": iso(run.started_at),
        "ended_at": iso(run.ended_at),
        "outcome": run.outcome,
        "summary": run.summary,
        "error": run.error,
        "last_heartbeat_at": iso(run.last_heartbeat_at),
    }

def comment_dict(comment):
    return {
        "id": comment.id,
        "author": comment.author,
        "body": comment.body,
        "created_at": iso(comment.created_at),
    }

def task_card(conn, task):
    comments = [comment_dict(c) for c in kb.list_comments(conn, task.id)]
    events = [event_dict(e) for e in kb.list_events(conn, task.id)][-30:]
    runs = [run_dict(r) for r in kb.list_runs(conn, task.id)][-10:]
    log_tail = kb.read_worker_log(task.id, tail_bytes=12000) or ""
    body = task.body or task.result or ""
    return {
        "id": task.id,
        "column": STATUS_TO_COLUMN.get(task.status, "entrada"),
        "type": task.tenant or "Workflow",
        "title": task.title,
        "summary": body[:420] if body else "Workflow duravel no Kanban oficial Hermes.",
        "agent": task.assignee or "Orquestrador Hermes",
        "guardrail": guardrail_for_status(task.status),
        "priority": priority_label(task.priority),
        "progress": progress_for_status(task.status),
        "source": "engine",
        "createdAt": iso(task.created_at),
        "updatedAt": iso(task.completed_at or task.started_at or task.created_at),
        "status": task.status,
        "runs": runs,
        "workerLog": log_tail,
        "comments": comments,
        "events": events,
    }

def set_status(conn, task_id, status):
    with kb.write_txn(conn):
        row = conn.execute("SELECT status FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not row:
            return False
        old = row["status"]
        conn.execute(
            "UPDATE tasks SET status = ?, completed_at = CASE WHEN ? = 'done' THEN ? ELSE completed_at END WHERE id = ?",
            (status, status, int(time.time()), task_id),
        )
        kb._append_event(conn, task_id, "moved", {"from": old, "to": status})
    return True

def win_to_wsl(path):
    text = str(path or "")
    if len(text) >= 3 and text[1] == ":" and text[2] in ("\\", "/"):
        drive = text[0].lower()
        rest = text[3:].replace("\\", "/")
        return f"/mnt/{drive}/{rest}"
    return text.replace("\\", "/")

def lex_spawn(task, workspace, board=None):
    if os.environ.get("LEX_KANBAN_ENABLE_WORKER_SPAWN") != "1":
        raise RuntimeError("worker spawn disabled; set LEX_AGORA_ENABLE_WORKERS=1 to enable Agora dispatcher workers")
    if not task.assignee:
        raise RuntimeError(f"task {task.id} has no assignee")

    from hermes_cli.profiles import normalize_profile_name

    profile = normalize_profile_name(task.assignee)
    prompt = f"work kanban task {task.id}"
    mode = os.environ.get("LEX_KANBAN_SPAWN_MODE", "local")

    env_bits = {
        "HERMES_KANBAN_TASK": task.id,
        "HERMES_KANBAN_WORKSPACE": workspace,
        "HERMES_KANBAN_DB": str(kb.kanban_db_path(board=board)),
        "HERMES_KANBAN_WORKSPACES_ROOT": str(kb.workspaces_root(board=board)),
        "HERMES_KANBAN_BOARD": board or kb.get_current_board(),
        "HERMES_PROFILE": profile,
    }
    if task.tenant:
        env_bits["HERMES_TENANT"] = task.tenant
    if task.current_run_id is not None:
        env_bits["HERMES_KANBAN_RUN_ID"] = str(task.current_run_id)
    if task.claim_lock:
        env_bits["HERMES_KANBAN_CLAIM_LOCK"] = task.claim_lock

    log_dir = kb.worker_logs_dir(board=board)
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / f"{task.id}.log"
    log_f = open(log_path, "ab")

    skills = ["kanban-worker"] + [sk for sk in (task.skills or []) if sk and sk != "kanban-worker"]

    if mode == "wsl":
        distro = os.environ.get("LEX_KANBAN_WSL_DISTRO", "Ubuntu")
        project = os.environ.get("LEX_KANBAN_WSL_PROJECT_PATH", "")
        command = os.environ.get("LEX_KANBAN_WSL_COMMAND", "hermes")
        if not project:
            raise RuntimeError("LEX_KANBAN_WSL_PROJECT_PATH is not configured")
        wsl_env = {}
        for key, value in env_bits.items():
            if key in ("HERMES_KANBAN_WORKSPACE", "HERMES_KANBAN_DB", "HERMES_KANBAN_WORKSPACES_ROOT"):
                wsl_env[key] = win_to_wsl(value)
            else:
                wsl_env[key] = value
        prefix = " ".join(f"{key}={shlex.quote(str(value))}" for key, value in wsl_env.items())
        skill_args = " ".join(f"--skills {shlex.quote(sk)}" for sk in skills)
        shell_cmd = (
            f"cd {shlex.quote(project)} && "
            f"{prefix} {command} -p {shlex.quote(profile)} {skill_args} "
            f"chat -q {shlex.quote(prompt)}"
        )
        proc = subprocess.Popen(
            ["wsl.exe", "-d", distro, "--", "bash", "-lc", shell_cmd],
            stdin=subprocess.DEVNULL,
            stdout=log_f,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        return proc.pid

    env = dict(os.environ)
    env.update(env_bits)
    cmd = ["hermes", "-p", profile]
    for sk in skills:
        cmd.extend(["--skills", sk])
    cmd.extend(["chat", "-q", prompt])
    proc = subprocess.Popen(
        cmd,
        cwd=workspace if os.path.isdir(workspace) else None,
        stdin=subprocess.DEVNULL,
        stdout=log_f,
        stderr=subprocess.STDOUT,
        env=env,
        start_new_session=True,
    )
    return proc.pid

conn = kb.connect()

if action == "list":
    cards = [task_card(conn, t) for t in kb.list_tasks(conn, include_archived=False)]
    print(json.dumps({"ok": True, "cards": cards}, ensure_ascii=False))
elif action == "get":
    task = kb.get_task(conn, args.get("id") or "")
    print(json.dumps({"ok": True, "card": task_card(conn, task) if task else None}, ensure_ascii=False))
elif action == "create":
    column = args.get("column") or "entrada"
    status = COLUMN_TO_STATUS.get(column, "triage")
    task_id = kb.create_task(
        conn,
        title=(args.get("title") or "Nova tarefa juridica"),
        body=(args.get("summary") or args.get("body") or ""),
        assignee=args.get("assignee") or "default",
        created_by="lex-desktop",
        tenant=args.get("type") or "Workflow",
        priority=priority_value(args.get("priority")),
        triage=(status == "triage"),
    )
    if status not in ("triage", "ready"):
        set_status(conn, task_id, status)
    print(json.dumps({"ok": True, "card": task_card(conn, kb.get_task(conn, task_id))}, ensure_ascii=False))
elif action == "update":
    task_id = args.get("id") or ""
    updates = args.get("updates") or {}
    task = kb.get_task(conn, task_id)
    if not task:
        print(json.dumps({"ok": True, "card": None}, ensure_ascii=False))
    else:
        with kb.write_txn(conn):
            if "title" in updates:
                conn.execute("UPDATE tasks SET title = ? WHERE id = ?", (str(updates.get("title") or task.title)[:240], task_id))
            if "summary" in updates or "body" in updates:
                conn.execute("UPDATE tasks SET body = ? WHERE id = ?", (str(updates.get("summary") or updates.get("body") or "")[:4000], task_id))
            if "priority" in updates:
                conn.execute("UPDATE tasks SET priority = ? WHERE id = ?", (priority_value(updates.get("priority")), task_id))
            if "agent" in updates or "assignee" in updates:
                conn.execute("UPDATE tasks SET assignee = ? WHERE id = ?", ((updates.get("assignee") or updates.get("agent") or None), task_id))
            if "column" in updates:
                status = COLUMN_TO_STATUS.get(updates.get("column"), task.status)
                conn.execute("UPDATE tasks SET status = ? WHERE id = ?", (status, task_id))
            kb._append_event(conn, task_id, "updated", {"source": "lex-desktop"})
        print(json.dumps({"ok": True, "card": task_card(conn, kb.get_task(conn, task_id))}, ensure_ascii=False))
elif action == "move":
    task_id = args.get("id") or ""
    direction = int(args.get("direction") or 0)
    task = kb.get_task(conn, task_id)
    if not task:
        print(json.dumps({"ok": True, "card": None}, ensure_ascii=False))
    else:
        column = STATUS_TO_COLUMN.get(task.status, "entrada")
        idx = max(0, COLUMN_ORDER.index(column) if column in COLUMN_ORDER else 0)
        next_idx = max(0, min(len(COLUMN_ORDER) - 1, idx + direction))
        status = COLUMN_TO_STATUS[COLUMN_ORDER[next_idx]]
        if status == "done":
            kb.complete_task(conn, task_id, result="Concluido pela Agora Lex", summary="Movido para pronto no Desktop")
        elif status == "blocked":
            if task.status in ("ready", "running"):
                kb.block_task(conn, task_id, reason="Movido para revisao/HITL no Desktop")
            else:
                set_status(conn, task_id, status)
        else:
            set_status(conn, task_id, status)
        print(json.dumps({"ok": True, "card": task_card(conn, kb.get_task(conn, task_id))}, ensure_ascii=False))
elif action == "remove":
    ok = kb.archive_task(conn, args.get("id") or "")
    print(json.dumps({"ok": True, "removed": bool(ok)}, ensure_ascii=False))
elif action == "comment":
    task_id = args.get("id") or ""
    kb.add_comment(conn, task_id, args.get("author") or "Electron", args.get("body") or "")
    print(json.dumps({"ok": True, "card": task_card(conn, kb.get_task(conn, task_id))}, ensure_ascii=False))
elif action == "runs":
    task_id = args.get("id") or ""
    task = kb.get_task(conn, task_id)
    if not task:
        print(json.dumps({"ok": True, "runs": [], "log": ""}, ensure_ascii=False))
    else:
        print(json.dumps({
            "ok": True,
            "runs": [run_dict(r) for r in kb.list_runs(conn, task_id)],
            "log": kb.read_worker_log(task_id, tail_bytes=int(args.get("tail_bytes") or 12000)) or "",
        }, ensure_ascii=False))
elif action == "dispatch":
    max_spawn = int(args.get("max_spawn") if args.get("max_spawn") is not None else 1)
    if os.environ.get("LEX_KANBAN_ENABLE_WORKER_SPAWN") != "1":
        max_spawn = 0
    result = kb.dispatch_once(
        conn,
        spawn_fn=lex_spawn,
        max_spawn=max_spawn,
        failure_limit=int(args.get("failure_limit") or 2),
    )
    print(json.dumps({
        "ok": True,
        "dispatch": {
            "reclaimed": result.reclaimed,
            "promoted": result.promoted,
            "spawned": result.spawned,
            "skipped_unassigned": result.skipped_unassigned,
            "skipped_nonspawnable": result.skipped_nonspawnable,
            "crashed": result.crashed,
            "auto_blocked": result.auto_blocked,
            "timed_out": result.timed_out,
            "spawn_enabled": os.environ.get("LEX_KANBAN_ENABLE_WORKER_SPAWN") == "1",
        }
    }, ensure_ascii=False))
else:
    print(json.dumps({"ok": False, "error": "unknown action"}, ensure_ascii=False))
`;

export interface KanbanBridgeResult {
    ok: boolean;
    cards?: any[];
    card?: any;
    removed?: boolean;
    dispatch?: any;
    runs?: any[];
    log?: string;
    error?: string;
}

export function isKanbanBridgeAvailable(): boolean {
    return fs.existsSync(getLexEngineRepoPath());
}

export function runKanbanBridge(action: string, args: Record<string, any> = {}): Promise<KanbanBridgeResult> {
    return new Promise((resolve, reject) => {
        const python = process.env['LEX_ENGINE_WINDOWS_PYTHON'] || 'python';
        const child = execFile(
            python,
            ['-c', PYTHON_BRIDGE],
            {
                cwd: getLexEngineRepoPath(),
                env: {
                    ...process.env,
                    ...getLexEngineKanbanBridgeEnv(),
                    HERMES_KANBAN_HOME: getLexEngineKanbanHomePath(),
                    PYTHONIOENCODING: 'utf-8',
                },
                windowsHide: true,
                timeout: 15000,
                maxBuffer: 1024 * 1024 * 8,
            },
            (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`${error.message}${stderr ? `\n${stderr}` : ''}`));
                    return;
                }
                try {
                    const parsed = JSON.parse(String(stdout || '{}'));
                    resolve(parsed);
                } catch (err: any) {
                    reject(new Error(`Kanban bridge returned invalid JSON: ${err?.message || err}\n${stdout}`));
                }
            },
        );

        child.stdin?.end(JSON.stringify({ action, args }));
    });
}
