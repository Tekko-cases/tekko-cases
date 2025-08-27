// backend/server.js
const path = require('path');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();
const bcrypt = require('bcryptjs');
const User = require('./models/User');

// Bring in our API routes (all endpoints live here)
const routes = require('./routes');

// ----------------------------------------------------------------------------
// Create app & middleware
// ----------------------------------------------------------------------------
const app = express();

app.use(cors());
app.use(express.json());

// Serve file uploads (available at https://.../uploads/<filename>)
const uploadsDir = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsDir));

// Mount our router at both / and /api so the frontend can use either
app.use('/', routes);
app.use('/api', routes);

// Simple health check for Render (Settings → Health Check Path = /health)
app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, time: new Date().toISOString() });
});

app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true, time: new Date().toISOString() });
});

// emergency admin reset route (safe to run multiple times)
app.post('/_reset-admin', async (_req, res) => {
  try {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    const name = process.env.ADMIN_NAME || 'Admin';

    if (!email || !password) {
      return res.status(500).json({ ok: false, error: 'ADMIN_EMAIL or ADMIN_PASSWORD missing in env' });
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

// ----------------------------------------------------------------------------
// Start server immediately (so Render marks it healthy) and connect MongoDB
// in the background. Slow DB? The app still boots and returns a clear log.
// ----------------------------------------------------------------------------
const PORT = process.env.PORT || 10000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API listening on ${PORT}`);
});

// Connect to MongoDB without blocking server start
(async () => {
  try {
    const uri = process.env.MONGO_URI;
    if (!uri) {
      console.warn('MONGO_URI is not set – API will run without DB.');
      return;
    }
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000, // don’t hang forever
    });
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
  }
})();