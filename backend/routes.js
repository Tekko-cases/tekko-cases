// backend/routes.js (full replacement with agent auto-create; minimal, focused changes)
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const User = require('./models/User');
const Case = require('./models/Case');
const Counter = require('./models/Counter');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const SEED_SECRET = process.env.SEED_SECRET || 'dev-seed';
const ISSUE_TYPES = ['Plans', 'Billing', 'Technical', 'Activation', 'Shipping', 'Other'];
const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];

// ---------- Health ----------
router.get(['/health', '/healthz'], (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ---------- Auth middleware ----------
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
const esc = (s='') => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------- Login (email + passwordHash) ----------
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const emailIn = String(email || '').toLowerCase().trim();
    const passIn = String(password || '');
    if (!emailIn || !passIn) return res.status(400).json({ error: 'Email and password are required' });

    const user = await User.findOne({ email: emailIn, active: true });
    if (!(user && user.passwordHash)) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(passIn, user.passwordHash || '');
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user._id, email: user.email, name: user.name, role: user.role || 'agent' },
      JWT_SECRET,
      { expiresIn: '10d' }
    );
    res.json({ token, user: { name: user.name, email: user.email, role: user.role || 'agent' } });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ---------- Login by NAME (auto-create allowed agents) ----------
router.post('/login-name', async (req, res) => {
  try {
    const { username, name, password } = req.body || {};
    const identRaw = String(username || name || '').trim();
    const passIn = String(password || '');
    if (!identRaw || !passIn) return res.status(400).json({ error: 'Name and password are required' });

    const identLower = identRaw.toLowerCase();
    const allowed = (process.env.AGENT_NAMES || 'Sheindy,Chayelle,Yenti,Tzivi,Roisy,Toby,Blimi')
      .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

// First try derived seed email (toby@agents.local, etc.)
const emailAuto = `${identLower}@agents.local`;
let user = await User.findOne({ email: emailAuto, active: true });

// If not found by email, fall back to name (case-insensitive)
if (!user) {
  user =
    (await User.findOne({ active: true, name: { $regex: `^${esc(identRaw)}$`, $options: 'i' } })) ||
    (await User.findOne({ active: true, name: { $regex: esc(identRaw), $options: 'i' } }));
}

// Auto-create if still missing and allowed
if (!user && allowed.includes(identLower)) {
  user = await User.create({
    name: identRaw,
    email: emailAuto,
    role: 'agent',
    active: true,
    passwordHash: await bcrypt.hash(passIn, 10),
  });
}

    if (!(user && user.passwordHash) || user.active === false) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(passIn, user.passwordHash || '');
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user._id, email: user.email, name: user.name, role: user.role || 'agent' },
      JWT_SECRET,
      { expiresIn: '10d' }
    );
    res.json({ token, user: { name: user.name, email: user.email, role: user.role || 'agent' } });
  } catch (e) {
    console.error('login-name error:', e);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ---------- Optional: seed agents (GET; supports /api/... too) ----------
async function seedAgents(req, res) {
  try {
    if ((req.query.secret || '') !== SEED_SECRET) return res.status(403).json({ error: 'Forbidden' });
    const pw = String(req.query.pw || 'Assistly1!');
    const names = (process.env.AGENT_NAMES || 'Sheindy,Chayelle,Yenti,Tzivi,Roisy,Toby,Blimi')
      .split(',').map(s => s.trim()).filter(Boolean);
    const out = [];
    for (const name of names) {
      const email = `${name.toLowerCase()}@agents.local`;
      let u = await User.findOne({ email });
      if (!u) u = new User({ name, email, role: 'agent', active: true });
      u.name = name; u.role = 'agent'; u.active = true;
      u.passwordHash = await bcrypt.hash(pw, 10);
      await u.save();
      out.push({ name: u.name, email: u.email, role: u.role });
    }
    res.json({ ok: true, seeded: out.length, users: out });
  } catch (e) {
    console.error('seed-agents error:', e);
    res.status(500).json({ error: 'Seed failed' });
  }
}
router.get('/admin/seed-agents', seedAgents);
router.get('/api/admin/seed-agents', seedAgents);

// ---------- File uploads ----------
const uploadsRoot = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsRoot)) fs.mkdirSync(uploadsRoot, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsRoot),
  filename: (req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/[^\w.\-]+/g, '_');
    cb(null, `${ts}-${safe}`);
  },
});
const upload = multer({ storage });

