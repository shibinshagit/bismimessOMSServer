const mongoose = require("mongoose");
const Admin = require("../Models/adminSchema");
const User = require("../Models/UserSchema");
const Order = require("../Models/OrderSchema");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// login=======================================================================================================================
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find the admin by email
    const admin = await Admin.findOne({ email });

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

// postOrder======================================================================================================================

const postOrder = async (req, res) => {
  try {
    // Extract data from request body
    const { name, phone, place, plan, paymentStatus, startDate, endDate } =
      req.body;
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({ message: "Phone number already exists" });
    }

    const newUser = new User({
      name,
      phone,
      place,
      paymentStatus,
    });

    if (paymentStatus) {
      if (plan.length === 0) {
        return res.status(204).json({ message: "Fill all plan data" });
      }

      let orderStatus = "soon";

      const currentDate = new Date();
      const orderStartDate = new Date(startDate);
      const orderEndDate = new Date(endDate);

      if (!isNaN(orderStartDate) && !isNaN(orderEndDate)) {
        if (orderStartDate <= currentDate && currentDate <= orderEndDate) {
          orderStatus = "active";
        }
      } else {
        console.error("Invalid date(s) provided");
      }

      console.log(orderStatus);

      const newOrder = new Order({
        userId: newUser._id,
        plan,
        orderStart: startDate,
        orderEnd: endDate,
        leave: [],
        status: orderStatus,
      });

      await newOrder.save();
      newUser.orders.push(newOrder._id);
      await newUser.save();
    }
    await newUser.save();
    res.status(200).json({
      message: "User and order added successfully",
      userId: newUser._id,
    });
  } catch (error) {
    console.error("Error adding user and order:", error);
    res.status(500).json({ message: "Error adding user and order" });
  }
};

// getUsers==============================================================================================================

// const getUsers = async (req, res) => {
//   try {
//     const users = await User.find().populate("orders");
//     res.status(200).json(users);
//   } catch (error) {
//     console.error("Error fetching users:", error);
//     res.status(500).json({ message: "Failed to fetch users" });
//   }
// };

const getUsers = async (req, res) => {
  try {
    const today = new Date();

    // Fetch users with their orders where orderEnd is greater than or equal to today
    const users = await User.aggregate([
      {
        $lookup: {
          from: "orders",
          localField: "orders",
          foreignField: "_id",
          as: "orders",
        },
      },
      {
        $addFields: {
          orders: {
            $filter: {
              input: "$orders",
              as: "order",
              cond: { $gte: ["$$order.orderEnd", today] },
            },
          },
        },
      },
      {
        $addFields: {
          latestOrder: {
            $arrayElemAt: ["$orders", -1],
          },
        },
      },
      {
        $project: {
          name: 1,
          phone: 1,
          place: 1,
          paymentStatus: 1,
          startDate: 1,
          latestOrder: 1,
        },
      },
    ]);

    res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Failed to fetch users" });
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
      $and: [{ orderEnd: { $gte: enteredDate } }, { status: "active" }],
    });

    // Calculate breakfast orders for the date
    const breakfastOrders = await Order.countDocuments({
      $and: [{ orderEnd: { $gte: enteredDate } }, { status: "active" }],
      plan: "B",
    });

    // Calculate lunch orders for the date
    const lunchOrders = await Order.countDocuments({
      $and: [{ orderEnd: { $gte: enteredDate } }, { status: "active" }],
      plan: "L",
    });

    // Calculate dinner orders for the date
    const dinnerOrders = await Order.countDocuments({
      $and: [{ orderEnd: { $gte: enteredDate } }, { status: "active" }],
      plan: "D",
    });

    // Construct statistics object
    const statistics = {
      totalOrders,
      breakfastOrders,
      lunchOrders,
      dinnerOrders,
    };

    // Send response with statistics
    res.status(200).json(statistics);
  } catch (error) {
    console.error("Error fetching daily statistics:", error);
    res.status(500).json({ error: "Failed to fetch daily statistics" });
  }
};

