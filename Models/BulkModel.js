// models/Bulk.js

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const leaveSchema = new Schema({
  leaveStart: { type: Date, required: true },
  leaveEnd: { type: Date, required: true },
  totalBreakfastAbsent: { type: Number, default: 0 },
  totalLunchAbsent: { type: Number, default: 0 },
  totalDinnerAbsent: { type: Number, default: 0 },
}, { _id: false });

const orderSchema = new Schema({
  totalBreakfast: { type: Number, default: 0 },
  totalLunch: { type: Number, default: 0 },
  totalDinner: { type: Number, default: 0 },
  paymentStatus: { type: String, enum: ['success', 'failed', 'pending'], default: 'pending' },
  startDate: { type: Date },
  billDate: { type: Date },
  leaves: [leaveSchema],
}, { _id: true });

const bulkSchema = new Schema({
  title: { type: String, required: true },
  location: { type: String, required: true },
  point: { type: Schema.Types.ObjectId, ref: 'Point', required: true },
  phone: { type: String, required: true },
  orders: [orderSchema],
}, { timestamps: true });

const Bulk = mongoose.model('Bulk', bulkSchema);
module.exports = Bulk;
