const Admin = require('../Models/adminSchema')
const User = require('../Models/UserSchema');
const Order = require('../Models/OrderSchema');

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// login=======================================================================================================================
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find the admin by email
        const admin = await Admin.findOne({ email });

        if (!admin) {
            return res.status(400).json({ error: 'Unauthorized' });
        }

        // Compare the provided password with the stored hash
        const isMatch = await bcrypt.compare(password, admin.password);

        if (isMatch) {
            // Generate a JWT token 
            const token = jwt.sign(
                { id: admin._id, email: admin.email },
                'your_jwt_secret_key', // Replace with your actual secret key
                { expiresIn: '1h' }
            );

            res.status(200).json({
                success: true,
                message: 'Login successful',
                token
            });
        } else {
            res.status(400).json({ error: 'Unauthorized' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// postOrder======================================================================================================================

const postOrder = async (req, res) => {
  try {
    // Extract data from request body
    const { name, phone, place, plan, paymentStatus, startDate, endDate } = req.body;

    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({ message: 'Phone number already exists' });
    }
   
    const newUser = new User({
      name,
      phone,
      place,
      paymentStatus,
    });

    await newUser.save();


    if (paymentStatus) {

        let orderStatus = 'leave';

        const currentDate = new Date();
        const orderStartDate = new Date(startDate);
        const orderEndDate = new Date(endDate);
        
        if (orderStartDate.getTime() <= currentDate.getTime() && currentDate.getTime() <= orderEndDate.getTime()) {
          orderStatus = 'active';
        }
        

      const newOrder = new Order({
        userId: newUser._id,
        plan,
        orderStart: startDate,
        orderEnd: endDate,
        leave: [],
        status: orderStatus 
      });

      await newOrder.save();
      newUser.orders.push(newOrder._id);
      await newUser.save(); 
    }

    res.status(200).json({ message: 'User and order added successfully', userId: newUser._id });
  } catch (error) {
    console.error('Error adding user and order:', error);
    res.status(500).json({ message: 'Error adding user and order' });
  }
};

// getUsers==============================================================================================================

const getUsers = async (req, res) => {
    try {
      const users = await User.find().populate('orders');
      res.status(200).json(users); 
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ message: 'Failed to fetch users' }); 
    }
  };


// getDailyStatistics=====================================================================================================

const getDailyStatistics = async (req, res) => {
    const { date } = req.query;
    try {
      // Parse the date and create start and end times for the day
      const enteredDate = new Date(date); // Make sure 'date' is properly formatted

      // Calculate total orders for the date
      const totalOrders = await Order.countDocuments({
        $and: [
          { orderEnd: { $gte: enteredDate } },
          { status: 'active' }
        ]
      });
      
  
      // Calculate breakfast orders for the date
      const breakfastOrders = await Order.countDocuments({
        $and: [
          { orderEnd: { $gte: enteredDate } },
          { status: 'active' }
        ],
        plan: 'B'
      });
      
  
      // Calculate lunch orders for the date
      const lunchOrders = await Order.countDocuments({
        $and: [
            { orderEnd: { $gte: enteredDate } },
            { status: 'active' }
          ],
          plan: 'L'
        });

      // Calculate dinner orders for the date
      const dinnerOrders = await Order.countDocuments({
        $and: [
          { orderEnd: { $gte: enteredDate } },
          { status: 'active' }
        ],
        plan: 'D'
      });
      
      // Construct statistics object
      const statistics = {
        totalOrders,
        breakfastOrders,
        lunchOrders,
        dinnerOrders
      };
  
      // Send response with statistics
      res.status(200).json(statistics);
    } catch (error) {
      console.error('Error fetching daily statistics:', error);
      res.status(500).json({ error: 'Failed to fetch daily statistics' });
    }
  };
  
  








module.exports = {
    login, postOrder, getUsers, getDailyStatistics
}