// controllers/deliveryBoyController.js
const DeliveryBoy = require('../../Models/DeliveryBoySchema'); 
const Points = require('../../Models/PointSchema');
const User = require('../../Models/UserSchema');
const jwt = require("jsonwebtoken");



// Get Users by Point ID with Search and Pagination
const getUsersByPoint = async (req, res) => {
  const { pointId } = req.query;
  const { page = 1, limit = 20, search = "" } = req.query;

  if (!pointId) {
    return res.status(400).json({ error: 'Point ID is required' });
  }

  try {
    // Verify that the point exists
    const point = await Points.findById(pointId);
    if (!point) {
      return res.status(404).json({ error: 'Point not found' });
    }

    // Build search query
    const searchQuery = {
      point: pointId,
      isDeleted: false,
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ],
    };

    const users = await User.find(searchQuery)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .exec();

    const totalUsers = await User.countDocuments(searchQuery);
    const totalPages = Math.ceil(totalUsers / limit);

    res.status(200).json({ users, totalPages, currentPage: parseInt(page) });
  } catch (error) {
    console.error("Error fetching users by point:", error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};



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
      'NEWSECRET', // Replace with your actual secret and store in environment variables
      { expiresIn: "1h" }
    );

    res.status(200).json({ message: 'Login successful', token });
  } catch (error) {
    res.status(500).json({ error: 'Failed to login delivery boy data' });
  }
};

// Get Delivery Boy Profile
const getUserProfile = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided, authorization denied' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, 'NEWSECRET'); // Replace with your actual secret

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

// Get All Delivery Points with User Counts
const getDeliverypoints = async (req, res) => {
  try {
    const { id } = req.params; // Delivery Boy ID from request parameters
    const deliveryBoy = await DeliveryBoy.findById(id);

    if (!deliveryBoy) {
      return res.status(404).json({ message: 'No delivery boy found' });
    }

    const pointsDataArray = [];

    for (const pointObj of deliveryBoy.points) {
      const point = await Points.findById(pointObj.point);

      if (point) {
        const userCount = await User.countDocuments({ point: point._id });

        pointsDataArray.push({
          point,
          userCount,
          relatedTo: pointObj.relatedTo,
        });
      }
    }

    res.status(200).json(pointsDataArray);
  } catch (error) {
    console.error("Error fetching delivery points:", error);
    return res.status(500).json({ message: "Failed to load points." });
  }
};

// Get Orders (Assuming you have an Order model)
const getOrders = async (req, res) => {
  try {
    const { id } = req.params; // Point ID from request params
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const users = await User.find({ point: id, isDeleted: false })
      .populate('orders') // Assuming 'orders' is a field in User schema
      .skip(skip)
      .limit(limit)
      .exec();

    const totalUsers = await User.countDocuments({ point: id, isDeleted: false });
    const totalPages = Math.ceil(totalUsers / limit);

    if (!users || users.length === 0) {
      return res.status(404).json({ message: 'No users found for the given point' });
    }

    res.status(200).json({ users, totalPages, currentPage: page });
  } catch (error) {
    console.error('Error fetching orders:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Get All Delivery Boys with Populated Points and Users
const getAllDeliveryBoys = async (req, res) => {
  try {console.log('aaad23')
    const deliveryBoys = await DeliveryBoy.find({})
      .populate({
        path: 'points.point',
        model: 'Point',
      })
      .populate({
        path: 'points.details.users.user',
        model: 'User',
      })
      .exec();
    res.status(200).json(deliveryBoys);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch delivery boys' });
  }
};

// Add a New Delivery Boy
const addNewDeliveryBoy = async (req, res) => {
  const { name, phone, code, points } = req.body;

  // Validation
  if (!name || !phone || !code) {
    return res.status(400).json({ error: 'Name, phone, and code are required' });
  }

  if (!Array.isArray(points) || points.length === 0) {
    return res.status(400).json({ error: 'At least one point must be assigned' });
  }

  try {
    // Validate each point
    for (const pointObj of points) {
      if (!pointObj.point) {
        return res.status(400).json({ error: 'Point ID is required for each assignment' });
      }

      const pointExists = await Points.findById(pointObj.point);
      if (!pointExists) {
        return res.status(400).json({ error: `Point with ID ${pointObj.point} does not exist` });
      }

      if (pointObj.relatedTo === 'user') {
        if (!Array.isArray(pointObj.details.users) || pointObj.details.users.length === 0) {
          return res.status(400).json({ error: `At least one user must be assigned to point ${pointObj.point}` });
        }

        // Validate each user
        for (const userAssignment of pointObj.details.users) {
          const userExists = await User.findById(userAssignment.user);
          if (!userExists) {
            return res.status(400).json({ error: `User with ID ${userAssignment.user} does not exist` });
          }

          // Optional: Check if the user belongs to the point
          if (userExists.point.toString() !== pointObj.point) {
            return res.status(400).json({ error: `User ${userExists.name} does not belong to point ${pointObj.point}` });
          }
        }
      }
    }

    const newDeliveryBoy = new DeliveryBoy({
      name,
      phone,
      code,
      points,
    });

    await newDeliveryBoy.save();
    res.status(201).json(newDeliveryBoy);
  } catch (error) {
    console.error("Error adding delivery boy:", error);
    res.status(500).json({ error: 'Failed to add delivery boy' });
  }
};

// Edit a Delivery Boy
const editDeliveryBoy = async (req, res) => {
  const { id } = req.params;
  const { name, phone, code, points } = req.body;

  // Validation
  if (!name || !phone || !code) {
    return res.status(400).json({ error: 'Name, phone, and code are required' });
  }

  if (!Array.isArray(points) || points.length === 0) {
    return res.status(400).json({ error: 'At least one point must be assigned' });
  }

  try {
    const deliveryBoy = await DeliveryBoy.findById(id);
    if (!deliveryBoy) {
      return res.status(404).json({ error: 'Delivery boy not found' });
    }

    // Validate each point
    for (const pointObj of points) {
      if (!pointObj.point) {
        return res.status(400).json({ error: 'Point ID is required for each assignment' });
      }

      const pointExists = await Points.findById(pointObj.point);
      if (!pointExists) {
        return res.status(400).json({ error: `Point with ID ${pointObj.point} does not exist` });
      }

      if (pointObj.relatedTo === 'user') {
        if (!Array.isArray(pointObj.details.users) || pointObj.details.users.length === 0) {
          return res.status(400).json({ error: `At least one user must be assigned to point ${pointObj.point}` });
        }

        // Validate each user
        for (const userAssignment of pointObj.details.users) {
          const userExists = await User.findById(userAssignment.user);
          if (!userExists) {
            return res.status(400).json({ error: `User with ID ${userAssignment.user} does not exist` });
          }

          // Optional: Check if the user belongs to the point
          if (userExists.point.toString() !== pointObj.point) {
            return res.status(400).json({ error: `User ${userExists.name} does not belong to point ${pointObj.point}` });
          }
        }
      }
    }

    // Update the delivery boy
    deliveryBoy.name = name;
    deliveryBoy.phone = phone;
    deliveryBoy.code = code;
    deliveryBoy.points = points;

    await deliveryBoy.save();
    res.status(200).json(deliveryBoy);
  } catch (error) {
    console.error("Error editing delivery boy:", error);
    res.status(500).json({ error: 'Failed to edit delivery boy' });
  }
};

// Delete a Delivery Boy
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
  getUserProfile,
  getDeliverypoints,
  getOrders,
  getAllDeliveryBoys,
  addNewDeliveryBoy,
  editDeliveryBoy,
  deleteDeliveryBoy,
  getUsersByPoint,
};
