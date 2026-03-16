const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'electron', 'agent', 'think.ts');
let content = fs.readFileSync(filePath, 'utf8');

// The anchor: the strongest bias rule in ASCII - right after this we inject the disambiguation exception
const anchor = '- NUNCA responda apenas com instrucoes textuais quando ha uma skill que executa a acao.';

const idx = content.indexOf(anchor);
if (idx === -1) {
    console.log('Anchor not found!');
    process.exit(1);
}

const afterAnchor = idx + anchor.length;

const injection = `
- EXCECAO CRITICA - TERMOS AMBIGUOS: As palavras "pastas", "arquivos", "documentos" podem referir-se ao PC Windows OU ao PJe. Se o usuario nao mencionar explicitamente PJe, tribunal, processo ou numero de processo, use tipo=pergunta ANTES de qualquer skill. Exemplo: "pode acessar minhas pastas?" -> tipo=pergunta perguntando se e PC ou PJe.`;

// Insert after the anchor
content = content.slice(0, afterAnchor) + injection + content.slice(afterAnchor);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Injection done. Verifying...');

const verify = fs.readFileSync(filePath, 'utf8');
const verifyIdx = verify.indexOf('EXCECAO CRITICA');
if (verifyIdx === -1) {
    console.log('VERIFICATION FAILED');
    process.exit(1);
}
console.log('SUCCESS:', verify.slice(verifyIdx, verifyIdx + 100));
