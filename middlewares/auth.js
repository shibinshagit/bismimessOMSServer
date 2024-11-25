// middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../Models/UserSchema'); // Adjust the path accordingly
const dotenv = require('dotenv');
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]; // Expecting 'Bearer TOKEN'

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication token missing' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    req.user = user; // Attach user to request
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

module.exports = authenticate;
  