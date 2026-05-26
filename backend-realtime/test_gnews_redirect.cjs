const axios = require('axios');
axios.get('https://news.google.com/rss/articles/CBMinAFBVV95cUxON01PbkdWXy1wU3dLOVFkbEdnLTFiY241cnFtWmZkUGs1MUNRU0ljUmo2RjZsZlZUQjBxcjNZc0o2NGdVUEQ1bUhyY1BxLS1CRnVxampPOE5Dc2xmTG1YY0VhUWNvOWRGazk0V1FLMFFMY2N0cHBQNmFSaGVsSnZhb1N1dUxzZ0RrekxXZlQ1TDJ6a1RKTlpUVkxmNmM?oc=5', { timeout: 10000 })
  .then(r => console.log("Final URL:", r.request.res.responseUrl))
  .catch(e => console.error(e.message));
