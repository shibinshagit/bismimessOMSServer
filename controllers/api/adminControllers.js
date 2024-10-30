const mongoose = require("mongoose");
const cron = require('node-cron');
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const Admin = require("../../Models/adminSchema");
const User = require("../../Models/UserSchema");
const Point = require("../../Models/PointSchema");
const Order = require("../../Models/OrderSchema");
const Attendance = require("../../Models/attendanceSchema");


// const stripTime = (date) => new Date(date.setHours(0, 0, 0, 0));

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
const postUser = async (req, res) => {
  try {
    const { name, phone, email, point, status } = req.body;

    // Check if user with the phone number already exists
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({ message: "Phone number already exists" });
    }

    // Create new user
    const newUser = new User({
      name,
      phone,
      email,
      point,
      status,
    });

    await newUser.save();

    res.status(201).json({
      message: "User added successfully",
      userId: newUser._id,
    });
  } catch (error) {
    console.error("Error adding user:", error);
    res.status(500).json({ message: "Error adding user" });
  }
};

// Helper function to strip time from Date
const stripTime = (date) => {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};
   
// POST /api/orders
const postOrder = async (req, res) => {
  try {
    const {
      userId,                                      
      plan,
      paymentStatus,
      amount,
      paymentMethod,
      paymentId,
      orderStart,
      orderEnd,
    } = req.body;

    console.log('Order Data:', req.body);

    // Validate required fields
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    if (!plan || plan.length === 0) {
      return res.status(400).json({ message: "Plan is required" });
    }

    if (!paymentStatus) {
      return res.status(400).json({ message: "Payment status is required" });
    }

    if (!orderStart || !orderEnd) {
      return res.status(400).json({ message: "Order start and end dates are required" });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Determine order status
    let orderStatus = "Expiring Soon";

    const currentDate = stripTime(new Date());
    const orderStartDate = stripTime(new Date(orderStart));
    const orderEndDate = stripTime(new Date(orderEnd));

    if (!isNaN(orderStartDate) && !isNaN(orderEndDate)) {
      if (orderStartDate <= currentDate && currentDate <= orderEndDate) {
        orderStatus = "Active";
      } else if (currentDate < orderStartDate) {
        orderStatus = "Expiring Soon";
      } else {
        orderStatus = "Expired";
      }
    } else {
      console.error("Invalid date(s) provided");
      return res.status(400).json({ message: "Invalid date(s) provided" });
    }

    // Build order data
    const orderData = {
      userId,
      plan,
      orderStart,
      orderEnd,
      leave: [],
      status: orderStatus,
      paymentStatus,
    };

    // Handle payment details if paymentStatus is 'Completed'
    if (paymentStatus === 'Completed') {
      if (!amount || !paymentMethod || !paymentId) {
        return res.status(400).json({ message: "Payment details are required when payment is completed" });
      }
      orderData.amount = amount;
      orderData.paymentMethod = paymentMethod;
      orderData.paymentId = paymentId;
    }

    // Create new order
    const newOrder = new Order(orderData);

    await newOrder.save();

    // Add order ID to user's orders array
    user.orders.push(newOrder._id);
    await user.save();

    res.status(201).json({
      message: "Order added successfully",
      orderId: newOrder._id,
    });
  } catch (error) {
    console.error("Error adding order:", error);
    res.status(500).json({ message: "Error adding order" });
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

// const getUsers = async (req, res) => {
//   try {
//     const today = new Date();

//     // Fetch users with their orders where orderEnd is greater than or equal to today
//     const users = await User.aggregate([
//       {
//         $lookup: {
//           from: "orders",
//           localField: "orders",
//           foreignField: "_id",
//           as: "orders",
//         },
//       },
//       {
//         $addFields: {
//           orders: {
//             $filter: {
//               input: "$orders",
//               as: "order",
//               cond: { $gte: ["$$order.orderEnd", today] },
//             },
//           },
//         },
//       },
//       {
//         $addFields: {
//           latestOrder: {
//             $arrayElemAt: ["$orders", -1],
//           },
//         },
//       },
//       {
//         $project: {
//           name: 1,
//           phone: 1,
//           place: 1,
//           paymentStatus: 1,
//           startDate: 1,
//           latestOrder: 1,
//         },
//       },
//     ]);

//     res.status(200).json(users);
//   } catch (error) {
//     console.error("Error fetching users:", error);
//     res.status(500).json({ message: "Failed to fetch users" });
//   }
// };

const getUsers = async (req, res) => {
  try {
    const today = new Date();
    const { page = 1, limit = 500, searchTerm = '', filter = '' } = req.query;
    const { id: pointId } = req.params;  // Get the point ID from the route parameters

    const skip = (page - 1) * limit;
    const query = {};

    if (searchTerm) {
      query.$or = [
        { name: { $regex: searchTerm, $options: 'i' } },
        { phone: { $regex: searchTerm, $options: 'i' } }
      ];
    }

    if (filter && filter !== 'All') {
      query['latestOrder.status'] = filter;
    }

    if (pointId) {
      query['point'] = new mongoose.Types.ObjectId(pointId);  // Convert pointId to ObjectId correctly
    }

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
          latestOrder: {
            $arrayElemAt: ["$orders", -1],  // Get the last order in the orders array
          },
        },
      },
      {
        $addFields: {
          latestAttendance: {
            $arrayElemAt: ["$attendance", -1],  // Get the latest attendance in the attendance array
          },
        },
      },
      {
        $match: query,
      },
      {
        $addFields: {
          isPastOrder: {
            $cond: {
              if: { $lt: ["$latestOrder.orderEnd", today] },  // Check if latestOrder.orderEnd is less than today
              then: 1,
              else: 0,
            },
          },
        },
      },
      {
        $sort: { isPastOrder: -1 },  // Sort by isPastOrder (1 means older order first)
      },
      {
        $skip: parseInt(skip, 10),
      },
      {
        $limit: parseInt(limit, 10),
      },
      {
        $project: {
          name: 1,
          phone: 1,
          point: 1,
          location: 1,
          paymentStatus: 1,
          startDate: 1,
          latestOrder: 1,  // Return the latest order details
          latestAttendance: 1,  // Return only the latest attendance details
          isPastOrder: 1,  // Keep this for debugging if needed
        },
      },
    ]);
console.log('data::',users[0])
    res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Failed to fetch users" });
  }
};

