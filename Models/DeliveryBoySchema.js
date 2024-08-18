// DeliveryBoy.js

const mongoose = require('mongoose');

const DeliveryBoySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    required: true,
    unique: true,
  },
  code: {
    type: String,
    required: true,
  },
  points: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Point',
    },
  ],
});

module.exports = mongoose.model('DeliveryBoy', DeliveryBoySchema);
