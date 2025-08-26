const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
dotenv.config();

const Case = require('./models/Case');
const User = require('./models/User');

// ---------- Square client (safe init + optional TLS relax for sandbox/local) ----------
const { Client, Environment } = require('square');
const http = require('http');
const https = require('https');

const insecureTls = (process.env.SQUARE_TLS_INSECURE || 'false').toLowerCase() === 'true';

const square = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment:
    (process.env.SQUARE_ENV || '').toLowerCase() === 'sandbox'
      ? Environment.Sandbox
      : Environment.Production,
  ...(insecureTls
    ? {
        httpClientOptions: {
          timeout: 60000,
          httpAgent: new http.Agent({ keepAlive: true }),
          httpsAgent: new https.Agent({ keepAlive: true, rejectUnauthorized: false }),
        },
      }
    : {}),
});
// ----------------------------------------------

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));
// --- map ALL /api/* -> backend /*  (KEEP this before your other routes) ---
app.use((req, res, next) => {
  if (typeof req.url === 'string' && req.url.startsWith('/api/')) {
    req.url = req.url.replace(/^\/api\//, '/');
  }
  next();
});

// --- health check (used by uptime pingers to keep the app awake) ---
app.get('/health', (req, res) => {
  res.status(200).json({ ok: true, time: new Date().toISOString() });
});

// --- map frontend /api/login -> backend /login (put this BEFORE your routes) ---
app.use((req, res, next) => {
  if (req.method === 'POST' && req.path === '/api/login') {
    req.url = '/login';
  }
  next();
});

// ===== Multer setup for file uploads =====
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, 'uploads/'),
  filename: (_, file, cb) => cb(null, Date.now() + '_' + file.originalname),
});
const upload = multer({ storage });

// ===== Helper: get next case number =====
async function getNextCaseNumber() {
  const last = await Case.findOne().sort({ caseNumber: -1 });
  return last && last.caseNumber ? last.caseNumber + 1 : 1;
}

// ======= AUTH: helpers =======
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function signToken(user) {
  return jwt.sign(
    { sub: user._id, role: user.role, name: user.name, email: user.email },
    JWT_SECRET,
    { expiresIn: '10d' }
  );
}

function authRequired(req, res, next) {
  try {
    const hdr = req.headers.authorization || '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing token' });
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// ======= AUTH: routes =======

// login (agents/admin)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: String(email).toLowerCase(), active: true });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = signToken(user);
    res.json({ token, user: { name: user.name, email: user.email, role: user.role } });
  } catch (e) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// ===== TEMP: reset/create admin user (accept key via body, query, or header) =====
app.post('/api/_reset-admin', async (req, res) => {
  const bcrypt = require('bcryptjs');
  const User = require('./models/User');

  const provided =
    (req.body && req.body.key) ||
    (req.query && req.query.key) ||
    req.headers['x-reset-key'];

  const expected = process.env.RESET_ADMIN_KEY || '';

  if (!expected || provided !== expected) {
    return res.status(403).json({ error: 'Forbidden', why: 'key mismatch' });
  }

  try {
    const email = String(process.env.ADMIN_EMAIL || '').toLowerCase();
    const name = process.env.ADMIN_NAME || 'Admin';
    const pwd = process.env.ADMIN_PASSWORD || 'changeme';
    if (!email || !pwd) return res.status(400).json({ error: 'ADMIN_EMAIL/PASSWORD missing in .env' });

    const hash = await bcrypt.hash(pwd, 10);
    const user = await User.findOneAndUpdate(
      { email },
      { name, email, passwordHash: hash, role: 'admin', active: true },
      { upsert: true, new: true }
    );
    return res.json({ ok: true, email: user.email });
  } catch (e) {
    console.error('reset-admin error', e);
    return res.status(500).json({ error: 'reset-admin failed' });
  }
});

