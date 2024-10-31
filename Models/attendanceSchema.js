// models/attendance.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const attendanceSchema = new Schema({
  date: { type: Date, required: true },
  B: { type: String, enum: ['packed', 'out for delivery', 'delivered', 'leave'], default: 'packed',  },
  L: { type: String, enum: ['packed', 'out for delivery', 'delivered', 'leave'], default: 'packed', },
  D: { type: String, enum: ['packed', 'out for delivery', 'delivered', 'leave'], default: 'packed', },
});

const Attendance = mongoose.model('Attendance', attendanceSchema);
module.exports = Attendance;
