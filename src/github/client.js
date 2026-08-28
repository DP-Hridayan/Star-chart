const https = require('https');

function fetchFromGitHub(path, token, acceptHeader) {
  return new Promise((resolve, reject) => {
    const requestOptions = {
      hostname: 'api.github.com',
      path,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: acceptHeader || 'application/vnd.github+json',
        'User-Agent': 'dp-star-chart/1.0',
      },
    };

    const req = https.request(requestOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`JSON parse error: ${body.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

module.exports = {
  fetchFromGitHub,
};
