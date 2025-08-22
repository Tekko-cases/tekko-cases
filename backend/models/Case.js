const mongoose = require('mongoose');

const logSchema = new mongoose.Schema(
  {
    author: String,               // agent name
    message: String,              // the note
    files: [String],              // /uploads/... paths
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const caseSchema = new mongoose.Schema(
  {
    // identity
    caseNumber: { type: Number, unique: true, index: true },

    // customer (from Square)
    customerId: String,           // Square customer ID (optional but useful)
    customerName: { type: String, required: true },
    customerEmail: String,
    customerPhone: String,

    // case fields
    issueType: String,            // e.g. Product info / Plans / Rentals / ...
    description: String,
    priority: { type: String, default: 'Low' }, // Low / Medium / High
    agent: String,                // agent name
    status: { type: String, default: 'Open' },  // Open / Closed
    solutionSummary: String,

    // files uploaded when creating a case
    attachments: [String],

    // activity
    logs: [logSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Case', caseSchema);