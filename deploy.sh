#!/bin/bash
# Script de deploy rápido da Edge Function

echo "🚀 LEX - Deploy da Edge Function"
echo ""

# Verificar se Supabase CLI está instalado
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI não encontrado!"
    echo "📦 Instalando Supabase CLI..."
    npm install -g supabase
fi

echo "🔗 Verificando link com projeto..."
supabase link --project-ref nspauxzztflgmxjgevmo

echo ""
echo "🚀 Fazendo deploy da função..."
supabase functions deploy analisar-processo-completo

echo ""
echo "✅ Deploy concluído!"
echo ""
echo "📋 Próximos passos:"
echo "1. Configure a OPENAI_API_KEY no Supabase Dashboard"
echo "2. Recarregue a extensão no Chrome"
echo "3. Teste a análise completa!"
echo ""
echo "🔗 URL: https://nspauxzztflgmxjgevmo.supabase.co/functions/v1/analisar-processo-completo"