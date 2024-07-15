const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const AdminSchema = new Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});

// Create a model from the schema
const Admin = mongoose.model('Admin', AdminSchema);

module.exports = Admin;
