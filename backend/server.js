// backend/server.js
const path = require('path');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('./models/User');
const routes = require('./routes');

// -----------------------------------------------------------------------------
// App & middleware
// -----------------------------------------------------------------------------
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve file uploads
const uploadsDir = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsDir));

// Mount all API routes at both / and /api (frontend can call either)
app.use('/', routes);
app.use('/api', routes);

// Health checks (support BOTH paths)
app.get(['/health', '/healthz'], (_req, res) => {
  res.status(200).json({ ok: true, time: new Date().toISOString() });
});

// -----------------------------------------------------------------------------
// Emergency admin reset (idempotent)
// -----------------------------------------------------------------------------
app.post('/_reset-admin', async (_req, res) => {
  try {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    const name = process.env.ADMIN_NAME || 'Admin';

    if (!email || !password) {
      return res
        .status(500)
        .json({ ok: false, error: 'ADMIN_EMAIL or ADMIN_PASSWORD missing in env' });
    }

    const hash = await bcrypt.hash(password, 10);
    const updated = await User.findOneAndUpdate(
      { email },
      { email, name, role: 'admin', password: hash },
      { upsert: true, new: true }
    );

    res.json({ ok: true, email: updated.email });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// -----------------------------------------------------------------------------
// Startup (always listen; try Mongo, but don’t block the server)
// -----------------------------------------------------------------------------
const start = async () => {
  const PORT = process.env.PORT || 10000;

  try {
    if (process.env.MONGO_URI) {
      await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 10000,
      });
      console.log('[startup] Mongo connected');
    } else {
      console.warn('[startup] MONGO_URI missing — starting without DB');
    }
  } catch (err) {
    console.error('[startup] Mongo connect failed:', err.message);
  } finally {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[startup] API listening on ${PORT}`);
    });
  }
};

start();

// Optional: basic safety logs
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});