async function nextCaseNumber() {
  const doc = await Counter.findOneAndUpdate(
    { key: 'case' }, { $inc: { seq: 1 } }, { upsert: true, new: true }
  );
  return doc.seq;
}

// ---------- Cases ----------
router.get('/cases', auth, async (req, res) => {
  try {
    const items = await Case.find({}).sort({ createdAt: -1 }).limit(200);
    res.json(items);
  } catch (e) {
    console.error('List cases error:', e);
    res.status(500).json({ error: 'Failed to list cases' });
  }
});

router.post('/cases', auth, upload.array('files', 12), async (req, res) => {
  try {
    const raw = (req.body && req.body.data) ? req.body.data : JSON.stringify(req.body || {});
    const data = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});

    const attachments = (req.files || []).map((f) => ({
      filename: f.originalname,
      path: `/uploads/${path.basename(f.path)}`,
      size: f.size,
      mimetype: f.mimetype,
    }));

    const caseNumber = await nextCaseNumber();
    const safeIssue = ISSUE_TYPES.includes(data.issueType) ? data.issueType : 'Other';
    const safePriority = PRIORITIES.includes(data.priority) ? data.priority : 'Normal';

    const doc = await Case.create({
      caseNumber,
      title: data.title || '',
      description: data.description || '',
      customerId: data.customerId || null,
      customerName: data.customerName || '',
      issueType: safeIssue,
      priority: safePriority,
      status: 'Open',
      agent: data.agent || (req.user && req.user.name) || 'Unassigned',
      attachments,
      logs: [],
    });

    res.status(201).json(doc);
  } catch (e) {
    console.error('Create case error:', e);
    res.status(400).json({ error: 'Create case failed', details: String((e && e.message) || e) });
  }
});

router.post('/cases/:id/logs', auth, upload.array('files', 8), async (req, res) => {
  try {
    const { id } = req.params;
    const note = (req.body && req.body.note) || '';
    const files = (req.files || []).map((f) => ({
      filename: f.originalname,
      path: `/uploads/${path.basename(f.path)}`,
      size: f.size,
      mimetype: f.mimetype,
    }));
    const update = { $push: { logs: { at: new Date(), by: (req.user && req.user.name) || 'Agent', note, files } } };
    const doc = await Case.findByIdAndUpdate(id, update, { new: true });
    if (!doc) return res.status(404).json({ error: 'Case not found' });
    res.json(doc);
  } catch (e) {
    console.error('Add log error:', e);
    res.status(400).json({ error: 'Add log failed', details: String((e && e.message) || e) });
  }
});

// ---------- Square customers search (supports both /api/... and /customers/...) ----------
async function squareSearch(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json([]);

    const token = process.env.SQUARE_ACCESS_TOKEN;
    if (!token) return res.status(500).json({ error: 'Square not configured (missing SQUARE_ACCESS_TOKEN)' });

    const base = process.env.SQUARE_API_BASE || 'https://connect.squareup.com';
    const squareVersion = process.env.SQUARE_VERSION || '2025-08-20';

    const headers = {
      'Content-Type': 'application/json',
      'Square-Version': squareVersion,
      'Authorization': `Bearer ${token}`,
    };

    const results = new Map();
    async function call(body) {
      const r = await fetch(`${base}/v2/customers/search`, {
        method: 'POST', headers, body: JSON.stringify(body),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(JSON.stringify(json));
      for (const c of (json.customers || [])) results.set(c.id, c);
    }

    const looksLikeEmail = q.includes('@');
    const hasDigits = /\d/.test(q);
    if (looksLikeEmail) {
      await call({ query: { filter: { email_address: { fuzzy: q } } }, limit: 15 });
    } else if (hasDigits) {
      await call({ query: { filter: { phone_number: { fuzzy: q } } }, limit: 15 });
      await call({ query: { filter: { email_address: { fuzzy: q } } }, limit: 15 });
    } else {
      await call({ query: { filter: { email_address: { fuzzy: q } } }, limit: 15 });
    }

    const items = Array.from(results.values()).map((c) => ({
      id: c.id,
      name: [c.given_name, c.family_name].filter(Boolean).join(' ') || c.company_name || c.nickname || 'Unnamed',
      phone: c.phone_number || '',
      email: c.email_address || '',
    }));
    return res.json(items);
  } catch (e) {
    console.error('Square search error:', e);
    return res.status(500).json({ error: 'Square search error', details: String((e && e.message) || e) });
  }
}
router.get('/api/customers/search', squareSearch);
router.get('/customers/search', squareSearch);

module.exports = router;