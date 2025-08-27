// backend/routes.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const { Client, Environment } = require('square');

const Case = require('./models/Case');
const User = require('./models/User');

// ---------- helpers ----------

const JWT_SECRET = process.env.JWT_SECRET || 'change-me';

// multer: store uploads in /uploads with original name + timestamp
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, path.join(process.cwd(), 'backend', 'uploads')),
  filename: (_req, file, cb) => {
    const stamp = Date.now();
    const safe = file.originalname.replace(/[^\w.\-]+/g, '_');
    cb(null, `${stamp}_${safe}`);
  }
});
const upload = multer({ storage });

function toPublicUrls(files) {
  // server.js serves: app.use('/uploads', express.static('uploads'))
  // we saved in backend/uploads; static mount points to "uploads" relative to backend/
  return (files || []).map(f => `/uploads/${path.basename(f.path)}`);
}

// very light auth middleware (reads Authorization: Bearer <token>)
function auth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'No token' });
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ---------- Admin: seed/reset (for you only) ----------

router.post('/_reset-admin', async (_req, res) => {
  try {
    const name = process.env.ADMIN_NAME || 'Admin';
    const email = process.env.ADMIN_EMAIL || 'admin@example.com';
    const raw = process.env.ADMIN_PASSWORD || 'Password1!';

    let u = await User.findOne({ email });
    if (!u) u = new User({ name, email, role: 'admin' });

    // always ensure the password matches env
    const hash = await bcrypt.hash(raw, 10);
    u.password = hash;
    u.name = name;
    u.role = 'admin';
    await u.save();

    return res.json({ ok: true, email: u.email });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'reset failed' });
  }
});

// ---------- Auth ----------
router.post('/login', async (req, res) => {
  try {
    const emailIn = String((req.body || {}).email || '').trim().toLowerCase();
    const passIn  = String((req.body || {}).password || '');

    // 1) Try DB user first (normal path)
    const user = await User.findOne({ email: emailIn });
    if (user && user.password) {
      const ok = await bcrypt.compare(passIn, user.password || '');
      if (ok) {
        const token = jwt.sign(
          { id: user._id, email: user.email, name: user.name, role: user.role || 'agent' },
          JWT_SECRET,
          { expiresIn: '10d' }
        );
        return res.json({ token, user: { name: user.name, email: user.email, role: user.role || 'agent' } });
      }
    }

    // 2) Fallback: allow ENV admin login even if DB isn't seeded yet
    const envEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const envPass  = String(process.env.ADMIN_PASSWORD || '');
    const envName  = process.env.ADMIN_NAME || 'Admin';

    if (emailIn && envEmail && emailIn === envEmail && passIn === envPass) {
      const token = jwt.sign(
        { id: 'admin-env', email: envEmail, name: envName, role: 'admin' },
        JWT_SECRET,
        { expiresIn: '10d' }
      );
      return res.json({ token, user: { name: envName, email: envEmail, role: 'admin' } });
    }

    // Otherwise, reject
    return res.status(401).json({ error: 'Invalid credentials' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'login failed' });
  }
});

// ---------- Agents (for filter dropdown) ----------

router.get('/agents', async (_req, res) => {
  // simplest source: comma-separated list in env
  const csv = process.env.AGENTS || '';
  const list = csv
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map((name, i) => ({ _id: String(i + 1), name }));
  return res.json(list);
});

// ---------- Square customers search (best effort) ----------

function makeSquareClient() {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token || String(process.env.SQUARE_MOCK).toLowerCase() === 'true') return null;
  const env = (process.env.SQUARE_ENV || 'production').toLowerCase() === 'sandbox'
    ? Environment.Sandbox
    : Environment.Production;
  return new Client({ accessToken: token, environment: env });
}

