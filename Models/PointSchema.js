// Point.js

const mongoose = require('mongoose');

const PointSchema = new mongoose.Schema({
  place: {
    type: String,
    required: true,
    unique: true,
  },
  mode: {
    type: String,
    enum: ['single', 'cluster'],
    required: true,
  },
});

module.exports = mongoose.model('Point', PointSchema);
