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

const ISSUE_TYPES = ['Plans', 'Billing', 'Technical', 'Activation', 'Shipping', 'Other'];
const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];

function escapeRegex(s = '') {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Health
router.get(['/health', '/healthz'], (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// Auth middleware
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

// Login (email)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    const user = await User.findOne({ email: String(email).toLowerCase(), active: true });
    if (!user || !user.passwordHash) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash || '');
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

// Login by NAME (or email)
router.post('/login-name', async (req, res) => {
  try {
    const { email, password, name, username } = req.body || {};
    const ident = String(username || name || email || '').trim();
    if (!ident || !password) return res.status(400).json({ error: 'Name (or email) and password are required' });

    let user = null;
    if (ident.includes('@')) {
      user = await User.findOne({ email: ident.toLowerCase(), active: true });
    } else {
      user =
        (await User.findOne({ active: true, name: { $regex: `^${escapeRegex(ident)}$`, $options: 'i' } })) ||
        (await User.findOne({ active: true, name: { $regex: escapeRegex(ident), $options: 'i' } }));
    }
    if (!user || !user.passwordHash) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.passwordHash || '');
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user._id, email: user.email, name: user.name, role: user.role || 'agent' },
      JWT_SECRET,
      { expiresIn: '10d' }
    );
    res.json({ token, user: { name: user.name, email: user.email, role: user.role || 'agent' } });
  } catch (e) {
    console.error('Login-name error:', e);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Admin reset (by email)
router.post('/_reset-admin', async (req, res) => {
  try {
    const { email, newPassword } = req.body || {};
    if (!email || !newPassword) return res.status(400).json({ error: 'email and newPassword are required' });
    const u = await User.findOne({ email: String(email).toLowerCase() });
    if (!u) return res.status(404).json({ error: 'User not found' });
    u.passwordHash = await bcrypt.hash(String(newPassword), 10);
    await u.save();
    res.json({ ok: true });
  } catch (e) {
    console.error('Reset admin error:', e);
    res.status(500).json({ error: 'Reset failed' });
  }
});

// ONE-TIME: seed agents (protected with SEED_SECRET)
router.get('/admin/seed-agents', async (req, res) => {
  try {
    const secret = process.env.SEED_SECRET || 'dev-seed';
    if ((req.query.secret || '') !== secret) return res.status(403).json({ error: 'Forbidden' });

    const pw = String(req.query.pw || 'Assistly1!');
    const names = ['Sheindy','Chayelle','Yenti','Tzivi','Roisy','Toby','Blimi'];

    const results = [];
    for (const name of names) {
      const email = `${name.toLowerCase()}@agents.local`;
      let u = await User.findOne({ email });
      if (!u) u = new User({ name, email, role: 'agent', active: true });
      u.name = name;
      u.role = 'agent';
      u.active = true;
      u.passwordHash = await bcrypt.hash(pw, 10);
      await u.save();
      results.push({ name: u.name, email: u.email, role: u.role });
    }
    res.json({ ok: true, seeded: results.length, users: results });
  } catch (e) {
    console.error('Seed agents error:', e);
    res.status(500).json({ error: 'Seed failed' });
  }
});

// File uploads
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

// Auto-increment
async function nextCaseNumber() {
  const doc = await Counter.findOneAndUpdate(
    { key: 'case' }, { $inc: { seq: 1 } }, { upsert: true, new: true }
  );
  return doc.seq;
}

// List cases
router.get('/cases', auth, async (req, res) => {
  try {
    const items = await Case.find({}).sort({ createdAt: -1 }).limit(200);
    res.json(items);
  } catch (e) {
    console.error('List cases error:', e);
    res.status(500).json({ error: 'Failed to list cases' });
  }
});

// Create case (tolerant)
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

    const newCase = await Case.create({
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

    res.status(201).json(newCase);
  } catch (e) {
    console.error('Create case error:', e);
    res.status(400).json({ error: 'Create case failed', details: String((e && e.message) || e) });
  }
});

// Add log
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

// Square customer search (email/phone fuzzy)
router.get('/api/customers/search', async (req, res) => {
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
    res.json(items);
  } catch (e) {
    console.error('Square search error:', e);
    res.status(500).json({ error: 'Square search error', details: String((e && e.message) || e) });
  }
});

// ===== QUICK FIXES (append-only) =======================================

// A. Upsert (create or reset) a single agent by NAME via GET
//    Example:
//    /admin/set-agent?secret=YOUR_SECRET&name=Toby&pw=Assistly1!
router.get('/admin/set-agent', async (req, res) => {
  try {
    const secret = process.env.SEED_SECRET || 'dev-seed';
    if ((req.query.secret || '') !== secret) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const name = String(req.query.name || '').trim();
    const pw = String(req.query.pw || '').trim();
    if (!name || !pw) return res.status(400).json({ error: 'name and pw required' });

    const email = `${name.toLowerCase()}@agents.local`;

    // Find by email OR by case-insensitive name
    const escapeRegex = (s = '') => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let u =
      (await User.findOne({ email })) ||
      (await User.findOne({ name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } }));

    if (!u) u = new User({ name, email, role: 'agent', active: true });

    u.name = name;
    u.role = 'agent';
    u.active = true;
    u.passwordHash = await bcrypt.hash(pw, 10);
    await u.save();

    return res.json({ ok: true, user: { name: u.name, email: u.email, role: u.role } });
  } catch (err) {
    console.error('set-agent error:', err);
    return res.status(500).json({ error: 'set-agent failed' });
  }
});

// B. Square search alias so old frontend calls still work
//    (If UI calls /customers/search, route it to the same logic as /api/customers/search)
router.get('/customers/search', async (req, res) => {
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
      Authorization: `Bearer ${token}`,
    };

    const results = new Map();
    async function call(body) {
      const r = await fetch(`${base}/v2/customers/search`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(JSON.stringify(json));
      for (const c of json.customers || []) results.set(c.id, c);
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
  } catch (err) {
    console.error('Square alias search error:', err);
    return res.status(500).json({ error: 'Square search error' });
  }
});

// ===== END QUICK FIXES =================================================

module.exports = router;