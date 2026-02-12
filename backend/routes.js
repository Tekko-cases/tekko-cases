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
const ISSUE_TYPES = ['Plans', 'Billing', 'Technical', 'Activation', 'Shipping', 'Rentals', 'Other'];
const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];

// ---------- Health ----------
router.get(['/health', '/healthz'], (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ---------- Auth ----------
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

// ---------- Login (email) ----------
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

// ---------- Login by name (auto-create) ----------
router.post('/login-name', async (req, res) => {
  try {
    const { username, name, password } = req.body || {};
    const identRaw = String(username || name || '').trim();
    const passIn = String(password || '');
    if (!identRaw || !passIn) return res.status(400).json({ error: 'Name and password are required' });

    const identLower = identRaw.toLowerCase();
    const allowed = (process.env.AGENT_NAMES || 'Sheindy,Chayelle,Yenti,Tzivi,Roisy,Toby,Blimi')
      .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

    const emailAuto = `${identLower}@agents.local`;
    let user = await User.findOne({ email: emailAuto, active: true });

    if (!user) {
      user =
        (await User.findOne({ active: true, name: { $regex: `^${esc(identRaw)}$`, $options: 'i' } })) ||
        (await User.findOne({ active: true, name: { $regex: esc(identRaw), $options: 'i' } }));
    }

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

// ---------- Seed agents (optional) ----------
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

// ---------- Agents: list ----------
router.get('/agents', auth, async (req, res) => {
  try {
    const agents = await User.find({ active: true }).select('_id name email role').lean();
    res.json({ ok: true, data: agents });
  } catch (e) {
    console.error('List agents error:', e);
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

// ---------- Agents: create ----------
router.post('/agents', auth, async (req, res) => {
  try {
    const { name, password } = req.body || {};
    if (!name || !password) return res.status(400).json({ error: 'Name and password are required' });

    const nameTrimmed = name.trim();
    const email = `${nameTrimmed.toLowerCase().replace(/\s+/g, '')}@agents.local`;
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ error: 'Agent with that name already exists' });

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: nameTrimmed,
      email,
      passwordHash: hash,
      role: 'agent',
      active: true,
    });

    res.status(201).json({ ok: true, agent: { _id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (e) {
    console.error('Create agent error:', e);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

// ---------- Agents: delete (deactivate) ----------
router.delete('/agents/:id', auth, async (req, res) => {
  try {
    const agent = await User.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('Delete agent error:', e);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

// ---------- Uploads ----------
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

// ---------- Case number ----------
async function nextCaseNumber() {
  const doc = await Counter.findOneAndUpdate(
    { _id: 'caseNumber' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return doc.seq;
}

// ---------- Cases: list ----------
router.get('/cases', auth, async (req, res) => {
  try {
    const view = String(req.query.view || 'open').toLowerCase();
    const filter = view === 'archived' ? { archived: true } : { archived: { $ne: true } };

    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || '20', 10), 1), 100);

    const [items, total] = await Promise.all([
      Case.find(filter).sort({ createdAt: -1, caseNumber: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
      Case.countDocuments(filter),
    ]);

    res.json({ ok: true, items, total, page, pageSize });
  } catch (e) {
    console.error('List cases error:', e);
    res.status(500).json({ error: 'Failed to list cases' });
  }
});

// ---------- Cases: create ----------
router.post('/cases', auth, upload.array('files', 12), async (req, res) => {
  try {
    // Allow both multipart {data} and raw JSON
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
  customerEmail: data.customerEmail || '',
  customerPhone: data.customerPhone || '',
      issueType: safeIssue,
      priority: safePriority,
      status: 'Open',
      archived: false,
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

// ---------- Cases: add log ----------
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

// ---------- Cases: close, reopen, delete ----------
router.patch('/cases/:id/close', auth, async (req, res) => {
  try {
    const doc = await Case.findByIdAndUpdate(req.params.id, { status: 'Closed', archived: true }, { new: true });
    if (!doc) return res.status(404).json({ error: 'Case not found' });
    res.json({ ok: true, case: doc });
  } catch (e) {
    res.status(400).json({ error: 'Close failed' });
  }
});

router.patch('/cases/:id/reopen', auth, async (req, res) => {
  try {
    const doc = await Case.findByIdAndUpdate(req.params.id, { status: 'Open', archived: false }, { new: true });
    if (!doc) return res.status(404).json({ error: 'Case not found' });
    res.json({ ok: true, case: doc });
  } catch (e) {
    res.status(400).json({ error: 'Reopen failed' });
  }
});

router.delete('/cases/:id', auth, async (req, res) => {
  try {
    const r = await Case.deleteOne({ _id: req.params.id });
    if (!r.deletedCount) return res.status(404).json({ error: 'Case not found' });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Delete failed' });
  }
});

// ---------- Square search (unchanged except hardening) ----------
async function squareSearch(req, res) {
  try {
    const qOrig = String(req.query.q || '').trim();
    if (!qOrig) return res.json([]);

    const token = process.env.SQUARE_ACCESS_TOKEN;
    if (!token) return res.status(500).json({ error: 'Square not configured (missing SQUARE_ACCESS_TOKEN)' });

    const base = process.env.SQUARE_API_BASE || 'https://connect.squareup.com';
    const squareVersion = process.env.SQUARE_VERSION || '2025-08-20';

    const headers = {
      'Content-Type': 'application/json',
      'Square-Version': squareVersion,
      'Authorization': `Bearer ${token}`,
    };

    const looksLikeEmail = qOrig.includes('@');
    const hasDigits = /\d/.test(qOrig);
    const results = new Map();

    async function postSearch(body) {
      const r = await fetch(`${base}/v2/customers/search`, { method: 'POST', headers, body: JSON.stringify(body) });
      const json = await r.json();
      if (!r.ok) throw new Error(JSON.stringify(json));
      for (const c of (json.customers || [])) results.set(c.id, c);
    }

    async function listAndFilterNames(maxPages = Number(process.env.SQUARE_NAME_PAGES || 3)) {
      let cursor = null;
      for (let page = 0; page < maxPages; page++) {
        const url = new URL(`${base}/v2/customers`);
        url.searchParams.set('limit', '100');
        if (cursor) url.searchParams.set('cursor', cursor);

        const r = await fetch(url.toString(), { headers });
        const json = await r.json();
        if (!r.ok) throw new Error(JSON.stringify(json));
        for (const c of (json.customers || [])) {
          const fullName = [c.given_name, c.family_name].filter(Boolean).join(' ').toLowerCase();
          const company  = (c.company_name || '').toLowerCase();
          const nick     = (c.nickname || '').toLowerCase();
          const qLower = qOrig.toLowerCase();
          if (fullName.includes(qLower) || company.includes(qLower) || nick.includes(qLower)) results.set(c.id, c);
        }
        if (!json.cursor || results.size >= 20) break;
        cursor = json.cursor;
      }
    }

    try {
      if (looksLikeEmail) {
        await postSearch({ query: { filter: { email_address: { fuzzy: qOrig } } }, limit: 20 });
      } else if (hasDigits) {
        await postSearch({ query: { filter: { phone_number: { fuzzy: qOrig } } }, limit: 20 });
      } else {
        await listAndFilterNames();
      }
    } catch {
      if (!looksLikeEmail && !hasDigits) throw e;
      await listAndFilterNames();
    }

    const items = Array.from(results.values()).map((c) => ({
      id: c.id,
      name: [c.given_name, c.family_name].filter(Boolean).join(' ') || c.company_name || c.nickname || 'Unnamed',
      phone: c.phone_number || '',
      email: c.email_address || '',
    }));

    return res.json(items);
  } catch (err) {
    console.error('Square search error:', err);
    return res.status(500).json({ error: 'Square search error', details: String((err && err.message) || err) });
  }
}
router.get('/api/customers/search', squareSearch);
router.get('/customers/search', squareSearch);

// ---------- Counter fixer ----------
router.get('/admin/fix-case-counter', async (_req, res) => {
  try {
    const maxDoc = await Case.findOne().sort({ caseNumber: -1 }).select('caseNumber').lean();
    const currentMax = (maxDoc && maxDoc.caseNumber) || 0;

    const fixed = await Counter.findOneAndUpdate(
      { _id: 'caseNumber' },
      { $max: { seq: currentMax } },
      { new: true, upsert: true }
    );

    res.json({ ok: true, highestExisting: currentMax, counterNow: fixed.seq });
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
});

module.exports = router;