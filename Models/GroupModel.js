// models/Group.js

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const groupSchema = new Schema({
  title: { type: String, required: true },
  location: { type: String, required: true },
  point: { type: Schema.Types.ObjectId, ref: 'Point', required: true },
}, { timestamps: true });

const Group = mongoose.model('Group', groupSchema);
module.exports = Group;
