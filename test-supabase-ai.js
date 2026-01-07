// Native fetch is used

const SUPABASE_URL = 'https://nspauxzztflgmxjgevmo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zcGF1eHp6dGZsZ214amdldm1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ2MTI4ODUsImV4cCI6MjA3MDE4ODg4NX0.XXJf6alnb6me4PeMCA80UmfJVUZo8VxA0BFDdFCtN1A';
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/OPENIA`;

const fs = require('fs');

async function testAI() {
    console.log('Testing AI Connection...');
    try {
        const response = await fetch(FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'apikey': SUPABASE_KEY
            },
            body: JSON.stringify({
                pergunta: 'Olá, você está funcionando?',
                contexto: 'Teste de conexão'
            })
        });

        let resultData = {};
        if (!response.ok) {
            const text = await response.text();
            resultData = { success: false, status: response.status, error: text };
        } else {
            const data = await response.json();
            resultData = { success: true, data: data };
        }

        fs.writeFileSync('test_result.json', JSON.stringify(resultData, null, 2));
        console.log('Test complete. Result written to test_result.json');

    } catch (error) {
        fs.writeFileSync('test_result.json', JSON.stringify({ success: false, error: error.message }, null, 2));
        console.error('Connection failed:', error);
    }
}

testAI();