// get user by id--
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;  // Get the user ID from the route parameters

    if (!id) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const user = await User.aggregate([
      {
        $match: { _id: new mongoose.Types.ObjectId(id) }  // Match the user with the given ID
      },
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
          latestOrder: {
            $arrayElemAt: ["$orders", -1],  // Get the last order in the orders array
          },
        },
      },
      {
        $addFields: {
          latestAttendance: {
            $arrayElemAt: ["$attendance", -1],  // Get the latest attendance in the attendance array
          },
        },
      },
      {
        $project: {
          name: 1,
          phone: 1,
          point: 1,
          location: 1,
          paymentStatus: 1,
          startDate: 1,
          latestOrder: 1,  // Return the latest order details
          latestAttendance: 1,  // Return only the latest attendance details
        },
      },
    ]);

    if (!user || user.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user[0]);  // Return the first item in the array since the aggregation returns an array
  } catch (error) {
    console.error("Error fetching user by ID:", error);
    res.status(500).json({ message: "Failed to fetch user" });
  }
};

const getPointsWithLeaveToday = async (req, res) => {
  try {
    const today = stripTime(new Date());

    const pointsWithLeave = await Point.aggregate([
      {
        $lookup: {
          from: 'users', // Ensure the collection name is correct (usually lowercase plural)
          localField: '_id',
          foreignField: 'point',
          as: 'users',
        },
      },
      {
        $lookup: {
          from: 'orders', // Ensure the collection name is correct (usually lowercase plural)
          localField: 'users.orders', // 'users' has an array 'orders'
          foreignField: '_id',
          as: 'orders',
        },
      },
      {
        $addFields: {
          users: {
            $map: {
              input: '$users',
              as: 'user',
              in: {
                $mergeObjects: [
                  '$$user',
                  {
                    latestOrder: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: '$orders',
                            as: 'order',
                            cond: { $eq: ['$$order.userId', '$$user._id'] },
                          },
                        },
                        -1,
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      },
      {
        $project: {
          orders: 0, // Exclude orders as they are now embedded in users.latestOrder
        },
      },
      {
        $addFields: {
          users: {
            $map: {
              input: '$users',
              as: 'user',
              in: {
                _id: '$$user._id',
                name: '$$user.name',
                phone: '$$user.phone',
                email: '$$user.email',
                // Include other user fields as needed
                latestOrder: '$$user.latestOrder',
              },
            },
          },
        },
      },
      {
        $addFields: {
          usersOnLeaveToday: {
            $filter: {
              input: '$users',
              as: 'user',
              cond: {
                $and: [
                  { $ifNull: ['$$user.latestOrder', false] }, // Ensure latestOrder exists
                  {
                    $gt: [
                      {
                        $size: {
                          $filter: {
                            input: '$$user.latestOrder.leave',
                            as: 'leave',
                            cond: {
                              $and: [
                                { $lte: ['$$leave.start', today] },
                                { $gte: ['$$leave.end', today] },
                              ],
                            },
                          },
                        },
                      },
                      0,
                    ],
                  },
                ],
              },
            },
          },
        },
      },
      {
        $project: {
          place: 1, // 'place' field from Point model
          totalUsers: { $size: '$users' },
          totalLeaveToday: { $size: '$usersOnLeaveToday' },
          usersOnLeaveToday: 1,
        },
      },
      {
        $sort: { place: 1 }, // Sort points alphabetically by 'place'
      },
    ]);

    res.status(200).json(pointsWithLeave);
  } catch (error) {
    console.error("Error fetching points with leave today:", error);
    res.status(500).json({ message: "Failed to fetch points with leave today" });
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
    const { name, phone, point, plan, paymentStatus, startDate, endDate } = req.body;
    
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
    user.point = point;
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
      
    
      
      const strippedCurrentDate = stripTime(currentDate);
      const strippedOrderStartDate = stripTime(orderStartDate);
      const strippedOrderEndDate = stripTime(orderEndDate);
      
      console.log('dateCheck:', strippedCurrentDate, 'new:', strippedOrderStartDate);
      
      if (!isNaN(strippedOrderStartDate) && !isNaN(strippedOrderEndDate)) {
        if (strippedOrderStartDate <= strippedCurrentDate && strippedCurrentDate <= strippedOrderEndDate) {
          orderStatus = "active";
        }
      } else {
        return res.status(400).json({ message: "Invalid date(s) provided" });
      }
      

      const latestOrder = await Order.findOne({ userId: user._id }).sort({ orderStart: -1 });
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
// deleteUser===========================================================================================================================================
const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;

    // Find the user by ID
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Delete all orders associated with the users
    await Order.deleteMany({ userId });

    // Delete the user
    await User.findByIdAndDelete(userId);

    return res.status(200).json({ message: 'User and their orders deleted permanently' });
  } catch (error) {
    console.error('Error deleting user and their orders:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

const getPointsWithExpiredUsers = async (req, res) => {
  try {
    const today = stripTime(new Date());

    const pointsWithExpiredUsers = await Point.aggregate([
      {
        $lookup: {
          from: 'users', // Ensure the collection name is lowercase plural
          localField: '_id',
          foreignField: 'point',
          as: 'users',
        },
      },
      {
        $lookup: {
          from: 'orders', // Ensure the collection name is lowercase plural
          localField: 'users.orders', // 'users' has an array 'orders'
          foreignField: '_id',
          as: 'orders',
        },
      },
      {
        $addFields: {
          users: {
            $map: {
              input: '$users',
              as: 'user',
              in: {
                $mergeObjects: [
                  '$$user',
                  {
                    latestOrder: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: '$orders',
                            as: 'order',
                            cond: { $eq: ['$$order.userId', '$$user._id'] },
                          },
                        },
                        -1, // Get the latest order
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      },
      {
        $project: {
          orders: 0, // Exclude orders as they are now embedded in users.latestOrder
        },
      },
      {
        $addFields: {
          users: {
            $map: {
              input: '$users',
              as: 'user',
              in: {
                _id: '$$user._id',
                name: '$$user.name',
                phone: '$$user.phone',
                email: '$$user.email',
                // Include other user fields as needed
                latestOrder: '$$user.latestOrder',
              },
            },
          },
        },
      },
      {
        $addFields: {
          usersExpired: {
            $filter: {
              input: '$users',
              as: 'user',
              cond: {
                $and: [
                  { $ifNull: ['$$user.latestOrder', false] }, // Ensure latestOrder exists
                  { $eq: ['$$user.latestOrder.status', 'expired'] }, // Check if latest order is expired
                ],
              },
            },
          },
        },
      },
      {
        $project: {
          place: 1, // 'place' field from Point model
          totalUsers: { $size: '$users' },
          totalExpiredUsers: { $size: '$usersExpired' },
          usersExpired: 1,
        },
      },
      {
        $addFields: {
          hasExpiredUsers: { $gt: ['$totalExpiredUsers', 0] },
        },
      },
      {
        $sort: { hasExpiredUsers: -1, place: 1 }, // Sort by hasExpiredUsers descending, then by place ascending
      },
    ]);

    res.status(200).json(pointsWithExpiredUsers);
  } catch (error) {
    console.error("Error fetching points with expired users:", error);
    res.status(500).json({ message: "Failed to fetch points with expired users" });
  }
};
const getPointsWithStatistics = async (req, res) => {
  try {
    const today = stripTime(new Date());

    const pointsWithStats = await Point.aggregate([
      // 1. Join with Users
      {
        $lookup: {
          from: 'users', // Collection name should be lowercase plural
          localField: '_id',
          foreignField: 'point',
          as: 'users',
        },
      },
      // 2. Join with Orders
      {
        $lookup: {
          from: 'orders', // Collection name should be lowercase plural
          localField: 'users.orders',
          foreignField: '_id',
          as: 'orders',
        },
      },
      // 3. Embed latest order for each user
      {
        $addFields: {
          users: {
            $map: {
              input: '$users',
              as: 'user',
              in: {
                $mergeObjects: [
                  '$$user',
                  {
                    latestOrder: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: '$orders',
                            as: 'order',
                            cond: { $eq: ['$$order.userId', '$$user._id'] },
                          },
                        },
                        -1, // Get the latest order
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      },
      // 4. Simplify user objects
      {
        $addFields: {
          users: {
            $map: {
              input: '$users',
              as: 'user',
              in: {
                _id: '$$user._id',
                name: '$$user.name',
                phone: '$$user.phone',
                email: '$$user.email',
                latestOrder: '$$user.latestOrder',
              },
            },
          },
        },
      },
      // 5. Calculate statistics
      {
        $addFields: {
          totalCustomers: { $size: '$users' },
          todaysActiveCustomers: {
            $size: {
              $filter: {
                input: '$users',
                as: 'user',
                cond: {
                  $and: [
                    { $ne: ['$$user.latestOrder', null] }, // Ensure latestOrder exists
                    { $eq: ['$$user.latestOrder.status', 'active'] }, // Check if latest order is active
                    { $lte: ['$$user.latestOrder.orderStart', today] }, // orderStart <= today
                    { $gte: ['$$user.latestOrder.orderEnd', today] }, // orderEnd >= today
                  ],
                },
              },
            },
          },
          todaysLeave: {
            $size: {
              $filter: {
                input: '$users',
                as: 'user',
                cond: {
                  $and: [
                    { $ne: ['$$user.latestOrder', null] }, // Ensure latestOrder exists
                    { $eq: ['$$user.latestOrder.status', 'leave'] }, // Check if latest order is leave
                    {
                      $gt: [
                        {
                          $size: {
                            $filter: {
                              input: { $ifNull: ['$$user.latestOrder.leave', []] }, // Ensure 'leave' is an array
                              as: 'leave',
                              cond: {
                                $and: [
                                  { $lte: ['$$leave.start', today] },
                                  { $gte: ['$$leave.end', today] },
                                ],
                              },
                            },
                          },
                        },
                        0,
                      ],
                    },
                  ],
                },
              },
            },
          },
          totalBreakfast: {
            $size: {
              $filter: {
                input: '$orders',
                as: 'order',
                cond: { $in: ['B', '$$order.plan'] }, // B: Breakfast
              },
            },
          },
          totalLunch: {
            $size: {
              $filter: {
                input: '$orders',
                as: 'order',
                cond: { $in: ['L', '$$order.plan'] }, // L: Lunch
              },
            },
          },
          totalDinner: {
            $size: {
              $filter: {
                input: '$orders',
                as: 'order',
                cond: { $in: ['D', '$$order.plan'] }, // D: Dinner
              },
            },
          },
        },
      },
      // 6. Sort points with more total customers first
      {
        $sort: { totalCustomers: -1, place: 1 },
      },
      // 7. Project required fields
      {
        $project: {
          place: 1,
          mode: 1,
          totalCustomers: 1,
          todaysActiveCustomers: 1,
          todaysLeave: 1,
          totalBreakfast: 1,
          totalLunch: 1,
          totalDinner: 1,
        },
      },
    ]);

    res.status(200).json(pointsWithStats);
  } catch (error) {
    console.error("Error fetching points with statistics:", error);
    res.status(500).json({ message: "Failed to fetch points with statistics" });
  }
};
// trashUser==================================================================================================================================================
const trashUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.isDeleted = true;
    await user.save();
    return res.status(200).json({ message: 'User moved to trash' });
  } catch (error) {
    console.error('Error trashing user:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};


// addLeave

/**
 * Updates the status of an order based on current date, order dates, and leaves.
 * @param {Object} order - The order document to update.
 */
const updateOrderStatus = async (order) => {
  const currentDate = stripTime(new Date());
  const orderStart = stripTime(new Date(order.orderStart));
  const orderEnd = stripTime(new Date(order.orderEnd));

  // Check if the current date is a leave day
  const isLeaveDay = order.leave.some((leave) => {
    const leaveStart = stripTime(new Date(leave.start));
    const leaveEnd = stripTime(new Date(leave.end));
    return currentDate >= leaveStart && currentDate <= leaveEnd;
  });

  if (isLeaveDay) {
    order.status = 'leave';
  } else if (currentDate < orderStart) {
    order.status = 'soon';
  } else if (currentDate >= orderStart && currentDate <= orderEnd) {
    order.status = 'active';
  } else if (currentDate > orderEnd) {
    order.status = 'expired';
  }

  await order.save();
};

/**
 * Adds a new leave to an order.
 */
const addLeave = async (req, res) => {
  const { orderId } = req.params;
  const { leaveStart, leaveEnd } = req.body;

  console.log('Leave Start:', leaveStart);
  console.log('Leave End:', leaveEnd);

  try {
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const leaveStartDate = stripTime(new Date(leaveStart));
    const leaveEndDate = stripTime(new Date(leaveEnd));
    const orderStartDate = stripTime(new Date(order.orderStart));
    const orderEndDate = stripTime(new Date(order.orderEnd));

    // Validate dates logically
    if (leaveStartDate > leaveEndDate) {
      return res.status(400).json({ message: 'Leave start date cannot be after the leave end date' });
    }

    // Ensure leave dates are within the order's date range
    if (leaveStartDate < orderStartDate || leaveEndDate > orderEndDate) {
      return res.status(400).json({ message: 'Leave dates must be within the order date range' });
    }

    // Calculate the number of days for the new leave
    const differenceInTime = leaveEndDate - leaveStartDate;
    const differenceInDays = Math.ceil(differenceInTime / (1000 * 60 * 60 * 24));
    const numberOfLeaves = differenceInDays + 1;

    // Calculate the total number of leave days including existing and new leave
    const totalLeaveDays = order.leave.reduce((acc, leave) => acc + leave.numberOfLeaves, 0) + numberOfLeaves;

    // Ensure the total does not exceed 8 days
    if (totalLeaveDays > 8) {
      return res.status(400).json({ message: 'Total number of leave days cannot exceed 8 for this order' });
    }

    // Check for overlapping leave entries
    const overlappingLeave = order.leave.some(
      (leave) =>
        leaveStartDate <= stripTime(new Date(leave.end)) &&
        leaveEndDate >= stripTime(new Date(leave.start))
    );

    if (overlappingLeave) {
      return res.status(400).json({ message: 'The new leave period overlaps with an existing leave' });
    }

    // Add the new leave to the order's leave array
    order.leave.push({
      start: leaveStartDate,
      end: leaveEndDate,
      numberOfLeaves,
    });

    // Update the order's status based on the new leave
    await updateOrderStatus(order);

    return res.status(200).json({ message: 'Leave added successfully' });
  } catch (error) {
    console.error('Error adding leave:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Edits an existing leave in an order.
 */
const editLeave = async (req, res) => {
  const { orderId, leaveId } = req.params;
  const { leaveStart, leaveEnd } = req.body;

  // Validate ObjectId formats
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return res.status(400).json({ message: 'Invalid order ID' });
  }

  if (!mongoose.Types.ObjectId.isValid(leaveId)) {
    return res.status(400).json({ message: 'Invalid leave ID' });
  }

  try {
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check if leave exists
    const leaveExists = order.leave.some(l => l._id.toString() === leaveId);
    if (!leaveExists) {
      return res.status(404).json({ message: 'Leave not found' });
    }

    const leaveStartDate = stripTime(new Date(leaveStart));
    const leaveEndDate = stripTime(new Date(leaveEnd));
    const orderStartDate = stripTime(new Date(order.orderStart));
    const orderEndDate = stripTime(new Date(order.orderEnd));

    // Validate dates logically
    if (leaveStartDate > leaveEndDate) {
      return res.status(400).json({ message: 'Leave start date cannot be after the leave end date' });
    }

    // Ensure leave dates are within the order's date range
    if (leaveStartDate < orderStartDate || leaveEndDate > orderEndDate) {
      return res.status(400).json({ message: 'Leave dates must be within the order date range' });
    }

    // Calculate number of leave days
    const differenceInTime = leaveEndDate - leaveStartDate;
    const differenceInDays = Math.ceil(differenceInTime / (1000 * 60 * 60 * 24));
    const numberOfLeaves = differenceInDays + 1;

    // Remove the existing leave using pull
    order.leave.pull(leaveId);

    // Calculate total leave days
    const totalLeaveDays = order.leave.reduce((acc, l) => acc + l.numberOfLeaves, 0) + numberOfLeaves;

    // Ensure the total does not exceed 8 days
    if (totalLeaveDays > 8) {
      return res.status(400).json({ message: 'Total number of leave days cannot exceed 8 for this order' });
    }

    // Check for overlapping leave entries
    const overlappingLeave = order.leave.some((l) => {
      const existingLeaveStart = stripTime(new Date(l.start));
      const existingLeaveEnd = stripTime(new Date(l.end));
      return leaveStartDate <= existingLeaveEnd && leaveEndDate >= existingLeaveStart;
    });

    if (overlappingLeave) {
      return res.status(400).json({ message: 'The edited leave period overlaps with an existing leave' });
    }
         
    // Re-add the leave with updated details
    order.leave.push({
      _id: leaveId, // Retain the original leave ID
      start: leaveStartDate,
      end: leaveEndDate,
      numberOfLeaves,
    });

    // Update the order's status based on the edited leave
    await updateOrderStatus(order);

    return res.status(200).json({ message: 'Leave updated successfully' });
  } catch (error) {
    console.error('Error editing leave:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Deletes an existing leave from an order.
 */const deleteLeave = async (req, res) => {
  const { orderId, leaveId } = req.params;

  // Validate ObjectId formats
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return res.status(400).json({ message: 'Invalid order ID' });
  }

  if (!mongoose.Types.ObjectId.isValid(leaveId)) {
    return res.status(400).json({ message: 'Invalid leave ID' });
  }

  try {
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check if leave exists
    const leaveExists = order.leave.some(l => l._id.toString() === leaveId);
    if (!leaveExists) {
      return res.status(404).json({ message: 'Leave not found' });
    }

    // Remove the leave using pull and update the document
    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      { $pull: { leave: { _id: leaveId } } },
      { new: true }
    );

    // Update the order's status based on the remaining leaves
    await updateOrderStatus(updatedOrder);

    return res.status(200).json({ message: 'Leave deleted successfully' });
  } catch (error) {
    console.error('Error deleting leave:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};




// add attandance
const addAttendance = async (req, res) => {
  
  const { userId, period } = req.body;
    
  const today = new Date().setHours(0, 0, 0, 0);
  console.log(today);
  
  const user = await User.findById(userId);
  let attendanceRecord = await Attendance.findOne({ userId:user,date: { $gte: today, $lt: new Date(today).setHours(24, 0, 0, 0) } });

  console.log("dasda",attendanceRecord);
  
  if (!attendanceRecord) {
      attendanceRecord = new Attendance({ userId,date:today });
  }

  if (period === 'morning') {
      attendanceRecord.morningAttendance = true;
  } else if (period === 'afternoon') {
      attendanceRecord.afternoonAttendance = true;
  } else if (period === 'evening') {
      attendanceRecord.eveningAttendance = true;
  } 

  await attendanceRecord.save();
  res.send({ message: 'Attendance marked', attendance: attendanceRecord });
};


//get attadance status

const getAttendance = async (req,res)=>{
  const { studentId, date } = req.params;
  const user = await User.findById(studentId);
  const today = new Date(date).setHours(0, 0, 0, 0);
  console.log(today);
  
  
  const attendanceRecord = await Attendance.findOne({ userId:studentId,date: { $gte: today, $lt: new Date(today).setHours(24, 0, 0, 0) } });


  if (!attendanceRecord) {
      return res.status(404).send({ message: 'Attendance record not found' });
  }

  res.send(attendanceRecord);
}




// ===========================================location temp
const location = async (req, res) => {
  try {
    console.log('here it is')
    const { userId } = req.params; // Assuming userId is passed as a route parameter
    const { latitude, longitude } = req.body; // Extract latitude and longitude from the request body

    // Find the user by their ID and update the location
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { location: { latitude, longitude } },
      { new: true } // Return the updated document
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      message: "Location updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Error updating location:", error);
    res.status(500).json({ message: "Error updating location" });
  }
};





















// ====================== Node cron=========================================================================================================================

async function updateOrderStatuses() {
  try {
    const orders = await Order.find({}); // Fetch all orders

    orders.forEach(order => {
      const currentDate = stripTime(new Date());
      const orderStart = stripTime(new Date(order.orderStart));
      const orderEnd = stripTime(new Date(order.orderEnd));

      // Check if the current date is a leave day
      const isLeaveDay = order.leave.some(leave => {
        const leaveStart = stripTime(new Date(leave.start));
        const leaveEnd = stripTime(new Date(leave.end));
        return currentDate >= leaveStart && currentDate <= leaveEnd;
      });

      if (isLeaveDay) {
        order.status = 'leave';
      } else if (currentDate < orderStart) {
        order.status = 'soon';
      } else if (currentDate >= orderStart && currentDate <= orderEnd) {
        order.status = 'active';
      } else if (currentDate > orderEnd) {
        order.status = 'expired';
      }

      // Save the updated order
      order.save();
    });

    console.log('Order statuses updated successfully');
  } catch (error) {
    console.error('Error updating order statuses:', error);
  }
}


const cleanupJunkOrders = async () => {
  try {
    // Fetch all user IDs
    console.log('opopoo')
    const users = await User.find({}, '_id');
    const userIds = users.map(user => user._id.toString());

    // Find and delete orders with no corresponding user
    const result = await Order.deleteMany({
      userId: { $nin: userIds }
    });

    console.log(`Deleted ${result.deletedCount} junk orders.`);
  } catch (err) {
    console.error('Error cleaning up junk orders:', err);
  } 
};


const update = async () => {
  try {
    // Define default attendance data
    const defaultAttendance = {
      date: new Date(),  // You can use a default date or set it to null
      present: false,    // Default to not present
      breakfast: false,  // Default to not having breakfast
      lunch: false,      // Default to not having lunch
      dinner: false      // Default to not having dinner
    };

    // Update all user documents that don't have attendance field
    const result = await User.updateMany(
      { attendance: { $exists: false } }, // Only update users without attendance field
      { $set: { attendance: [defaultAttendance] } } // Set the default attendance
    );

    console.log(`Updated ${result.nModified} users with attendance field.`);
  } catch (err) {
    console.error('Error updating users:', err);
  }
};

// Schedule the function to run every second (adjust for your needs)
// cron.schedule('* * * * * *', update);


// Schedule the function to run daily at midnight
cron.schedule('0 0 * * *', updateOrderStatuses);

module.exports = {
  login, 
  postUser,
  postOrder,
  getUsers,
  getDailyStatistics,
  editUser,
  deleteUser,
  trashUser,
  addAttendance,
  getAttendance,
  location,
  getUserById,
  addLeave,
  editLeave,
  deleteLeave,
  getPointsWithLeaveToday,
  getPointsWithExpiredUsers,
  getPointsWithStatistics
};
