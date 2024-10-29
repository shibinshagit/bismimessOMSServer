const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  email: { type: String },
  point: { type: Schema.Types.ObjectId, ref: 'Point', required: true },
  location: {
    latitude: { type: Number },
    longitude: { type: Number }
  },
  status: { 
    type: String, 
    enum: ['Packed', 'Out', 'Delivered'], 
    default: 'Active' 
  },
  startDate: { type: Date, default: Date.now },
  isDeleted: { type: Boolean, default: false },
  orders: [{ type: Schema.Types.ObjectId, ref: 'Order' }],
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
module.exports = User;
