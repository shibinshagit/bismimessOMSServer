// models/DeliveryBoySchema.js
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
      point: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Point',
        required: true,
      },
      relatedTo: {
        type: String,
        enum: ['all', 'user'],
        required: true,
        default: 'all',
      },
      details: {
        // Applicable only when relatedTo is 'user'
        times: {
          type: [String], // e.g., ['B', 'L', 'D']
          default: ['B', 'L', 'D'],
        },
        location: {
          type: String,
          enum: ['work', 'home'],
          default: 'home',
        },
        users: [
          {
            user: {
              type: mongoose.Schema.Types.ObjectId,
              ref: 'User',
              required: true,
            },
            times: {
              type: [String], // e.g., ['B', 'L']
              default: ['B', 'L', 'D'],
            },
            location: {
              type: String,
              enum: ['work', 'home'],
              default: 'home',
            },
          },
        ],
      },
    },
  ],
}, { timestamps: true });

module.exports = mongoose.model('DeliveryBoy', DeliveryBoySchema);
