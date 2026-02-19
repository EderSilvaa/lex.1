/**
 * Test Agent Loop
 *
 * Script de teste para demonstrar o Agent Loop funcionando.
 * Execute com: npx ts-node electron/agent/test-agent.ts
 */

import { initializeAgent, runAgentLoop, agentEmitter, getDefaultTenantConfig } from './index';

// Escuta eventos do agente
agentEmitter.on('agent-event', (event) => {
    switch (event.type) {
        case 'started':
            console.log('\n🚀 Agent iniciado');
            console.log(`   Run ID: ${event.runId}`);
            console.log(`   Objetivo: ${event.objetivo}`);
            break;

        case 'thinking':
            console.log(`\n🧠 Pensando (iteração ${event.iteracao}):`);
            console.log(`   ${event.pensamento}`);
            break;

        case 'acting':
            console.log(`\n🔧 Executando skill: ${event.skill}`);
            console.log(`   Params: ${JSON.stringify(event.parametros)}`);
            break;

        case 'criticizing':
            console.log(`\n🛡️ Critic: ${event.decision.approved ? 'Aprovado' : 'Bloqueado'} (${event.decision.riskLevel})`);
            console.log(`   ${event.decision.reason}`);
            break;

        case 'tool_result':
            const status = event.resultado.sucesso ? '✅' : '❌';
            console.log(`\n${status} Resultado de ${event.skill}:`);
            if (event.resultado.mensagem) {
                console.log(`   ${event.resultado.mensagem}`);
            }
            break;

        case 'observing':
            console.log(`\n👁️ Observação: ${event.observacao}`);
            break;

        case 'completed':
            console.log('\n════════════════════════════════════════');
            console.log('✅ OBJETIVO COMPLETO');
            console.log(`   Passos: ${event.passos}`);
            console.log(`   Duração: ${event.duracao}ms`);
            console.log('════════════════════════════════════════');
            console.log('\n📝 Resposta:');
            console.log(event.resposta);
            break;

        case 'error':
            console.error(`\n❌ Erro: ${event.erro}`);
            break;

        case 'waiting_user':
            console.log(`\n❓ Pergunta: ${event.pergunta}`);
            if (event.opcoes) {
                console.log(`   Opções: ${event.opcoes.join(', ')}`);
            }
            break;

        case 'timeout':
            console.log('\n⏰ Timeout atingido');
            break;
    }
});

// Testes
async function runTests() {
    console.log('═══════════════════════════════════════════════════');
    console.log('        LEX AGENT LOOP - TESTE');
    console.log('═══════════════════════════════════════════════════');

    // Inicializa agent com skills mock
    await initializeAgent();

    // Config do tenant (exemplo)
    const tenantConfig = {
        ...getDefaultTenantConfig(),
        identity: {
            tenantId: 'teste',
            agentName: 'Laura',
            firmName: 'Escritório Teste',
            greeting: 'Olá! Sou a Laura, como posso ajudar?'
        },
        behavior: {
            style: 'semiformal' as const,
            techLevel: 'basico' as const,
            tone: 'empatico' as const,
            depth: 'normal' as const
        }
    };

    // Teste 1: Consulta de processo
    console.log('\n\n📋 TESTE 1: Consultar processo');
    console.log('───────────────────────────────────────────────────');

    try {
        const resultado1 = await runAgentLoop(
            'Consulte o processo 0000123-45.2024.8.14.0001 e me dê um resumo',
            { verbose: false, maxIterations: 5 },
            tenantConfig
        );
        console.log('\n📄 Resultado final:', resultado1);
    } catch (error: any) {
        console.error('Erro no teste 1:', error.message);
    }

    // Teste 2: Calcular prazo
    console.log('\n\n📋 TESTE 2: Calcular prazo');
    console.log('───────────────────────────────────────────────────');

    try {
        const resultado2 = await runAgentLoop(
            'Qual o prazo de 15 dias úteis a partir de hoje?',
            { verbose: false, maxIterations: 3 },
            tenantConfig
        );
        console.log('\n📄 Resultado final:', resultado2);
    } catch (error: any) {
        console.error('Erro no teste 2:', error.message);
    }

    // Teste 3: Pergunta simples (sem skill)
    console.log('\n\n📋 TESTE 3: Pergunta simples');
    console.log('───────────────────────────────────────────────────');

    try {
        const resultado3 = await runAgentLoop(
            'O que você pode fazer?',
            { verbose: false, maxIterations: 2 },
            tenantConfig
        );
        console.log('\n📄 Resultado final:', resultado3);
    } catch (error: any) {
        console.error('Erro no teste 3:', error.message);
    }

    console.log('\n\n═══════════════════════════════════════════════════');
    console.log('        TESTES CONCLUÍDOS');
    console.log('═══════════════════════════════════════════════════\n');
}

// Executa se for o arquivo principal
if (require.main === module) {
    runTests().catch(console.error);
}

export { runTests };
