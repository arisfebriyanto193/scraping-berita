const fs = require('fs');

const cnn = fs.readFileSync('cnn_search2.html', 'utf8');
const cnnMatches = cnn.match(/href="([^"]+)"/g) || [];
console.log('CNN links:', cnnMatches.filter(h => h.includes('cnnindonesia.com')).slice(0, 30));

const tempo = fs.readFileSync('tempo_search2.html', 'utf8');
const tempoMatches = tempo.match(/href="([^"]+)"/g) || [];
console.log('Tempo links:', tempoMatches.filter(h => h.includes('tempo.co')).slice(0, 30));
