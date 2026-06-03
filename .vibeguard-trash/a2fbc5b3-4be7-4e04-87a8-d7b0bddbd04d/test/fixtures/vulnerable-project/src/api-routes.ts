import express from 'express';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import helmet from 'helmet';

const app = express();

// Security headers middleware
app.use(helmet());
app.use(express.json());

// CSRF token store and middleware
const csrfTokens = new Map<string, string>();

function generateCsrfToken(sessionId: string): string {
  const token = randomUUID();
  csrfTokens.set(sessionId, token);
  return token;
}

function csrfProtection(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const sessionId = req.headers['x-session-id'] as string;
    const token = req.headers['x-csrf-token'] as string;
    if (!sessionId || !token || csrfTokens.get(sessionId) !== token) {
      res.status(403).json({ error: 'Invalid CSRF token' });
      return;
    }
  }
  next();
}

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function rateLimit(maxRequests: number, windowMs: number) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const entry = rateLimitMap.get(key);
    if (!entry || now > entry.resetTime) {
      rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    } else if (entry.count >= maxRequests) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    } else {
      entry.count++;
    }
    next();
  };
}

// Login endpoint with brute-force protection
app.post('/login', rateLimit(5, 60000), csrfProtection, (req, res) => {
  const { username, password } = req.body;
  authenticate(username, password);
  res.json({ ok: true });
});

// OTP sender with rate limiting
app.post('/send-otp', rateLimit(3, 60000), csrfProtection, (req, res) => {
  sendOtp(req.body.phone);
  res.json({ sent: true });
});

// FIXED: SQL injection — use parameterized query
function getUser(db: any, id: string) {
  return db.query('SELECT * FROM users WHERE id = $1', [id]);
}

// FIXED: Command injection — use execFile with args array
app.get('/ping', (req, res) => {
  const host = String(req.query.host || '');
  execFile('ping', ['-c', '4', host], (err, stdout) => {
    if (err) {
      res.status(500).send('Ping failed');
      return;
    }
    res.send(stdout);
  });
});

// FIXED: Path traversal — normalize and validate against allowed base directory
const ALLOWED_BASE_DIR = path.resolve('/app/allowed-files');

app.get('/file', async (req, res) => {
  const requestedPath = path.resolve(ALLOWED_BASE_DIR, req.query.path as string);
  if (!requestedPath.startsWith(ALLOWED_BASE_DIR + path.sep) && requestedPath !== ALLOWED_BASE_DIR) {
    res.status(403).send('Access denied');
    return;
  }
  const content = await readFile(requestedPath, 'utf-8');
  res.send(content);
});

// FIXED: SSRF — validate URL against allowlist and block internal ranges
const ALLOWED_FETCH_DOMAINS = ['api.example.com', 'data.example.org'];
const BLOCKED_HOSTNAMES = ['localhost', '127.0.0.1', '0.0.0.0', 'metadata.google.internal'];

app.get('/fetch', async (req, res) => {
  try {
    const url = new URL(req.query.url as string);
    if (!ALLOWED_FETCH_DOMAINS.includes(url.hostname)) {
      res.status(403).json({ error: 'Domain not allowed' });
      return;
    }
    if (BLOCKED_HOSTNAMES.includes(url.hostname) || url.hostname.startsWith('169.254.')) {
      res.status(403).json({ error: 'Internal URLs not allowed' });
      return;
    }
    const data = await fetch(url.toString());
    res.json(await data.json());
  } catch (e) {
    res.status(400).json({ error: 'Invalid URL' });
  }
});

// FIXED: Open redirect — validate against allowlist
const REDIRECT_ALLOWLIST = ['/dashboard', '/home', '/profile', '/settings'];

app.get('/redirect', (req, res) => {
  const target = req.query.to as string;
  if (!REDIRECT_ALLOWLIST.includes(target)) {
    res.status(403).json({ error: 'Redirect target not allowed' });
    return;
  }
  res.redirect(target);
});

// FIXED: eval replaced with safe explicit calculation logic
app.post('/calc', csrfProtection, (req, res) => {
  try {
    const { a, b, op } = req.body;
    if (typeof a !== 'number' || typeof b !== 'number') {
      res.status(400).json({ error: 'Invalid operands' });
      return;
    }
    let result: number;
    switch (op) {
      case '+': result = a + b; break;
      case '-': result = a - b; break;
      case '*': result = a * b; break;
      case '/': result = b !== 0 ? a / b : NaN; break;
      default:
        res.status(400).json({ error: 'Invalid operator' });
        return;
    }
    res.json({ result });
  } catch (e) {
    res.status(400).json({ error: 'Invalid request' });
  }
});

// FIXED: Weak crypto — use SHA-256 (NOTE: use bcrypt/argon2 for production password hashing)
function hashPassword(password: string) {
  return createHash('sha256').update(password).digest('hex');
  // TODO: Replace with bcrypt or argon2 for proper password hashing:
  // return await bcrypt.hash(password, 12);
}

// FIXED: Insecure randomness — use cryptographically secure random UUID
function generateToken() {
  return randomUUID();
}

// FIXED: Mass assignment — whitelist allowed profile fields
const ALLOWED_PROFILE_FIELDS = ['name', 'email', 'bio', 'avatar'];

app.put('/profile', csrfProtection, (req, res) => {
  const safeData: Record<string, unknown> = {};
  for (const field of ALLOWED_PROFILE_FIELDS) {
    if (field in req.body) {
      safeData[field] = req.body[field];
    }
  }
  updateUser(safeData);
  res.json({ updated: true });
});

declare function authenticate(u: string, p: string): void;
declare function sendOtp(phone: string): void;
declare function updateUser(data: unknown): void;

export { app, getUser, hashPassword, generateToken };
