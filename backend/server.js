// backend/server.js
const path = require('path');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

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