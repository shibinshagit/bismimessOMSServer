// deliveryBoyController.js

const DeliveryBoy = require('../../Models/DeliveryBoySchema'); 
const Points = require('../../Models/PointSchema')
const User = require('../../Models/UserSchema')
const jwt = require("jsonwebtoken");

// Login delivery boy
const loginDeliveryBoy = async (req, res) => {

  const { phone, code } = req.body;

  try {
    // Find the delivery boy by phone number and code
    const deliveryBoy = await DeliveryBoy.findOne({ phone, code });

    if (!deliveryBoy) {
      return res.status(401).json({ error: 'Invalid phone number or code' });
    }
    const token = jwt.sign(
      { id: deliveryBoy._id },
      process.env.JWTSECRET,
      { expiresIn: "1h" }
    );
  
    res.status(200).json({ message: 'Login successful', token });
  } catch (error) {
    res.status(500).json({ error: 'Failed to login delivery boy' });
  }
};

// DBData=========================================================================
const getUserProfile = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided, authorization denied' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWTSECRET);

    const userId = decoded.id;
    const user = await DeliveryBoy.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

      res.json({
      _id: user._id,
      name: user.name,
      phone: user.phone,
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    } else {
      console.error('Error fetching user:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
};
// deliverypoints=========================================================================

const getDeliverypoints = async (req, res) => {
  try {
    const { id } = req.params; // Get delivery boy ID from request parameters
    const deliveryBoy = await DeliveryBoy.findById(id); // Find delivery boy by ID

    if (!deliveryBoy) {
      return res.status(404).json({ message: 'No delivery boy found' });
    }

    const pointsDataArray = [];

    // Loop over each point for this delivery boy
    for (const pointId of deliveryBoy.points) {
      const point = await Points.findById(pointId); // Find each point by ID
      
      if (point) {
        // Count users associated with this point
        const userCount = await User.countDocuments({ point: point._id });

        // Add point data and the user count to the response array
        pointsDataArray.push({
          point,
          userCount // Number of users associated with this point
        });
      }
    }
console.log(pointsDataArray)
    // Return the points data array, each including the point details and user count
    return res.status(200).json(pointsDataArray);
  } catch (error) {
    console.error("Error fetching delivery points:", error);
    return res.status(500).json({ message: "Failed to load points." });
  }
};

// get orders==========================
const getOrders = async (req, res) => {
  try {
   
    const { id } = req.params; // Point ID from request params
    console.log('here in the order page:',id)
    const page = parseInt(req.query.page) || 1; // Page number from query params
    const limit = 10; // Adjust the limit as needed
    const skip = (page - 1) * limit; // Calculate the number of documents to skip

    // Find users with the given point and populate their orders, implementing pagination
    const users = await User.find({ point: id, isDeleted: false })
      .populate('orders') // Populating the orders field
      .skip(skip) // Skipping documents for pagination
      .limit(limit) // Limiting the number of documents returned
      .exec();

    const totalUsers = await User.countDocuments({ point: id, isDeleted: false }); // Count total users for pagination
    const totalPages = Math.ceil(totalUsers / limit); // Calculate total pages

    if (!users || users.length === 0) {
      return res.status(404).json({ message: 'No users found for the given point' });
    }

    return res.status(200).json({ users, totalPages, currentPage: page });
  } catch (error) {
    console.error('Error fetching orders:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};













// Fetch all delivery boys
const getAllDeliveryBoys = async (req, res) => {
  try {
    const deliveryBoys = await DeliveryBoy.find({}).populate('points');
    res.status(200).json(deliveryBoys);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch delivery boys' });
  }
};

// Add a new delivery boy
const addNewDeliveryBoy = async (req, res) => {
  const { name, phone, code, points } = req.body;
  try {
    const newDeliveryBoy = new DeliveryBoy({
      name,
      phone,
      code,
      points, // Assuming points are sent as an array of point IDs
    });

    await newDeliveryBoy.save();
    res.status(201).json(newDeliveryBoy);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add delivery boy' });
  }
};

// Edit a delivery boy
const editDeliveryBoy = async (req, res) => {
  const { id } = req.params;
  const { name, phone, code, points } = req.body;

  try {
    const updatedDeliveryBoy = await DeliveryBoy.findByIdAndUpdate(
      id,
      { name, phone, code, points },
      { new: true }
    );

    if (!updatedDeliveryBoy) {
      return res.status(404).json({ error: 'Delivery boy not found' });
    }

    res.status(200).json(updatedDeliveryBoy);
  } catch (error) {
    res.status(500).json({ error: 'Failed to edit delivery boy' });
  }
};

// Delete a delivery boy
const deleteDeliveryBoy = async (req, res) => {
  const { id } = req.params;

  try {
    const deletedDeliveryBoy = await DeliveryBoy.findByIdAndDelete(id);

    if (!deletedDeliveryBoy) {
      return res.status(404).json({ error: 'Delivery boy not found' });
    }

    res.status(200).json({ message: 'Delivery boy deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete delivery boy' });
  }
};

module.exports = {
  loginDeliveryBoy,
  getAllDeliveryBoys,
  addNewDeliveryBoy,
  editDeliveryBoy,
  deleteDeliveryBoy,
  getUserProfile,
  getDeliverypoints,
  getOrders
};
