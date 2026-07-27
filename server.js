/* Pitch Legends — tiny static server (no dependencies).
   Serves ./public on process.env.PORT (Render sets this) or 3000 locally. */

var http = require('http');
var fs = require('fs');
var path = require('path');

var PORT = process.env.PORT || 3000;
var ROOT = path.join(__dirname, 'public');

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

function safeJoin(root, urlPath) {
  var decoded = decodeURIComponent(urlPath.split('?')[0]);
  var resolved = path.normalize(path.join(root, decoded));
  if (resolved.indexOf(root) !== 0) return root; // block path traversal
  return resolved;
}

var server = http.createServer(function (req, res) {
  var filePath = safeJoin(ROOT, req.url === '/' ? '/index.html' : req.url);

  fs.stat(filePath, function (err, stat) {
    if (err || !stat) {
      // SPA-style fallback to index.html for unknown routes (not files)
      filePath = path.join(ROOT, 'index.html');
    } else if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    fs.readFile(filePath, function (err2, data) {
      if (err2) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }
      var ext = path.extname(filePath).toLowerCase();
      var type = MIME[ext] || 'application/octet-stream';
      var headers = { 'Content-Type': type };
      // service worker must never be cached long-term
      if (filePath.endsWith('sw.js')) {
        headers['Cache-Control'] = 'no-cache';
      } else if (ext === '.html' || ext === '.webmanifest') {
        headers['Cache-Control'] = 'no-cache';
      } else {
        headers['Cache-Control'] = 'public, max-age=3600';
      }
      res.writeHead(200, headers);
      res.end(data);
    });
  });
});

server.listen(PORT, function () {
  console.log('Pitch Legends running at http://localhost:' + PORT);
});
