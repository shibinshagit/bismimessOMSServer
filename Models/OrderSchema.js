// models/Order.js

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Helper function to strip time from date object.
 * @param {Date} date
 * @returns {Date}
 */
const stripTime = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const attendanceSchema = new Schema({
  date: { type: Date, required: true },
  B: { type: String, enum: ['packed', 'out for delivery', 'delivered', 'leave', 'NIL'], default: 'NIL', required: true },
  L: { type: String, enum: ['packed', 'out for delivery', 'delivered', 'leave', 'NIL'], default: 'NIL', required: true },
  D: { type: String, enum: ['packed', 'out for delivery', 'delivered', 'leave', 'NIL'], default: 'NIL', required: true },
});

const orderSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  isBilled: { type: Boolean, default: false },
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
    enum: ['active', 'leave', 'expired', 'soon', 'pending'],
    required: true,
  },
  paymentStatus: {
    type: String,
    enum: ['success', 'failed', 'pending'],
    required: true,
  },
  amount: { type: Number },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Bank', 'Online'],
  },
  paymentId: { type: String },
  isVeg: { type: Boolean, default: false }, 
  attendances: [attendanceSchema],
}, { timestamps: true });

// Pre-save middleware to initialize attendance records based on the plan
orderSchema.pre('save', function(next) {
  if (this.isNew) {
    const startDate = stripTime(this.orderStart);
    const endDate = stripTime(this.orderEnd);
    const dayMilliseconds = 24 * 60 * 60 * 1000;
    const attendanceRecords = [];

    const today = stripTime(new Date());

    for (let d = new Date(startDate); d <= endDate; d = new Date(d.getTime() + dayMilliseconds)) {
      const attendance = {
        date: new Date(d),
        B: this.plan.includes('B') ? 'packed' : 'NIL',
        L: this.plan.includes('L') ? 'packed' : 'NIL',
        D: this.plan.includes('D') ? 'packed' : 'NIL',
      };

      // If the order start date is today or before, mark all days till today as 'delivered'
      if (startDate <= today && d <= today) {
        for (const meal of ['B', 'L', 'D']) {
          if (this.plan.includes(meal)) {
            attendance[meal] = 'delivered';
          }
        }
      }

      attendanceRecords.push(attendance);
    }

    this.attendances = attendanceRecords;
  }
  next();
});

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;
