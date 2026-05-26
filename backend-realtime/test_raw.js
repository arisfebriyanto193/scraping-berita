import axios from 'axios';
async function run() {
  const cnn = await axios.get('https://www.cnnindonesia.com/search?query=jokowi', { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
  console.log("CNN contains 'jokowi' links?", cnn.data.includes('jokowi'));
  const tempo = await axios.get('https://www.tempo.co/search?q=jokowi', { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
  console.log("Tempo contains 'jokowi' links?", tempo.data.includes('jokowi'));
}
run();