router.get('/customers/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);

  try {
    const client = makeSquareClient();
    if (!client) return res.json([]); // or return mocked values

    // Very simple search: filter by given_name / family_name / email / phone
    const body = {
      query: {
        filter: {
          emailAddress: { fuzzy: { value: q } },
          phone: { fuzzy: { value: q } },
          textFilter: q
        }
      },
      limit: 10
    };

    const r = await client.customersApi.searchCustomers(body);
    const items = (r.result?.customers || []).map(c => ({
      id: c.id,
      name: [c.givenName, c.familyName].filter(Boolean).join(' ') || (c.companyName || 'Customer'),
      email: c.emailAddress || '',
      phone: (c.phoneNumber || '').replace(/\s+/g, '')
    }));
    return res.json(items);
  } catch (e) {
    console.error('Square search failed:', e.message);
    return res.json([]); // don’t fail the UI
  }
});

// ---------- Cases ----------

// List cases with filters & pagination
router.get('/cases', auth, async (req, res) => {
  try {
    const {
      q = '',
      issueType = '',
      agent = '',
      priority = '',
      status = 'Open',
      page = 1,
      pageSize = 10
    } = req.query;

    const find = {};
    if (status) find.status = status;
    if (issueType) find.issueType = issueType;
    if (agent) find.agent = agent;
    if (priority) find.priority = priority;

    if (q) {
      const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      find.$or = [
        { customerName: rx },
        { customerEmail: rx },
        { customerPhone: rx },
        { description: rx },
        { 'logs.message': rx },
      ];
    }

    const skip = (Math.max(1, parseInt(page)) - 1) * Math.max(1, parseInt(pageSize));
    const [items, total] = await Promise.all([
      Case.find(find).sort({ caseNumber: -1 }).skip(skip).limit(parseInt(pageSize)),
      Case.countDocuments(find)
    ]);

    return res.json({ items, total });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'query failed' });
  }
});

// Create a case (files optional) — first log from description
router.post('/cases', auth, upload.array('files'), async (req, res) => {
  try {
    // Frontend sends a "data" JSON field with case fields
    const data = JSON.parse(req.body.data || '{}');

    // if your schema auto-increments, fine; otherwise lightweight attempt:
    if (!data.caseNumber) {
      const count = await Case.estimatedDocumentCount();
      data.caseNumber = count + 1;
    }

    // ensure status and agent (agent = logged-in user by design)
    data.status = data.status || 'Open';
    if (!data.agent && req.user?.name) data.agent = req.user.name;

    const fileUrls = toPublicUrls(req.files);

    const logs = [];
    if (data.description || fileUrls.length) {
      logs.push({
        author: req.user?.name || data.agent || 'System',
        message: data.description || '(no message)',
        files: fileUrls,
        at: new Date()
      });
    }

    const doc = new Case({
      customerId: data.customerId || '',
      customerName: data.customerName || '',
      customerEmail: data.customerEmail || '',
      customerPhone: data.customerPhone || '',
      issueType: data.issueType || '',
      description: data.description || '',
      priority: data.priority || 'Low',
      agent: data.agent || (req.user?.name || ''),
      status: data.status || 'Open',
      caseNumber: data.caseNumber,
      logs
    });

    await doc.save();
    return res.json(doc);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'create failed' });
  }
});

// Update case (e.g., closing with solutionSummary)
router.put('/cases/:id', auth, async (req, res) => {
  try {
    const id = req.params.id;
    const update = req.body || {};

    const doc = await Case.findById(id);
    if (!doc) return res.status(404).json({ error: 'not found' });

    if (typeof update.status === 'string') doc.status = update.status;
    if (update.solutionSummary) {
      doc.logs = doc.logs || [];
      doc.logs.push({
        author: req.user?.name || 'System',
        message: `Closed — ${update.solutionSummary}`,
        files: [],
        at: new Date()
      });
    }

    await doc.save();
    return res.json(doc);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'update failed' });
  }
});

// Add log to case (with optional files)
router.post('/cases/:id/logs', auth, upload.array('files'), async (req, res) => {
  try {
    const id = req.params.id;
    const doc = await Case.findById(id);
    if (!doc) return res.status(404).json({ error: 'not found' });

    const note = req.body.note || '';
    const author = (req.body.agent || req.user?.name || 'Agent');
    const fileUrls = toPublicUrls(req.files);

    doc.logs = doc.logs || [];
    doc.logs.push({
      author,
      message: note,
      files: fileUrls,
      at: new Date()
    });

    await doc.save();
    return res.json(doc);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'add log failed' });
  }
});

module.exports = router;