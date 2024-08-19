const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const User = require("../../Models/AppUserModel");

// Utility function to generate OTP
const generateOtp = () => Math.floor(1000 + Math.random() * 9000).toString();

// login
const login = async (req, res) => {
  const { phone } = req.body;

  try {
    let user = await User.findOne({ phone });

    if (user) {
      // User exists, generate and update OTP
    //   user.otp = generateOtp();
      user.otp = '1111'
    } else {
      // User does not exist, create new user and generate OTP
      user = new User({
        phone,
        // otp: generateOtp(),
        otp: '1111',
      });
    }

    await user.save();


    res.status(200).json({ success: true, message: "OTP sent", phone });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// OTP check
const otpCheck = async (req, res) => {
  const { phone, otp } = req.body;

  try {
    const user = await User.findOne({ phone });

    if (user && user.otp === otp) {
      // OTP matches, create JWT token
      const token = jwt.sign({ id: user._id }, "your_jwt_secret_key", {
        expiresIn: "1h",
      });

      res.status(200).json({ success: true, message: "OTP verified", user, token });
    } else {
      res.status(400).json({ success: false, message: "Invalid OTP" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  login,
  otpCheck,
};
