// backend/routes.js
const express = require('express');
const router = express.Router();

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');

const http = require('http');
const https = require('https');

const { Client, Environment } = require('square');

const Case = require('./models/Case');
const User  = require('./models/User');

/* ============================
   Helpers / config
   ============================ */

const JWT_SECRET = process.env.JWT_SECRET || 'change-me';

// Multer: save uploads under backend/uploads
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, path.join(process.cwd(), 'backend', 'uploads')),
  filename: (_req, file, cb) => {
    const stamp = Date.now();
    const safe  = file.originalname.replace(/[^\w.\-]+/g, '_');
    cb(null, `${stamp}_${safe}`);
  }
});
const upload = multer({ storage });

function toPublicUrls(files) {
  // server serves: app.use('/uploads', express.static('uploads'))
  // we saved to backend/uploads; static mount points to "uploads"
  return (files || []).map(f => `/uploads/${path.basename(f.path)}`);
}

// Very light auth
function auth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'No token' });
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/* ============================
   Admin seed/reset (safe to run)
   ============================ */
router.post('/_reset-admin', async (_req, res) => {
  try {
    const name = process.env.ADMIN_NAME || 'Admin';
    const email = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
    const raw   = process.env.ADMIN_PASSWORD || 'Password1!';

    let u = await User.findOne({ email });
    if (!u) u = new User({ name, email, role: 'admin' });

    u.password = await bcrypt.hash(raw, 10);
    u.name     = name;
    u.role     = 'admin';
    await u.save();

    return res.json({ ok: true, email: u.email });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'reset failed' });
  }
});

/* ============================
   Auth
   ============================ */
router.post('/login', async (req, res) => {
  try {
    const emailIn = String((req.body || {}).email || '').trim().toLowerCase();
    const passIn  = String((req.body || {}).password || '');

    // 1) DB user
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

    // 2) ENV admin fallback
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

    return res.status(401).json({ error: 'Invalid credentials' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'login failed' });
  }
});

/* ============================
   Agents (dropdown source)
   ============================ */
router.get('/agents', async (_req, res) => {
  const csv  = process.env.AGENTS || '';
  const list = csv
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map((name, i) => ({ _id: String(i + 1), name }));
  return res.json(list);
});

/* ============================
   Square customers (search + list)
   ============================ */

// Build one client per request (fast with keep-alive); cheap enough.
function createSquareClient() {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token || String(process.env.SQUARE_MOCK || 'false').toLowerCase() === 'true') return null;

  const insecure = String(process.env.SQUARE_TLS_INSECURE || 'false').toLowerCase() === 'true';
  const envName  = (process.env.SQUARE_ENV || 'production').toLowerCase();
  const environment = envName === 'sandbox' ? Environment.Sandbox : Environment.Production;

  // keep-alive agents help on Render free instances
  const keepAlive = { keepAlive: true };
  const httpAgent  = new http.Agent(keepAlive);
  const httpsAgent = new https.Agent({ ...keepAlive, rejectUnauthorized: !insecure });

  return new Client({
    accessToken: token,
    environment,
    httpClientOptions: {
      timeout: 60000,
      httpAgent,
      httpsAgent,
    },
  });
}

function mapSquareCustomer(c) {
  return {
    id: c.id,
    name:
      [c.givenName, c.familyName].filter(Boolean).join(' ') ||
      c.companyName ||
      'Customer',
    email: c.emailAddress || '',
    phone: (c.phoneNumber || '').replace(/\s+/g, ''),
  };
}

/**
 * GET /customers/search?q=…
 * - When q is blank, returns first page (visibility check).
 * - When q is provided, uses textFilter full-text search (name/email/phone/etc).
 */
router.get('/customers/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();

    const client = createSquareClient();
    if (!client) return res.json([]);

    const { customersApi } = client;

    if (!q) {
      const list = await customersApi.listCustomers();
      return res.json((list.result.customers || []).map(mapSquareCustomer));
    }

    const payload = {
      query: { textFilter: q },
      limit: 100,
    };
    const resp = await customersApi.searchCustomers(payload);
    return res.json((resp.result.customers || []).map(mapSquareCustomer));
  } catch (e) {
    console.error('Square customers search error:', e?.response?.body || e);
    return res.json([]); // never break UI
  }
});

/**
 * GET /customers/list?limit=20
 * Quick connectivity/debug endpoint.
 */
router.get('/customers/list', async (req, res) => {
  try {
    const client = createSquareClient();
    if (!client) return res.json([]);

    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)));
    const { customersApi } = client;
    const resp = await customersApi.listCustomers(undefined, limit);
    return res.json((resp.result.customers || []).map(mapSquareCustomer));
  } catch (e) {
    console.error('Square list customers error:', e?.response?.body || e);
    return res.json([]);
  }
});

/* ============================
   Cases
   ============================ */

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
    if (status)    find.status    = status;
    if (issueType) find.issueType = issueType;
    if (agent)     find.agent     = agent;
    if (priority)  find.priority  = priority;

    if (q) {
      const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      find.$or = [
        { customerName:  rx },
        { customerEmail: rx },
        { customerPhone: rx },
        { description:   rx },
        { 'logs.message': rx },
      ];
    }

    const pageN   = Math.max(1, parseInt(page));
    const sizeN   = Math.max(1, parseInt(pageSize));
    const skip    = (pageN - 1) * sizeN;

    const [items, total] = await Promise.all([
      Case.find(find).sort({ caseNumber: -1 }).skip(skip).limit(sizeN),
      Case.countDocuments(find),
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
    const data = JSON.parse(req.body.data || '{}');

    if (!data.caseNumber) {
      const count = await Case.estimatedDocumentCount();
      data.caseNumber = count + 1;
    }

    data.status = data.status || 'Open';
    if (!data.agent && req.user?.name) data.agent = req.user.name;

    const fileUrls = toPublicUrls(req.files);

    const logs = [];
    if (data.description || fileUrls.length) {
      logs.push({
        author:  req.user?.name || data.agent || 'System',
        message: data.description || '(no message)',
        files:   fileUrls,
        at:      new Date(),
      });
    }

    const doc = new Case({
      customerId:    data.customerId    || '',
      customerName:  data.customerName  || '',
      customerEmail: data.customerEmail || '',
      customerPhone: data.customerPhone || '',
      issueType:     data.issueType     || '',
      description:   data.description   || '',
      priority:      data.priority      || 'Low',
      agent:         data.agent         || (req.user?.name || ''),
      status:        data.status        || 'Open',
      caseNumber:    data.caseNumber,
      logs,
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
    const id     = req.params.id;
    const update = req.body || {};

    const doc = await Case.findById(id);
    if (!doc) return res.status(404).json({ error: 'not found' });

    if (typeof update.status === 'string') doc.status = update.status;
    if (update.solutionSummary) {
      doc.logs = doc.logs || [];
      doc.logs.push({
        author:  req.user?.name || 'System',
        message: `Closed — ${update.solutionSummary}`,
        files:   [],
        at:      new Date(),
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
    const id  = req.params.id;
    const doc = await Case.findById(id);
    if (!doc) return res.status(404).json({ error: 'not found' });

    const note   = req.body.note || '';
    const author = (req.body.agent || req.user?.name || 'Agent');
    const files  = toPublicUrls(req.files);

    doc.logs = doc.logs || [];
    doc.logs.push({
      author,
      message: note,
      files,
      at: new Date(),
    });

    await doc.save();
    return res.json(doc);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'add log failed' });
  }
});

module.exports = router;