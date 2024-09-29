const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const attendanceSchema = new Schema({
  date: { type: Date, required: true },
  present: { type: Boolean, required: true, default: false },
  breakfast: { type: Boolean, default: false },
  lunch: { type: Boolean, default: false },
  dinner: { type: Boolean, default: false },
});

const userSchema = new Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  point: { type: Schema.Types.ObjectId, ref: 'Point', required: true },
  location: {
    latitude: { type: Number },
    longitude: { type: Number }
  },
  paymentStatus: { type: Boolean, required: true },
  status: { type: String, enum: ['Packed', 'Out', 'Delivered'], default: 'Packed' },
  startDate: { type: Date, default: Date.now },
  orders: [{ type: Schema.Types.ObjectId, ref: 'Order' }],
  isDeleted: { type: Boolean, default: false },
  attendance: [attendanceSchema]  // Attendance with specific times
});

const User = mongoose.model('User', userSchema);
module.exports = User;
