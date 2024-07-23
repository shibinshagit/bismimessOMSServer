const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  place: { type: String, required: true },
  paymentStatus: { type: Boolean, required: true },
  startDate: { type: Date, default: Date.now },
  orders: [{ type: Schema.Types.ObjectId, ref: 'Order' }],
  isDeleted: { type: Boolean, default: false },
});

const User = mongoose.model('User', userSchema);
module.exports = User;