// editUser======================================================================================================================
// const editUser = async (req, res) => {
//   try {
//     const userId = req.params.id;
//     const { name, phone, place, plan, paymentStatus, startDate, endDate } = req.body;
//     const updatedUserData = req.body;

//     if (!mongoose.Types.ObjectId.isValid(userId)) {
//       return res.status(400).json({ message: "Invalid user ID" });
//     }

//     const user = User.findById({userId});
//     console.log(user)
//     const userExistingPhone = user.phone;
//     if (!userExistingPhone === phone) {
//       const existingUser = await User.findOne({ phone });
//       if (existingUser) {
//         return res.status(400).json({ message: "Phone number already exists" });
//       }
//     }

//     if (paymentStatus) {
//       if (plan.length === 0) {
//         return res.status(204).json({ message: "Fill all plan data" });
//       }

//       let orderStatus = "soon";

//       const currentDate = new Date();
//       const orderStartDate = new Date(startDate);
//       const orderEndDate = new Date(endDate);

//       if (!isNaN(orderStartDate) && !isNaN(orderEndDate)) {
//         if (orderStartDate <= currentDate && currentDate <= orderEndDate) {
//           orderStatus = "active";
//         }
//       } else {
//         console.error("Invalid date(s) provided");
//       }

//       console.log(orderStatus);

//       const newOrder = new Order({
//         userId: newUser._id,
//         plan,
//         orderStart: startDate,
//         orderEnd: endDate,
//         leave: [],
//         status: orderStatus,
//       });

//       await newOrder.save();
//       newUser.orders.push(newOrder._id);
//       await newUser.save();
//     }
//     const updatedUser = await User.findByIdAndUpdate(
//       userId,
//       { $set: updatedUserData },
//       { new: true, runValidators: true }
//     );

//     if (!updatedUser) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     res.status(200).json(updatedUser);
//   } catch (error) {
//     console.error("Error updating user:", error);
//     res.status(500).json({ message: "Server error" });
//   }
// };

// edit user ======================================================================

const editUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, place, plan, paymentStatus, startDate, endDate } = req.body;

    // Find the user by ID
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if the phone number is changed and if it already exists
    if (user.phone !== phone) {
      const existingUser = await User.findOne({ phone });
      if (existingUser) {
        return res.status(400).json({ message: "Phone number already exists" });
      }
      user.phone = phone;
    }

    // Update user details
    user.name = name;
    user.place = place;
    user.paymentStatus = paymentStatus;

    // Handle orders if payment status is updated
    if (paymentStatus) {
      if (!plan || plan.length === 0) {
        return res.status(204).json({ message: "Plan details are required" });
      }

      let orderStatus = "soon";
      const currentDate = new Date();
      const orderStartDate = new Date(startDate);
      const orderEndDate = new Date(endDate);

      if (!isNaN(orderStartDate) && !isNaN(orderEndDate)) {
        if (orderStartDate <= currentDate && currentDate <= orderEndDate) {
          orderStatus = "active";
        }
      } else {
        return res.status(400).json({ message: "Invalid date(s) provided" });
      }

      const latestOrder = await Order.findOne({ userId: user._id }).sort({ orderStart: -1 });
console.log('me',latestOrder)
      if (latestOrder) {
        latestOrder.plan = plan;
        latestOrder.orderStart = startDate;
        latestOrder.orderEnd = endDate;
        latestOrder.status = orderStatus;
        await latestOrder.save();
      } else {
        const newOrder = new Order({
          userId: user._id,
          plan,
          orderStart: startDate,
          orderEnd: endDate,
          leave: [],
          status: orderStatus,
        });

        await newOrder.save();
        user.orders.push(newOrder._id);
      }
    }

    await user.save();
    res.status(200).json({ message: "User updated successfully" });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ message: "Error updating user" });
  }
};



module.exports = {
  login,
  postOrder,
  getUsers,
  getDailyStatistics,
  editUser,
};
