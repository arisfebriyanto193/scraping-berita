import { scrapeCNN } from './src/scrapers/cnn.js';
import { scrapeTempo } from './src/scrapers/tempo.js';
import { scrapeKompas } from './src/scrapers/kompas.js';

async function test() {
  console.log("Testing CNN...");
  const cnn = await scrapeCNN('olahraga');
  console.log("CNN Results:", cnn.length);

  console.log("Testing Tempo...");
  const tempo = await scrapeTempo('olahraga');
  console.log("Tempo Results:", tempo.length);

  console.log("Testing Kompas...");
  const kompas = await scrapeKompas('olahraga');
  console.log("Kompas Results:", kompas.length);
}
test();
