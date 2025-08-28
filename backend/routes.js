// backend/routes.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const User = require('./models/User');
const Case = require('./models/Case');          // assumes you already have this
const Counter = require('./models/Counter');    // assumes you already have this

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

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
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, email, name, role }
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ---------- Login (uses passwordHash) ----------
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const user = await User.findOne({ email: String(email).toLowerCase(), active: true });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const ok = await bcrypt.compare(password, user.passwordHash || '');
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, name: user.name, role: user.role || 'agent' },
      JWT_SECRET,
      { expiresIn: '10d' }
    );
    return res.json({
      token,
      user: { name: user.name, email: user.email, role: user.role || 'agent' },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// ---------- Admin reset password (writes passwordHash) ----------
router.post('/_reset-admin', async (req, res) => {
  try {
    const { email, newPassword } = req.body || {};
    if (!email || !newPassword) {
      return res.status(400).json({ error: 'email and newPassword are required' });
    }
    const u = await User.findOne({ email: String(email).toLowerCase() });
    if (!u) return res.status(404).json({ error: 'User not found' });
    const raw = String(newPassword);
    u.passwordHash = await bcrypt.hash(raw, 10); // <-- key change
    await u.save();
    return res.json({ ok: true });
  } catch (err) {
    console.error('Reset admin error:', err);
    return res.status(500).json({ error: 'Reset failed' });
  }
});

// ---------- File upload (for cases/logs) ----------
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

// ---------- Cases ----------
/**
 * Auto-number helper (if you use sequential case numbers)
 */
async function nextCaseNumber() {
  const doc = await Counter.findOneAndUpdate(
    { key: 'case' },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return doc.seq;
}

// List cases
router.get('/cases', auth, async (req, res) => {
  try {
    const items = await Case.find({}).sort({ createdAt: -1 }).limit(200);
    res.json(items);
  } catch (err) {
    console.error('List cases error:', err);
    res.status(500).json({ error: 'Failed to list cases' });
  }
});

// Create case (multipart: files + data). Auto-assign to logged-in agent if none provided.
router.post('/cases', auth, upload.array('files', 12), async (req, res) => {
  try {
    // `data` may come as JSON in a text field when using multipart
    const data = req.body && req.body.data ? JSON.parse(req.body.data) : req.body || {};
    const attachments = (req.files || []).map((f) => ({
      filename: f.originalname,
      path: `/uploads/${path.basename(f.path)}`,
      size: f.size,
      mimetype: f.mimetype,
    }));

    const caseNumber = await nextCaseNumber();

    const newCase = await Case.create({
      caseNumber,
      title: data.title || '',
      description: data.description || '',
      customerId: data.customerId || null,
      customerName: data.customerName || '',
      issueType: data.issueType || 'Other',
      priority: data.priority || 'Normal',
      status: 'Open',
      // Auto-assign here:
      agent: data.agent || (req.user && req.user.name) || 'Unassigned',
      attachments,
      logs: [], // start empty
    });

    res.status(201).json(newCase);
  } catch (err) {
    console.error('Create case error:', err);
    res.status(400).json({ error: 'Create case failed', details: String(err && err.message || err) });
  }
});

// Add a log to a case (note + optional files)
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

    const update = {
      $push: { logs: { at: new Date(), by: (req.user && req.user.name) || 'Agent', note, files } },
    };
    const doc = await Case.findByIdAndUpdate(id, update, { new: true });
    if (!doc) return res.status(404).json({ error: 'Case not found' });
    res.json(doc);
  } catch (err) {
    console.error('Add log error:', err);
    res.status(400).json({ error: 'Add log failed', details: String(err && err.message || err) });
  }
});

module.exports = router;