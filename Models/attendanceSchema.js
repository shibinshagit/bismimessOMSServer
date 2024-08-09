const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const attendanceSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: {
        type: Date,
        required: true
    },
    morningAttendance: {
        type: Boolean,
        default: false
    },
    afternoonAttendance: {
        type: Boolean,
        default: false
    },
    eveningAttendance: {
        type: Boolean,
        default: false
    }
  });
  
  const Attendance = mongoose.model('Attendance', attendanceSchema);
  module.exports = Attendance;
  
  