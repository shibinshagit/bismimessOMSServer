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
  startDate: { type: Date, default: Date.now },
  isDeleted: { type: Boolean, default: false },
  orders: [{ type: Schema.Types.ObjectId, ref: 'Order' }],
  images: [{ type: String }], // Array to store image URLs
  group: { type: Schema.Types.ObjectId, ref: 'Group' },
}, { timestamps: true });



// Define virtual field 'latestOrder'
userSchema.virtual('latestOrder', {
  ref: 'Order',
  localField: '_id',
  foreignField: 'userId',
  justOne: true,
  options: { sort: { orderEnd: -1 } }, // Adjust 'orderEnd' to the correct date field in your Order schema
});

// Ensure virtual fields are serialized
userSchema.set('toObject', { virtuals: true });
userSchema.set('toJSON', { virtuals: true });



const User = mongoose.model('User', userSchema);
module.exports = User;
