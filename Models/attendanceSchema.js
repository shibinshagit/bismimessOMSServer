const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const attendanceSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  meals: [{
    type: String,
    enum: ['Breakfast', 'Lunch', 'Dinner'],
    required: true
  }],
  status: { 
    type: String, 
    enum: ['Delivered', 'Not Delivered', 'Cancelled'], 
    default: 'Not Delivered' 
  },
  feedback: { type: String },
  timestamp: { type: Date, default: Date.now },
}, { timestamps: true });

const Attendance = mongoose.model('Attendance', attendanceSchema);
module.exports = Attendance;
