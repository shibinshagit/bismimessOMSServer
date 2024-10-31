// models/Order.js
const mongoose = require('mongoose');
const Attendance = require('../Models/attendanceSchema');
const Schema = mongoose.Schema;

/**
 * Helper function to strip time from date object.
 * @param {Date} date
 * @returns {Date}
 */
const stripTime = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const orderSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  point: { type: Schema.Types.ObjectId, ref: 'Point', required: true }, // Assuming Point reference
  plan: {
    type: [String],
    enum: ['B', 'L', 'D'],
    required: true,
  },
  orderStart: { type: Date, required: true },
  orderEnd: { type: Date, required: true },
  leave: [
    {
      start: { type: Date, required: true },
      end: { type: Date, required: true },
      numberOfLeaves: { type: Number, required: true, max: 8 },
    },
  ],
  status: {
    type: String,
    enum: ['active', 'leave', 'expired', 'soon'],
    required: true,
  },
  amount: { type: Number },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Bank', 'Online'],
  },
  paymentId: { type: String },
  attendances: [Attendance.schema],  // Use Attendance schema directly
}, { timestamps: true });

// Pre-save middleware to initialize attendance records
orderSchema.pre('save', function(next) {
  if (this.isNew) {
    const startDate = stripTime(this.orderStart);
    const endDate = stripTime(this.orderEnd);
    const dayMilliseconds = 24 * 60 * 60 * 1000;
    const attendanceRecords = [];

    for (let d = new Date(startDate); d <= endDate; d = new Date(d.getTime() + dayMilliseconds)) {
      attendanceRecords.push({
        date: new Date(d),
        B: 'packed',
        L: 'packed',
        D: 'packed',
      });
    }

    this.attendances = attendanceRecords;
  }
  next();
});

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;
