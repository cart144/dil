const http = require('http');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const PORT = 4311;
const HOST = '127.0.0.1';
const DB_PATH = path.join(__dirname, 'db.sqlite');
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

// Initialize database
const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// Simple token store (in-memory for demo)
const tokens = new Map();

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  const contentTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json'
  };
  const contentType = contentTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const method = req.method;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health endpoint
  if (url.pathname === '/health' && method === 'GET') {
    return sendJson(res, 200, { status: 'ok' });
  }

  // Register endpoint
  if (url.pathname === '/api/register' && method === 'POST') {
    try {
      const { email, password } = await parseBody(req);
      if (!email || !password) {
        return sendJson(res, 400, { error: 'email and password required' });
      }

      const passwordHash = hashPassword(password);
      try {
        const stmt = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)');
        stmt.run(email, passwordHash);
        return sendJson(res, 200, { ok: true, message: 'User registered' });
      } catch (e) {
        if (e.message.includes('UNIQUE constraint')) {
          return sendJson(res, 409, { error: 'User already exists' });
        }
        throw e;
      }
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // Login endpoint
  if (url.pathname === '/api/login' && method === 'POST') {
    try {
      const { email, password } = await parseBody(req);
      if (!email || !password) {
        return sendJson(res, 400, { error: 'email and password required' });
      }

      const passwordHash = hashPassword(password);
      const stmt = db.prepare('SELECT id, email FROM users WHERE email = ? AND password_hash = ?');
      const user = stmt.get(email, passwordHash);

      if (!user) {
        return sendJson(res, 401, { error: 'Invalid credentials' });
      }

      const token = generateToken();
      tokens.set(token, { userId: user.id, email: user.email });

      return sendJson(res, 200, { ok: true, token });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // Me endpoint
  if (url.pathname === '/api/me' && method === 'GET') {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendJson(res, 401, { error: 'No token provided' });
    }

    const token = authHeader.slice(7);
    const userData = tokens.get(token);

    if (!userData) {
      return sendJson(res, 401, { error: 'Invalid token' });
    }

    return sendJson(res, 200, { ok: true, email: userData.email, userId: userData.userId });
  }

  // Serve frontend files
  if (method === 'GET') {
    let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
    const fullPath = path.join(FRONTEND_DIR, filePath);

    // Security: ensure path is within frontend dir
    if (fullPath.startsWith(FRONTEND_DIR)) {
      return serveStatic(res, fullPath);
    }
  }

  // 404 for everything else
  res.writeHead(404);
  res.end('Not Found');
}

const server = http.createServer(handleRequest);

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}/`);
});
