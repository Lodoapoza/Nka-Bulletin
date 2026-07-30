const http = require('http');
const options = { hostname: 'localhost', port: process.env.PORT || 4000, path: '/api/health', timeout: 5000 };
const req = http.get(options, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.ok) { console.log('HEALTHCHECK OK'); process.exit(0); }
      else { console.error('HEALTHCHECK FAIL:', data); process.exit(1); }
    } catch (e) { console.error('HEALTHCHECK FAIL: réponse invalide:', data); process.exit(1); }
  });
});
req.on('error', (e) => { console.error('HEALTHCHECK FAIL:', e.message); process.exit(1); });
req.end();
