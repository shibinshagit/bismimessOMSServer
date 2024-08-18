const mongoose = require("mongoose");
const cron = require('node-cron');
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const Admin = require("../../Models/adminSchema");
const User = require("../../Models/UserSchema");
const Order = require("../../Models/OrderSchema");
const Attendance = require("../../Models/attendanceSchema");

const stripTime = (date) => new Date(date.setHours(0, 0, 0, 0));

// login=======================================================================================================================
const login = async (req, res) => {
    try {


        console.log('app is working')
    //   const { email, password } = req.body;
  
    //   // Find the admin by email
    //   const admin = await Admin.findOne({ email });
  
      if (!admin) {
        return res.status(400).json({ error: "Unauthorized" });
      }
  
      // Compare the provided password with the stored hash
      const isMatch = await bcrypt.compare(password, admin.password);
  
      if (isMatch) {
        // Generate a JWT token
        const token = jwt.sign(
          { id: admin._id, email: admin.email },
          "your_jwt_secret_key",
          { expiresIn: "1h" }
        );
        res.status(200).json({
          success: true,
          message: "Login successful",
          token,
        });
      } else {
        res.status(400).json({ error: "Unauthorized" });
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  };
  


  module.exports = {
    login
  }