// ===== Seed all agents (one-time use) =====
app.post('/api/_seed-agents', async (req, res) => {
  const bcrypt = require('bcryptjs');
  const User = require('./models/User');

  const provided =
    (req.body && req.body.key) ||
    (req.query && req.query.key) ||
    req.headers['x-seed-key'];

  const expected = process.env.SEED_AGENTS_KEY || '';
  if (!expected || provided !== expected) {
    return res.status(403).json({ error: 'Forbidden', why: 'key mismatch' });
  }

  try {
    const agentNames = (process.env.AGENTS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!agentNames.length) return res.status(400).json({ error: 'No AGENTS set in .env' });

    const created = [];
    for (const name of agentNames) {
      const existing = await User.findOne({ email: name.toLowerCase() });
      if (existing) continue;

      const tempPwd = Math.random().toString(36).slice(-10);
      const hash = await bcrypt.hash(tempPwd, 10);

      await User.create({
        name,
        email: name.toLowerCase(), // just the name
        passwordHash: hash,
        role: 'agent',
        active: true
      });

      created.push({ name, username: name.toLowerCase(), temp_password: tempPwd });
    }

    res.json({ created });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Quick check to confirm your server loaded the key (safe: masked)
app.get('/api/_reset-admin-check', (req, res) => {
  const k = process.env.RESET_ADMIN_KEY || '';
  res.json({ hasKey: !!k, keyStartsWith: k ? k.slice(0, 3) + '***' : null });
});
// ===== END TEMP =====

// admin: create/update agents
app.post('/api/users', authRequired, adminOnly, async (req, res) => {
  try {
    const { name, email, password, role = 'agent', active = true } = req.body;
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.findOneAndUpdate(
      { email: String(email).toLowerCase() },
      { name, email: String(email).toLowerCase(), passwordHash, role, active },
      { upsert: true, new: true }
    );
    res.json({ success: true, user: { id: user._id, name: user.name, email: user.email, role: user.role, active: user.active } });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save user' });
  }
});

// admin: list users
app.get('/api/users', authRequired, adminOnly, async (req, res) => {
  const users = await User.find().select('name email role active createdAt updatedAt').lean();
  res.json(users);
});

// ===== Agents list (for dropdown) from DB users with role agent or admin; fallback to .env if empty =====
app.get('/api/agents', authRequired, async (req, res) => {
  const dbAgents = await User.find({ active: true }).select('name').lean();
  let list = dbAgents.map(u => ({ _id: u.name, name: u.name }));
  if (list.length === 0) {
    list = (process.env.AGENTS || 'Chayelle,Tzivi,Roisy,Yenti,Toby,Blimi')
      .split(',').map(s => s.trim()).filter(Boolean)
      .map(name => ({ _id: name, name }));
  }
  res.json(list);
});

// ===== DIAGNOSTIC for Square =====
app.get('/api/customers/debug', (req, res) => {
  const token = process.env.SQUARE_ACCESS_TOKEN || '';
  res.json({
    envLoaded: !!token,
    envMode: process.env.SQUARE_ENV || 'production',
    tokenStartsWith: token ? token.slice(0, 6) + '...' : null,
    mock: (process.env.SQUARE_MOCK || 'false').toLowerCase() === 'true',
  });
});

// BigInt-safe first page preview
app.get('/api/customers/debug-list', async (req, res) => {
  try {
    const { customersApi } = square;
    const resp = await customersApi.listCustomers();
    const customers = (resp.result?.customers ?? []).map(c => ({
      id: String(c.id || ''),
      givenName: c.givenName || '',
      familyName: c.familyName || '',
      companyName: c.companyName || '',
      email: c.emailAddress || '',
      phone: c.phoneNumber || '',
      referenceId: c.referenceId || '',
      createdAt: c.createdAt || ''
    }));
    return res.json({ ok: true, count: customers.length, customers });
  } catch (e) {
    const details = e?.response?.body || e?.message || String(e);
    console.error('debug-list error:', details);
    return res.status(500).json({ ok: false, details });
  }
});

// ===== Square customers search (public, cursor fix + fallback + verbose errors) =====
app.get('/api/customers/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json([]);

    if ((process.env.SQUARE_MOCK || 'false').toLowerCase() === 'true') {
      const sample = [
        { id: 'cust_1', name: 'John Doe', email: 'john@example.com', phone: '555-1001' },
        { id: 'cust_2', name: 'Joanna Smith', email: 'joanna@example.com', phone: '555-1002' },
        { id: 'cust_3', name: 'Josephine Cohen', email: 'jcohen@example.com', phone: '555-1003' },
      ].filter(x => x.name.toLowerCase().includes(q.toLowerCase()));
      console.log('[Square search MOCK]', q, '->', sample.length);
      return res.json(sample.slice(0, 10));
    }

    const { customersApi } = square;
    const qLower = q.toLowerCase();

    // Page through customers (pass cursor STRING directly)
    let cursor;
    const all = [];
    let pages = 0;
    const MAX_PAGES = 5;

    do {
      const resp = await customersApi.listCustomers(cursor);
      const customers = resp.result?.customers ?? [];
      all.push(...customers);
      cursor = resp.result?.cursor;
      pages++;
    } while (cursor && pages < MAX_PAGES);

    // Filter locally by name/email/phone/reference
    const filtered = all.filter(c => {
      const name = ([c.givenName, c.familyName].filter(Boolean).join(' ') || c.companyName || '').toLowerCase();
      const email = (c.emailAddress || '').toLowerCase();
      const phone = (c.phoneNumber || '').toLowerCase();
      const ref   = (c.referenceId || '').toLowerCase();
      return name.includes(qLower) || email.includes(qLower) || phone.includes(qLower) || ref.includes(qLower);
    });

    const source = filtered.length > 0 ? filtered : all;
    const list = source.slice(0, 20).map(c => ({
      id: c.id,
      name: [c.givenName, c.familyName].filter(Boolean).join(' ') || c.companyName || '(no name)',
      email: c.emailAddress || '',
      phone: c.phoneNumber || ''
    }));

    console.log('[Square search LIVE]', q, '->', list.length);
    return res.json(list);
  } catch (e) {
    const details = e?.response?.body || e?.message || String(e);
    console.error('customers/search error:', details);
    return res.status(500).json({ error: 'Square search failed', details });
  }
});

// ===== Cases: list (filters + search logs + pagination) =====
app.get('/api/cases', authRequired, async (req, res) => {
  try {
    const { issueType, agent, priority, status, q, page = 1, pageSize = 10 } = req.query;
    const filter = {};
    if (issueType) filter.issueType = issueType;
    if (agent) filter.agent = agent;
    if (priority) filter.priority = priority;
    if (status) filter.status = status;

    if (q && String(q).trim() !== '') {
      const escape = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(escape(q), 'i');
      const or = [
        { customerName: rx },
        { description: rx },
        { solutionSummary: rx },
        { 'logs.message': rx },
        { 'logs.note': rx },
        { 'logs.author': rx },
      ];
      const asNum = Number(q);
      if (!Number.isNaN(asNum)) or.push({ caseNumber: asNum });
      filter.$or = or;
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const size = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 10));

    const [items, total] = await Promise.all([
      Case.find(filter).sort({ caseNumber: -1 }).skip((pageNum - 1) * size).limit(size).lean(),
      Case.countDocuments(filter),
    ]);

    res.json({ items, total, page: pageNum, pageSize: size });
  } catch (err) {
    console.error('Error fetching cases:', err);
    res.status(500).json({ error: 'Failed to fetch cases' });
  }
});

