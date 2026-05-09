import json


def test_agora_create_move_comment_and_list(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))

    from tools.agora_tool import agora_tool

    created = json.loads(agora_tool(
        action="create",
        card_id="card-1",
        title="Consultar processo",
        summary="Coletar documentos no PJe",
        column="entrada",
        priority="Alta",
    ))

    assert created["ok"] is True
    assert created["card"]["id"] == "card-1"
    assert created["card"]["column"] == "entrada"

    moved = json.loads(agora_tool(action="move", card_id="card-1", direction=1))

    assert moved["ok"] is True
    assert moved["card"]["column"] == "especificacao"

    commented = json.loads(agora_tool(
        action="comment",
        card_id="card-1",
        author="tester",
        body="Separar documentos principais.",
    ))

    assert commented["ok"] is True
    assert commented["comment"]["author"] == "tester"

    shown = json.loads(agora_tool(action="show", card_id="card-1"))
    assert shown["card"]["comments"][0]["body"] == "Separar documentos principais."
    assert shown["events"]

    listed = json.loads(agora_tool(action="list"))
    assert listed["summary"]["total"] == 1
    assert listed["summary"]["especificacao"] == 1


def test_agora_validates_missing_card_id(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))

    from tools.agora_tool import agora_tool

    result = json.loads(agora_tool(action="move"))

    assert result["error"]
    assert "card_id is required" in result["error"]
