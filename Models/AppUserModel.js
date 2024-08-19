const mongoose = require("mongoose");

const appUserSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    unique: true,
  },
  otp: {
    type: String,
  },
});

module.exports = mongoose.model("AppUser", appUserSchema);
