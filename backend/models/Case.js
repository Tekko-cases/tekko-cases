const mongoose = require('mongoose');

const CaseSchema = new mongoose.Schema(
  {
    caseNumber: { type: Number, required: true, index: true, unique: true },
    customerName: { type: String, required: true },
    phoneNumbers: [{ type: String }],
    email: { type: String },
    issue: { type: String, default: '' },
    priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
    department: { type: String, default: 'General' },

    // IMPORTANT DEFAULTS
    status: { type: String, enum: ['Open', 'Closed'], default: 'Open', index: true },
    archived: { type: Boolean, default: false, index: true },

    agent: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Case', CaseSchema);