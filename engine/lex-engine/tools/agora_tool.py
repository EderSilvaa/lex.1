#!/usr/bin/env python3
"""Agora Tool - persistent Kanban board for Lex multi-agent work.

Agents can create, inspect, move, comment on, and close board cards without
depending on the Electron renderer. The store is plain JSON so Desktop can sync
or import it later.
"""

from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from hermes_constants import get_hermes_home
from tools.registry import registry, tool_error

try:
    import fcntl
except ImportError:  # pragma: no cover - Windows fallback
    fcntl = None


AGORA_COLUMNS = ["entrada", "especificacao", "execucao", "revisao", "pronto"]
AGORA_PRIORITIES = ["Alta", "Media", "Baixa"]
AGORA_ACTIONS = {"list", "show", "create", "update", "move", "comment", "remove"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _board_path() -> Path:
    shared_path = os.environ.get("LEX_AGORA_BOARD_PATH", "").strip()
    if shared_path:
        return Path(shared_path)
    return get_hermes_home() / "agora" / "board.json"


def _empty_board() -> Dict[str, Any]:
    return {"cards": {}, "comments": {}, "events": []}


def _clean_text(value: Any, default: str = "", limit: int = 400) -> str:
    text = str(value if value is not None else default).strip()
    return text[:limit]


def _clean_column(value: Any) -> str:
    column = str(value or "entrada").strip()
    return column if column in AGORA_COLUMNS else "entrada"


def _clean_priority(value: Any) -> str:
    priority = str(value or "Media").strip()
    return priority if priority in AGORA_PRIORITIES else "Media"


def _clean_progress(value: Any) -> int:
    try:
        progress = int(float(value))
    except (TypeError, ValueError):
        progress = 0
    return max(0, min(100, progress))


class _BoardLock:
    def __init__(self, path: Path):
        self.path = path
        self.fd = None

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.fd = open(self.path, "a+", encoding="utf-8")
        if fcntl is not None:
            fcntl.flock(self.fd.fileno(), fcntl.LOCK_EX)
        return self

    def __exit__(self, exc_type, exc, tb):
        if self.fd is not None:
            if fcntl is not None:
                fcntl.flock(self.fd.fileno(), fcntl.LOCK_UN)
            self.fd.close()


def _read_board() -> Dict[str, Any]:
    path = _board_path()
    if not path.exists():
        return _empty_board()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return _empty_board()
    if not isinstance(data, dict):
        return _empty_board()
    data.setdefault("cards", {})
    data.setdefault("comments", {})
    data.setdefault("events", [])
    if not isinstance(data["cards"], dict):
        data["cards"] = {}
    if not isinstance(data["comments"], dict):
        data["comments"] = {}
    if not isinstance(data["events"], list):
        data["events"] = []
    return data


def _write_board(board: Dict[str, Any]) -> None:
    path = _board_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix="board.", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as tmp:
            json.dump(board, tmp, ensure_ascii=False, indent=2, sort_keys=True)
            tmp.write("\n")
        os.replace(tmp_name, path)
    finally:
        try:
            if os.path.exists(tmp_name):
                os.unlink(tmp_name)
        except OSError:
            pass


def _new_card_id(board: Dict[str, Any]) -> str:
    prefix = datetime.now(timezone.utc).strftime("agora-%Y%m%d-%H%M%S")
    candidate = prefix
    counter = 2
    while candidate in board["cards"]:
        candidate = f"{prefix}-{counter}"
        counter += 1
    return candidate


def _event(board: Dict[str, Any], kind: str, card_id: str, payload: Optional[Dict[str, Any]] = None) -> None:
    board["events"].append({
        "kind": kind,
        "card_id": card_id,
        "payload": payload or {},
        "created_at": _now(),
    })
    board["events"] = board["events"][-200:]


def _summarize(board: Dict[str, Any]) -> Dict[str, int]:
    summary = {column: 0 for column in AGORA_COLUMNS}
    for card in board["cards"].values():
        column = card.get("column", "entrada")
        if column in summary:
            summary[column] += 1
    summary["total"] = len(board["cards"])
    return summary


def _public_card(card: Dict[str, Any], comments: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    out = dict(card)
    if comments is not None:
        out["comments"] = comments
    return out


def _handle_list(board: Dict[str, Any]) -> Dict[str, Any]:
    cards = sorted(
        board["cards"].values(),
        key=lambda card: card.get("updated_at", ""),
        reverse=True,
    )
    return {"ok": True, "cards": [_public_card(card) for card in cards], "summary": _summarize(board)}


def _handle_show(board: Dict[str, Any], card_id: str) -> Dict[str, Any]:
    card = board["cards"].get(card_id)
    if not card:
        raise KeyError(f"card {card_id} not found")
    return {
        "ok": True,
        "card": _public_card(card, board["comments"].get(card_id, [])),
        "events": [event for event in board["events"] if event.get("card_id") == card_id][-50:],
    }


def _handle_create(board: Dict[str, Any], args: Dict[str, Any]) -> Dict[str, Any]:
    title = _clean_text(args.get("title"), "Nova tarefa juridica", 160)
    now = _now()
    card_id = _clean_text(args.get("card_id"), "", 80) or _new_card_id(board)
    if card_id in board["cards"]:
        raise ValueError(f"card {card_id} already exists")
    card = {
        "id": card_id,
        "column": _clean_column(args.get("column")),
        "type": _clean_text(args.get("type"), "Tarefa", 40),
        "title": title,
        "summary": _clean_text(args.get("summary"), "", 420),
        "agent": _clean_text(args.get("agent"), "Orquestrador", 80),
        "guardrail": _clean_text(args.get("guardrail"), "Aguardando escopo", 80),
        "priority": _clean_priority(args.get("priority")),
        "progress": _clean_progress(args.get("progress", 5)),
        "source": _clean_text(args.get("source"), "engine", 40),
        "created_at": now,
        "updated_at": now,
    }
    board["cards"][card_id] = card
    board["comments"].setdefault(card_id, [])
    _event(board, "card_created", card_id, {"title": title})
    return {"ok": True, "card": _public_card(card)}


def _handle_update(board: Dict[str, Any], card_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
    card = board["cards"].get(card_id)
    if not card:
        raise KeyError(f"card {card_id} not found")
    for key, limit in {
        "type": 40,
        "title": 160,
        "summary": 420,
        "agent": 80,
        "guardrail": 80,
        "source": 40,
    }.items():
        if key in args and args[key] is not None:
            card[key] = _clean_text(args[key], card.get(key, ""), limit)
    if "column" in args:
        card["column"] = _clean_column(args.get("column"))
    if "priority" in args:
        card["priority"] = _clean_priority(args.get("priority"))
    if "progress" in args:
        card["progress"] = _clean_progress(args.get("progress"))
    card["updated_at"] = _now()
    _event(board, "card_updated", card_id)
    return {"ok": True, "card": _public_card(card)}


def _handle_move(board: Dict[str, Any], card_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
    card = board["cards"].get(card_id)
    if not card:
        raise KeyError(f"card {card_id} not found")
    old_column = card.get("column", "entrada")
    if args.get("column"):
        new_column = _clean_column(args.get("column"))
    else:
        direction = int(args.get("direction") or 0)
        idx = AGORA_COLUMNS.index(_clean_column(old_column))
        next_idx = max(0, min(len(AGORA_COLUMNS) - 1, idx + direction))
        new_column = AGORA_COLUMNS[next_idx]
    card["column"] = new_column
    if "progress" in args:
        card["progress"] = _clean_progress(args.get("progress"))
    elif new_column == "pronto":
        card["progress"] = 100
    elif old_column != new_column:
        delta = 20 if AGORA_COLUMNS.index(new_column) > AGORA_COLUMNS.index(_clean_column(old_column)) else -20
        card["progress"] = _clean_progress(card.get("progress", 0) + delta)
    card["updated_at"] = _now()
    _event(board, "card_moved", card_id, {"from": old_column, "to": new_column})
    return {"ok": True, "card": _public_card(card)}


def _handle_comment(board: Dict[str, Any], card_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
    if card_id not in board["cards"]:
        raise KeyError(f"card {card_id} not found")
    body = _clean_text(args.get("body"), "", 2000)
    if not body:
        raise ValueError("body is required for comment")
    comment = {
        "author": _clean_text(args.get("author"), "agent", 80),
        "body": body,
        "created_at": _now(),
    }
    board["comments"].setdefault(card_id, []).append(comment)
    board["cards"][card_id]["updated_at"] = _now()
    _event(board, "comment_added", card_id, {"author": comment["author"]})
    return {"ok": True, "comment": comment, "card": _public_card(board["cards"][card_id])}


def _handle_remove(board: Dict[str, Any], card_id: str) -> Dict[str, Any]:
    if card_id not in board["cards"]:
        raise KeyError(f"card {card_id} not found")
    card = board["cards"].pop(card_id)
    board["comments"].pop(card_id, None)
    _event(board, "card_removed", card_id, {"title": card.get("title")})
    return {"ok": True, "removed": card_id}


def agora_tool(action: str = "list", card_id: Optional[str] = None, **args: Any) -> str:
    """Read or mutate the persistent Agora board."""
    action = str(action or "list").strip().lower()
    if action not in AGORA_ACTIONS:
        return tool_error(f"unknown agora action '{action}'. Use one of: {', '.join(sorted(AGORA_ACTIONS))}")

    try:
        with _BoardLock(_board_path().with_suffix(".lock")):
            board = _read_board()
            if action == "list":
                result = _handle_list(board)
            elif action == "show":
                if not card_id:
                    return tool_error("card_id is required for show")
                result = _handle_show(board, card_id)
            elif action == "create":
                create_args = dict(args)
                if card_id and not create_args.get("card_id"):
                    create_args["card_id"] = card_id
                result = _handle_create(board, create_args)
                _write_board(board)
            elif action == "update":
                if not card_id:
                    return tool_error("card_id is required for update")
                result = _handle_update(board, card_id, args)
                _write_board(board)
            elif action == "move":
                if not card_id:
                    return tool_error("card_id is required for move")
                result = _handle_move(board, card_id, args)
                _write_board(board)
            elif action == "comment":
                if not card_id:
                    return tool_error("card_id is required for comment")
                result = _handle_comment(board, card_id, args)
                _write_board(board)
            elif action == "remove":
                if not card_id:
                    return tool_error("card_id is required for remove")
                result = _handle_remove(board, card_id)
                _write_board(board)
            else:  # pragma: no cover
                return tool_error(f"unsupported action {action}")
        return json.dumps(result, ensure_ascii=False)
    except Exception as exc:
        return tool_error(f"agora: {exc}")


def check_agora_requirements() -> bool:
    return True


AGORA_SCHEMA = {
    "name": "agora",
    "description": (
        "Manage the persistent Lex Agora Kanban board for multi-agent legal work. "
        "Use it to create durable cards, move work through Entrada, Especificacao, "
        "Execucao, Revisao, and Pronto, and leave handoff comments."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": sorted(AGORA_ACTIONS),
                "description": "Operation to perform. Omit for list.",
            },
            "card_id": {"type": "string", "description": "Card id for show/update/move/comment/remove."},
            "title": {"type": "string", "description": "Card title for create/update."},
            "summary": {"type": "string", "description": "Short card body or handoff summary."},
            "column": {
                "type": "string",
                "enum": AGORA_COLUMNS,
                "description": "Target column for create/update/move.",
            },
            "direction": {"type": "integer", "description": "Move relative to current column: -1 previous, 1 next."},
            "type": {"type": "string", "description": "Card category, e.g. PJe, Analise, Peca."},
            "agent": {"type": "string", "description": "Responsible agent/profile."},
            "guardrail": {"type": "string", "description": "Human review or safety checkpoint."},
            "priority": {"type": "string", "enum": AGORA_PRIORITIES},
            "progress": {"type": "integer", "minimum": 0, "maximum": 100},
            "body": {"type": "string", "description": "Comment body for action=comment."},
            "author": {"type": "string", "description": "Comment author for action=comment."},
        },
        "required": [],
    },
}


registry.register(
    name="agora",
    toolset="agora",
    schema=AGORA_SCHEMA,
    handler=lambda args, **kw: agora_tool(**args),
    check_fn=check_agora_requirements,
    emoji="AG",
)
