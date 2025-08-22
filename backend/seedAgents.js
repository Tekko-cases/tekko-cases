// seedAgents.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌ MONGO_URI missing in .env");
  process.exit(1);
}

const AGENTS = [
  { email: 't.brody@assistly.group', name: 'Toby' },
  { email: 'h.fried@assistly.group', name: 'Yenti' },
  { email: 's.rose@assistly.group', name: 'Sheindy' },
  { email: 'b.gold@assistly.group', name: 'Blimi' },
  { email: 't.reitzer@assistly.group', name: 'Tzivi' },
  { email: 'r.lebow@assistly.group', name: 'Roisy' },
  { email: 'c.wasser@assistly.group', name: 'Chayelle' },
  { email: 'info@assistly.group', name: 'Admin' },
];

const PASSWORD = 'Assistly1!'; // same password for all

(async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    const hash = await bcrypt.hash(PASSWORD, 10);

    for (const agent of AGENTS) {
      const user = await User.findOneAndUpdate(
        { email: agent.email.toLowerCase() },
        {
          name: agent.name,
          email: agent.email.toLowerCase(),
          passwordHash: hash,
          role: agent.email === 'info@assistly.group' ? 'admin' : 'agent',
          active: true,
        },
        { upsert: true, new: true }
      );
      console.log(`✔️  ${agent.name} (${agent.email}) ready`);
    }

    console.log("\n👉 All agents seeded successfully.");
    console.log(`Everyone's password is: ${PASSWORD}`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Error seeding agents:", err);
    process.exit(1);
  }
})();