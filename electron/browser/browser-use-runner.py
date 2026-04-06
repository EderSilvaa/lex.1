#!/usr/bin/env python3
"""
LEX Browser-Use Runner
Executa uma task via browser-use conectando ao Chrome existente via CDP.
Saída: JSON lines para stdout (compatível com browser-use-executor.ts).

Uso:
  python browser-use-runner.py \
    --cdp-url http://localhost:19222 \
    --provider anthropic \
    --model claude-haiku-4-5-20251001 \
    --api-key sk-ant-... \
    --max-steps 15 \
    --task "texto da tarefa"
"""

import asyncio
import argparse
import json
import sys
import os
import traceback

# ── Arg parsing ───────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument('--cdp-url',   default='http://localhost:19222')
    p.add_argument('--provider',  default='anthropic')
    p.add_argument('--model',     required=True)
    p.add_argument('--api-key',   required=True)
    p.add_argument('--max-steps', type=int, default=15)
    p.add_argument('--task',      required=True)
    return p.parse_args()

# ── JSON output helpers ───────────────────────────────────────────────────────

def emit(obj: dict):
    """Emite uma linha JSON para stdout — lida pelo executor Node.js."""
    print(json.dumps(obj, ensure_ascii=False), flush=True)

def emit_step(step_number: int, description: str, action: str = '', selector: str = '', url: str = ''):
    emit({
        'step_number': step_number,
        'description': description,
        'action': action,
        'selector': selector,
        'url': url,
    })

def emit_result(result: str):
    emit({'result': result})

def emit_error(msg: str):
    emit({'error': msg})
    print(f'[BrowserUseRunner] ERRO: {msg}', file=sys.stderr, flush=True)

# ── LLM factory ──────────────────────────────────────────────────────────────

def build_llm(provider: str, model: str, api_key: str):
    """Instancia o LLM correto baseado no provider ativo da LEX."""
    if provider == 'anthropic':
        from browser_use.llm import ChatAnthropic
        return ChatAnthropic(model=model, api_key=api_key)

    if provider == 'openai':
        from browser_use.llm import ChatOpenAI
        return ChatOpenAI(model=model, api_key=api_key)

    if provider == 'openrouter':
        from browser_use.llm import ChatOpenAI
        return ChatOpenAI(
            model=model,
            api_key=api_key,
            base_url='https://openrouter.ai/api/v1',
        )

    if provider == 'ollama':
        from browser_use.llm import ChatOpenAI
        return ChatOpenAI(
            model=model,
            api_key=api_key or 'ollama',
            base_url='http://localhost:11434/v1',
        )

    if provider == 'google':
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
            return ChatGoogleGenerativeAI(model=model, google_api_key=api_key)
        except ImportError:
            raise RuntimeError('pip install langchain-google-genai')

    if provider == 'groq':
        try:
            from langchain_groq import ChatGroq
            return ChatGroq(model=model, api_key=api_key)
        except ImportError:
            raise RuntimeError('pip install langchain-groq')

    # fallback: tenta Anthropic
    from browser_use.llm import ChatAnthropic
    return ChatAnthropic(model=model, api_key=api_key)

# ── Step callback ─────────────────────────────────────────────────────────────

def make_step_callback():
    """Retorna callback que emite progresso a cada step do agente."""
    step_counter = [0]

    def on_step(state, output, step_n):
        step_counter[0] += 1
        try:
            # Pega a action e selector do último output
            action_name = ''
            selector = ''
            if output and output.action:
                actions = output.action if isinstance(output.action, list) else [output.action]
                if actions:
                    first = actions[0]
                    action_name = type(first).__name__.lower().replace('action', '')
                    # Tenta extrair selector do modelo pydantic
                    data = first.model_dump() if hasattr(first, 'model_dump') else {}
                    selector = str(data.get('selector', data.get('css_selector', data.get('index', ''))))

            description = ''
            if state and hasattr(state, 'tabs') and state.tabs:
                description = f"[{state.tabs[0].url[:60]}] " if state.tabs else ''
            if output and hasattr(output, 'current_state') and output.current_state:
                cs = output.current_state
                description += getattr(cs, 'thought', '') or getattr(cs, 'summary', '') or ''

            if not description:
                description = f'Step {step_counter[0]}'

            emit_step(
                step_number=step_counter[0],
                description=description[:200],
                action=action_name,
                selector=selector[:100],
                url=state.tabs[0].url if (state and hasattr(state, 'tabs') and state.tabs) else '',
            )
        except Exception as e:
            emit_step(step_counter[0], f'Step {step_counter[0]}')

    return on_step

# ── Main ──────────────────────────────────────────────────────────────────────

async def run(args):
    from browser_use import Agent
    from browser_use.browser.session import BrowserSession

    # Conecta ao Chrome existente (já aberto pelo pje_abrir)
    browser_session = BrowserSession(
        cdp_url=args.cdp_url,
        is_local=True,
        keep_alive=True,   # não fecha Chrome ao terminar
    )

    llm = build_llm(args.provider, args.model, args.api_key)

    agent = Agent(
        task=args.task,
        llm=llm,
        browser_session=browser_session,
        max_failures=3,
        use_vision=True,
        register_new_step_callback=make_step_callback(),
        generate_gif=False,
    )

    history = await agent.run(max_steps=args.max_steps)

    final = history.final_result()

    # Verifica se houve erros (LLM failure, timeout, etc.)
    errs = history.errors() if callable(history.errors) else (history.errors or [])
    if errs and not final:
        errors_str = '; '.join(str(e) for e in list(errs)[:3])
        emit_error(f'Agent falhou: {errors_str}')
        sys.exit(1)

    emit_result(final or 'Tarefa concluída sem resultado extraído.')

async def main():
    args = parse_args()
    try:
        await run(args)
    except Exception as e:
        emit_error(f'{type(e).__name__}: {e}')
        print(traceback.format_exc(), file=sys.stderr, flush=True)
        sys.exit(1)

if __name__ == '__main__':
    asyncio.run(main())
