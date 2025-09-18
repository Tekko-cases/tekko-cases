// backend/seedAgents.js
require('dotenv').config({ path: '.env' });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('❌ MONGO_URI missing in .env');
  process.exit(1);
}

/**
 * Add agents here. You can optionally include a `password` per agent.
 * If `password` is omitted, DEFAULT_PASSWORD will be used.
 *
 * NOTE: If someone has no real email, give a harmless placeholder.
 * (Your auth likely looks users up by email, so we keep the field.)
 */
const AGENTS = [
  { email: 't.brody@assistly.group',   name: 'Toby'   },
  { email: 'h.fried@assistly.group',   name: 'Yenti'  },
  { email: 's.rose@assistly.group',    name: 'Sheindy'},
  { email: 'b.gold@assistly.group',    name: 'Blimi'  },
  { email: 't.reitzer@assistly.group', name: 'Tzivi'  },
  { email: 'r.lebow@assistly.group',   name: 'Roisy'  },
  { email: 'c.wasser@assistly.group',  name: 'Chayelle' },
  { email: 'info@assistly.group',      name: 'Admin' },

  // ➕ GLEN — uses a placeholder email + his own password
  { email: 'glen@assistly.local',      name: 'Glen', password: 'Tekko123' },
];

// Default password for everyone who doesn't specify `password`
const DEFAULT_PASSWORD = 'Assistly1!';

(async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Pre-hash default once
    const defaultHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    for (const agent of AGENTS) {
      const email = String(agent.email || '').toLowerCase().trim();
      const name  = String(agent.name || '').trim();

      if (!email || !name) {
        console.warn('⚠️  Skipping agent with missing email or name:', agent);
        continue;
      }

      // Use per-user password if provided, else default
      const hash = agent.password
        ? await bcrypt.hash(agent.password, 10)
        : defaultHash;

      // Upsert by email so re-running the script is safe (idempotent)
      await User.findOneAndUpdate(
        { email },
        {
          email,
          name,
          passwordHash: hash,
          role: 'agent',
          active: true,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      console.log(`✅ Seeded/updated agent: ${name} <${email}>`);
    }

    console.log('🎉 Seeding complete.');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed', err);
    process.exit(1);
  }
})();