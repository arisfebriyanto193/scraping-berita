import { scrapeDetik } from './src/scrapers/detik.js';
import { scrapeKompas } from './src/scrapers/kompas.js';
import { scrapeCNN } from './src/scrapers/cnn.js';
import { scrapeTempo } from './src/scrapers/tempo.js';

async function testAll() {
    const query = 'harga sawit';
    console.log('Testing Kompas...');
    const kompas = await scrapeKompas(query, 3);
    console.log('Kompas found:', kompas.length);

    console.log('\nTesting CNN...');
    const cnn = await scrapeCNN(query, 3);
    console.log('CNN found:', cnn.length);

    console.log('\nTesting Tempo...');
    const tempo = await scrapeTempo(query, 3);
    console.log('Tempo found:', tempo.length);

    console.log('\nTesting Detik...');
    const detik = await scrapeDetik(query, 3);
    console.log('Detik found:', detik.length);
}

testAll();
