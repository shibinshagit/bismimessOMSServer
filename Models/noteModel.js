const mongoose = require('mongoose');

const NoteSchema = new mongoose.Schema({
  toWhom: { type: String, required: true },
  matter: { type: String, required: true },
  date: { type: String, required: true }, 
  // Using string for date simplicity. You can use Date type if preferred.
  markAsRead: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Note', NoteSchema);
