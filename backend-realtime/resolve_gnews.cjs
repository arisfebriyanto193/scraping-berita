const axios = require('axios');

async function resolveGNewsUrl(gnewsUrl) {
    try {
        const res = await axios.get(gnewsUrl);
        // Usually the real URL is inside <a href="..."> or <c-wiz data-n-v="...">
        let match = res.data.match(/<a[^>]+href="([^"]+)"/i);
        if (!match) {
            match = res.data.match(/data-n-v="([^"]+)"/i);
        }
        if (match) {
            console.log('Real URL:', match[1]);
        } else {
            console.log('Could not find URL in HTML');
        }
    } catch (err) {
        console.error(err.message);
    }
}

resolveGNewsUrl('https://news.google.com/rss/articles/CBMiygFBVV95cUxQRDQ5MFpQTWM4TXJzYnlkSEZldThsanZEV1N6Z3ZoX3hFd1B3QmJ5N3FSREtMRUtnSG5CdkR3X1lvdkljQnNtSkRuWGxBdkM5SEx2MzBVWDc3Y3pYcWJPV0M2dW1uXzJxaXA3M3hDbTQ1MUFXbXNfSE5zbGI5cEZBNnRFZGFMeTNxa0ZXVUR4aFgzRXpUcGpZekVrdTVWYWlJd18wUTdNODFXY2o5UVZ2YmJaLTItZDdZRlphTzlscXRpSzdtX2ZrU1RB0gHPAUFVX3lxTE8wWk0yZDJ1U2pLU0pWYmJTWDFvVVlDWEdlNHJCR25HT0Y0Sm1KNVFHQ2hLZ2ZKcjRMSzZpeThqNkR6MWc3ZFZoQU80WV9SNC1GZTVrcFl4alBmZnE4eEJacEJUNkJ5QUp2VG5jdi0tQ0NDLVJSWFpTdWJvWFhEb0hzNXdNdDQxVGhuTU9aTm51VlJDdjZJSjJ6LXh0SVZ5TWNzdGRPd0dsOVJYZHZXbThSeXN6ZWN5aXlSODlHRFljRS1wcjlfaTRrQmQ1YWxITQ?oc=5');
