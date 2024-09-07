const mongoose = require('mongoose');
const Schema = mongoose.Schema;

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
});

const User = mongoose.model('User', userSchema);
module.exports = User;

