const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const User = require("../../Models/UserSchema"); 
const Order = require("../../Models/OrderSchema"); 
const twilio = require('twilio');
const dotenv = require('dotenv');
dotenv.config();

// Secret key for JWT
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

const stripTime = (date) => {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  return utcDate;
};
// In-memory store for OTPs (Note: Use a database or cache like Redis in production)
const otpStore = {}; // Key: phone number, Value: OTP code

// Send OTP via Twilio
const sendOtp = async (phone) => {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID; 
    const authToken = process.env.TWILIO_TOKEN;
    const twilioPhoneNumber = process.env.TWILIO_NUMBER;

    const client = new twilio(accountSid, authToken);

    function generateOTP() {
      return Math.floor(1000 + Math.random() * 9000).toString();
    }

    const otpCode = generateOTP();

    await client.messages.create({
      body: `Your OTP code is: ${otpCode}`,
      from: twilioPhoneNumber,
      to: '+91' + phone,
    });

    console.log(`OTP sent to ${phone}.`);

    // Store OTP in memory (In production, use a persistent store)
    otpStore[phone] = otpCode;

    return true;
  } catch (error) {
    console.error(`Error in sendOtp: ${error.message}`);
    return false;
  }
};

// Login - Send OTP
const login = async (req, res) => {
  const { phone } = req.body;

  try {
    // Validate phone number format
    if (!phone || !/^\d{10}$/.test(phone)) {
      return res.status(400).json({ success: false, message: 'Invalid phone number' });
    }
   
    // Send OTP to the user's phone
    const otpSent = await sendOtp(phone);
    if (!otpSent) {
      return res.status(500).json({ success: false, message: 'Failed to send OTP' });
    }

    res.json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// OTP Verification
const otpCheck = async (req, res) => {
  const { phone, otp } = req.body;

  try {
    // Validate input
    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: 'Phone and OTP are required' });
    }

    // Verify OTP
    const storedOtp = otpStore[phone];
    if (!storedOtp || storedOtp !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    // Clear OTP from store   
    delete otpStore[phone];

    // Find or create user
    let user = await User.findOne({ phone });
    console.log('usr',user)
    if (!user) {
      user = new User({ phone, usingApp: true });
      await user.save();
    } else {
      // Update usingApp to true if it's not already
      if (!user.usingApp) {
        user.usingApp = true;
        await user.save();
      }
    }

    // Generate JWT token
    const tokenPayload = { userId: user._id };
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '30d' }); // Token valid for 30 days

    res.json({
      success: true,
      message: 'OTP verified',
      token,
      userData: user,
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
// controllers/appController.js
const getUserOrders = async (req, res) => {
  const userId = req.user._id;

  // Debugging Logs
  console.log('Received userId:', userId);
  console.log('Type of userId:', typeof userId);
  console.log('Is userId an ObjectId:', userId instanceof mongoose.Types.ObjectId);

  // Validate userId to ensure it's a valid ObjectId
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ success: false, message: 'Invalid user ID.' });
  }

  // Convert userId to ObjectId if it's a string
  const userObjectId = (userId instanceof mongoose.Types.ObjectId) ? userId : new mongoose.Types.ObjectId(userId);

  try {
    const today = stripTime(new Date());

    // **First Query:** Fetch active orders
    const activeOrders = await Order.find({
      userId: userObjectId,
      status: { $in: ['active', 'leave'] }, // Include only 'active' or 'leave' statuses
      orderStart: { $lte: today }, // orderStart is on or before today
      orderEnd: { $gte: today },   // orderEnd is on or after today
    })
    .sort({ orderStart: -1 }) // Sort by orderStart descending (most recent first)
    .exec();

    if (activeOrders.length > 0) {
      // Active orders found, return them
      return res.status(200).json({ success: true, orders: activeOrders });
    }

    // **Second Query:** If no active orders, fetch 'soon' orders
    const soonOrders = await Order.find({
      userId: userObjectId,
      status: 'soon',
      orderStart: { $gte: today }, // Assuming 'soon' orders have start dates in the future
    })
    .sort({ orderStart: 1 }) // Sort by orderStart ascending (soonest first)
    .exec();

    if (soonOrders.length > 0) {
      // 'Soon' orders found, return them
      return res.status(200).json({ success: true, orders: soonOrders });
    }

    // If neither active nor 'soon' orders are found
    return res.status(200).json({ success: true, orders: [], message: 'No active or soon orders found.' });

  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

// Update updateProfile as well
const updateProfile = async (req, res) => {
  const { name, email } = req.body;
  const userId = req.user._id;

  try {
    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required.' });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { name, email },
      { new: true }
    );

    res.json({ success: true, userData: updatedUser });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};







// controllers/appController.js
const addLeave = async (req, res) => {
  const userId = req.user._id;
  const orderId = req.params.orderId;
  const { startDate, endDate } = req.body;
  let start = startDate
  let end = endDate
  console.log(req.body)

  try {
    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const newLeave = {
      start,
      end,
      meals: ['B']
    };

    order.leave.push(newLeave);
    await order.save();

    res.json({ success: true, message: 'Leave added successfully.' });
  } catch (error) {
    console.error('Add leave error:', error);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

const deleteLeave = async (req, res) => {
  const userId = req.user._id;
  const orderId = req.params.orderId;
  const leaveId = req.params.leaveId;

  try {
    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    order.leave = order.leave.filter((leave) => leave._id.toString() !== leaveId);
    await order.save();

    res.json({ success: true, message: 'Leave deleted successfully.' });
  } catch (error) {
    console.error('Delete leave error:', error);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

const getLeaves = async (req, res) => {
  const userId = req.user._id;
  const orderId = req.params.orderId;

  try {
    const order = await Order.findOne({ _id: orderId, userId }).select('leave');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    res.json({ success: true, leaves: order.leave });
  } catch (error) {
    console.error('Get leaves error:', error);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

// Helper function to calculate number of leaves
function calculateNumberOfLeaves(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start) + 1;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}


const getUserById = async (req, res) => {
  try {
 console.log('aina app in ')
    const { id } = req.user._id;
    
    if (!id) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const today = stripTime(new Date());

    const user = await User.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(id) } },
      {
        $lookup: {
          from: 'orders',
          let: { userOrders: '$orders' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $in: ['$_id', '$$userOrders'],
                },
              },
            },
            // Add a field to indicate if the order is active today
            {
              $addFields: {
                isActiveOrder: {
                  $cond: {
                    if: {
                      $and: [
                        { $in: ['$status', ['active', 'leave']] },
                        { $lte: ['$orderStart', today] },
                        { $gte: ['$orderEnd', today] },
                      ],
                    },
                    then: 1,
                    else: 0,
                  },
                },
              },
            },
            // Sort by isActiveOrder descending and orderStart descending
            {
              $sort: { isActiveOrder: -1, orderStart: -1 },
            },
            { $limit: 1 },
          ],
          as: 'latestOrder',
        },
      },
      { $addFields: { latestOrder: { $arrayElemAt: ['$latestOrder', 0] } } },
      {
        $project: {
          name: 1,
          phone: 1,
          point: 1,
          group: 1,
          location: 1,
          paymentStatus: 1,
          startDate: 1,
          images: 1,
          latestOrder: 1,
        },
      },
    ]);

    if (!user || user.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user[0]);
  } catch (error) {
    console.error("Error fetching user by ID:", error);
    res.status(500).json({ message: "Failed to fetch user" });
  }
};

module.exports = {
  login,
  otpCheck,
  getUserOrders,
  updateProfile,
  addLeave,
  deleteLeave,
  getLeaves,  
  getUserById
};