// ===== Export cases to CSV =====
app.get('/api/cases/export', authRequired, async (req, res) => {
  try {
    const { issueType, agent, priority, status, q } = req.query;
    const filter = {};
    if (issueType) filter.issueType = issueType;
    if (agent) filter.agent = agent;
    if (priority) filter.priority = priority;
    if (status) filter.status = status;

    if (q) {
      const rx = new RegExp(String(q), 'i');
      filter.$or = [
        { customerName: rx },
        { description: rx },
        { solutionSummary: rx },
        { 'logs.message': rx },
        { 'logs.note': rx },
        { 'logs.author': rx },
      ];
    }

    const items = await Case.find(filter).sort({ caseNumber: -1 }).lean();
    const header = [
      'Case Number','Customer Name','Issue Type','Priority','Agent','Status',
      'Description','Solution Summary','Created At','Updated At'
    ];
    const rows = items.map(c => [
      c.caseNumber || '', c.customerName || '', c.issueType || '', c.priority || '',
      c.agent || '', c.status || '',
      (c.description || '').replace(/\r?\n/g, ' '),
      (c.solutionSummary || '').replace(/\r?\n/g, ' '),
      c.createdAt ? new Date(c.createdAt).toISOString() : '',
      c.updatedAt ? new Date(c.updatedAt).toISOString() : ''
    ]);
    const csv = [header, ...rows]
      .map(r => r.map(String).map(v => `"${v.replace(/"/g,'""')}"`).join(',')).join('\n');

    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename="cases.csv"');
    res.send(csv);
  } catch (err) {
    console.error('CSV export error:', err);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

// ===== Create / Update / Delete cases (auth) =====
app.post('/api/cases', authRequired, upload.array('files', 5), async (req, res) => {
  try {
    const data = JSON.parse(req.body.data);
    const files = (req.files || []).map((f) => '/uploads/' + f.filename);
    const num = await getNextCaseNumber();

    // First log uses the logged-in user's name and your initial description
    const author = req.user?.name || 'Unknown';
    const initialMessage = (data.initialNote ?? data.description ?? data.summary ?? '').trim();

    const initialLogs = initialMessage
      ? [{ author, message: initialMessage, files, at: new Date() }]
      : [];

    const created = await Case.create({
      ...data,
      caseNumber: num,
      attachments: files,
      logs: initialLogs,
    });

    res.json(created);
  } catch (err) {
    console.error('Error creating case:', err);
    res.status(500).json({ error: 'Failed to create case' });
  }
});

app.post('/api/cases/:id/logs', authRequired, upload.array('files', 5), async (req, res) => {
  try {
    const files = (req.files || []).map((f) => '/uploads/' + f.filename);
    const { note } = req.body;                  // the text of the new log
    const agent = req.user?.name || 'Unknown';  // logged-in user's name

    const updated = await Case.findByIdAndUpdate(
      req.params.id,
      { $push: { logs: { author: agent, message: note, files, at: new Date() } } },
      { new: true }
    );
    res.json(updated);
  } catch (err) {
    console.error('Error adding log:', err);
    res.status(500).json({ error: 'Failed to add log' });
  }
});

app.put('/api/cases/:id', authRequired, async (req, res) => {
  try {
    const updated = await Case.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (err) {
    console.error('Error updating case:', err);
    res.status(500).json({ error: 'Failed to update case' });
  }
});

app.delete('/api/cases/:id', authRequired, async (req, res) => {
  try {
    await Case.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting case:', err);
    res.status(500).json({ error: 'Failed to delete case' });
  }
});

// ===== Backfill case numbers =====
app.get('/api/backfill-case-numbers', authRequired, async (req, res) => {
  try {
    let counter = 1;
    const all = await Case.find({}).sort({ createdAt: 1 });
    for (const c of all) {
      if (!c.caseNumber) {
        c.caseNumber = counter++;
        await c.save();
      } else {
        counter = c.caseNumber + 1;
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Backfill error:', err);
    res.status(500).json({ error: 'Failed to backfill case numbers' });
  }
});

// ===== Connect & seed admin =====
mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB');

    // seed initial admin if none exists
    const existing = await User.countDocuments();
    if (existing === 0) {
      const adminName = process.env.ADMIN_NAME || 'Admin';
      const adminEmail = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
      const adminPass = process.env.ADMIN_PASSWORD || 'changeme';
      const hash = await bcrypt.hash(adminPass, 10);
      await User.create({ name: adminName, email: adminEmail, passwordHash: hash, role: 'admin' });
      console.log(`👤 Seeded admin user: ${adminEmail} / ${adminPass}`);
    }

    app.listen(5000, () => console.log('🚀 Server running on http://localhost:5000'));
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });