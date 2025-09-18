const mongoose = require('mongoose');

const AttachmentSchema = new mongoose.Schema({
  filename: String,
  path: String,
  size: Number,
  mimetype: String,
}, { _id: false });

const LogSchema = new mongoose.Schema({
  at: { type: Date, default: Date.now },
  by: { type: String, default: 'Agent' },
  note: { type: String, default: '' },
  files: [AttachmentSchema],
}, { _id: false });

const CaseSchema = new mongoose.Schema({
  caseNumber: { type: Number, required: true, index: true, unique: true },

  title: { type: String, default: '' },
  description: { type: String, default: '' },

  customerId: { type: String, default: null },
  customerName: { type: String, required: true },

  customerEmail: { type: String, default: '' },
  customerPhone: { type: String, default: '' },

  issueType: { type: String, enum: ['Plans', 'Billing', 'Technical', 'Activation', 'Shipping', 'Rentals', 'Other'], default: 'Other' },
  priority: { type: String, enum: ['Low', 'Normal', 'High', 'Urgent'], default: 'Normal' },

  status: { type: String, enum: ['Open', 'Closed'], default: 'Open', index: true },
  archived: { type: Boolean, default: false, index: true },

  agent: { type: String, default: 'Unassigned' },

  attachments: [AttachmentSchema],
  logs: [LogSchema],
}, { timestamps: true });

module.exports = mongoose.model('Case', CaseSchema);