// imports---------------------------------------------------------------------------------------------------------------------
const mongoose = require("mongoose");
const cron = require('node-cron');
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cloudinary = require('../../config/cloudinary');
const upload = require('../../middlewares/multer');
const Admin = require("../../Models/adminSchema");
const User = require("../../Models/UserSchema");
const Point = require("../../Models/PointSchema");
const Order = require("../../Models/OrderSchema");
const Attendance = require("../../Models/attendanceSchema");
const fs = require('fs');
// ------------------------------------------------------------------------------------------------------------------------------end

// Helper Functions----------------------------------------------------------------------------------------------------------------

const stripTime = (date) => {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  return utcDate;
};

/**
 * Helper function to determine if two date ranges overlap
 */
const isOverlapping = (start1, end1, start2, end2) => {
  return start1 <= end2 && start2 <= end1;
};

/**
 * Helper function to extract public ID from Cloudinary URL
 */
const getPublicIdFromUrl = (url) => {
  if (!url) {
    console.error('getPublicIdFromUrl: url is undefined or null');
    return null;
  }
  const parts = url.split('/');
  const filename = parts.pop();
  const publicId = filename.split('.')[0];
  return `dropoff_areas/${publicId}`;
};
// ------------------------------------------------------------------------------------------------------------------------------end

// Attendance Management Functions--------------------------------------------------------------------------------------------
const updateAttendancesForNewPlanAndDateRange = (order, newStartDate, newEndDate, newPlan) => {
  const newStart = stripTime(new Date(newStartDate));
  const newEnd = stripTime(new Date(newEndDate));
  const dayMilliseconds = 24 * 60 * 60 * 1000;

  // Remove attendances outside the new date range
  order.attendances = order.attendances.filter(attendance => {
    const attDate = stripTime(new Date(attendance.date));
    return attDate >= newStart && attDate <= newEnd;
  });

  // Create a map of existing attendances for quick lookup
  const attendanceMap = {};
  for (const attendance of order.attendances) {
    const attDate = stripTime(new Date(attendance.date)).getTime();
    attendanceMap[attDate] = attendance;
  }

  // Build a set of leave dates
  const leaveDatesSet = new Set();
  for (const leave of order.leave) {
    const leaveStart = stripTime(new Date(leave.start));
    const leaveEnd = stripTime(new Date(leave.end));
    for (let d = new Date(leaveStart); d <= leaveEnd; d = new Date(d.getTime() + dayMilliseconds)) {
      leaveDatesSet.add(stripTime(d).getTime());
    }
  }

  // Loop over the new date range
  for (let d = new Date(newStart); d <= newEnd; d = new Date(d.getTime() + dayMilliseconds)) {
    const attDate = stripTime(d);
    const attTime = attDate.getTime();

    let attendance = attendanceMap[attTime];

    if (!attendance) {
      // No existing attendance for this date, create a new one
      attendance = {
        date: new Date(attDate),
      };
      order.attendances.push(attendance);
    }

    // For each meal
    for (const meal of ['B', 'L', 'D']) {
      if (newPlan.includes(meal)) {
        // Meal is included in the new plan
        if (leaveDatesSet.has(attTime)) {
          // There is a leave on this date
          attendance[meal] = 'leave';
        } else {
          // No leave on this date
          attendance[meal] = 'packed';
        }
      } else {
        // Meal is not included in the new plan
        attendance[meal] = 'NIL';
      }
    }
  }
};

const removeAttendancesOutsideNewDateRange = (order, newStartDate, newEndDate) => {
  const newStart = stripTime(newStartDate);
  const newEnd = stripTime(newEndDate);

  order.attendances = order.attendances.filter(att => {
    const attDate = stripTime(att.date);
    return attDate >= newStart && attDate <= newEnd;
  });
};

const markLeaveInAttendances = (order, startDate, endDate, plan = 'BLD') => {
  const start = stripTime(new Date(startDate));
  const end = stripTime(new Date(endDate));
  const dayMilliseconds = 24 * 60 * 60 * 1000;

  for (let d = start; d <= end; d = new Date(d.getTime() + dayMilliseconds)) {
    const attTime = stripTime(d).getTime();
    let existingAttendance = order.attendances.find(
      att => stripTime(att.date).getTime() === attTime
    );

    if (!existingAttendance) {
      // Create a new attendance entry
      existingAttendance = {
        date: new Date(d),
        B: 'NIL',
        L: 'NIL',
        D: 'NIL',
      };
      order.attendances.push(existingAttendance);
    }

    // For each meal in the plan, set to 'leave' if not 'NIL'
    if (plan.includes('B') && existingAttendance.B !== 'NIL') {
      existingAttendance.B = 'leave';
    }
    if (plan.includes('L') && existingAttendance.L !== 'NIL') {
      existingAttendance.L = 'leave';
    }
    if (plan.includes('D') && existingAttendance.D !== 'NIL') {
      existingAttendance.D = 'leave';
    }
  }
};

const unmarkLeaveInAttendances = (order, startDate, endDate, plan = 'BLD') => {
  const start = stripTime(new Date(startDate));
  const end = stripTime(new Date(endDate));
  const dayMilliseconds = 24 * 60 * 60 * 1000;

  for (let d = start; d <= end; d = new Date(d.getTime() + dayMilliseconds)) {
    const attTime = stripTime(d).getTime();
    const existingAttendance = order.attendances.find(
      att => stripTime(att.date).getTime() === attTime
    );

    if (existingAttendance) {
      // For each meal in the plan, set to 'packed' if it was 'leave'
      if (plan.includes('B') && existingAttendance.B === 'leave') {
        existingAttendance.B = 'packed';
      }
      if (plan.includes('L') && existingAttendance.L === 'leave') {
        existingAttendance.L = 'packed';
      }
      if (plan.includes('D') && existingAttendance.D === 'leave') {
        existingAttendance.D = 'packed';
      }
      // Do not change meals that are 'NIL' or any other status
    }
  }
};

const initializeAttendances = (order, startDate, endDate, plan, isVeg) => {
  const start = stripTime(startDate);
  const end = stripTime(endDate);
  const dayMilliseconds = 24 * 60 * 60 * 1000;
  const attendanceRecords = [];

  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + dayMilliseconds)) {
    const attendance = {
      date: new Date(d),
      B: plan.includes('B') ? 'packed' : 'NIL',
      L: plan.includes('L') ? 'packed' : 'NIL',
      D: plan.includes('D') ? 'packed' : 'NIL',
    };
    attendanceRecords.push(attendance);
  }

  order.attendances = attendanceRecords;
};
// ------------------------------------------------------------------------------------------------------------------------------end

// Controller Functions----------------------------------------------------------------------------------------------------------------
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

const postOrder = async (req, res) => {
  try {
    const {
      name,
      phone,
      point,
      plan,
      paymentStatus,
      startDate,
      endDate,
      amount,
      paymentMethod,
      paymentId,
      isVeg,
    } = req.body;

    // Check for existing user by phone number
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({ message: 'Phone number already exists' });
    }

    // Handle image uploads
    const imageUrls = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const result = await cloudinary.uploader.upload(file.path, {
          folder: 'dropoff_areas',
        });
        imageUrls.push(result.secure_url);
      }
    }

    // Create new user
    const newUser = new User({
      name,
      phone,
      point,
      paymentStatus,
      images: imageUrls,
    });

    // Handle order creation if payment status is provided
    if (paymentStatus) {
      if (!plan || plan.length === 0) {
        return res.status(400).json({ message: 'Fill all plan data' });
      }

      // Determine order status based on dates
      let orderStatus = "soon";
      const currentDate = stripTime(new Date());
      const orderStartDate = stripTime(new Date(startDate));
      const orderEndDate = stripTime(new Date(endDate));

      if (!isNaN(orderStartDate) && !isNaN(orderEndDate)) {
        if (orderStartDate <= currentDate && currentDate <= orderEndDate) {
          orderStatus = "active";
        }
      } else {
        return res.status(400).json({ message: "Invalid date(s) provided" });
      }

      // Create new order
      const newOrder = new Order({
        userId: newUser._id,
        plan,
        point,
        orderStart: startDate,
        orderEnd: endDate,
        leave: [],
        status: orderStatus,
        amount,
        paymentMethod,
        paymentId,
        isVeg,
      });

      // Initialize attendances
      initializeAttendances(newOrder, orderStartDate, orderEndDate, plan, isVeg);

      await newOrder.save();
      newUser.orders.push(newOrder._id);
    }

    await newUser.save();

    res.status(200).json({
      message: 'User and order added successfully',
      userId: newUser._id,
    });
  } catch (error) {
    console.error('Error adding user and order:', error);
    res.status(500).json({ message: 'Error adding user and order' });
  }
};

const getUsers = async (req, res) => {
  try {
    const today = stripTime(new Date());
    const { page = 1, limit = 500, searchTerm = '', filter = '' } = req.query;
    const { id: pointId } = req.params; // Get the point ID from the route parameters

    // Validate and sanitize pagination parameters
    const MAX_LIMIT = 1000;
    const safeLimit = Math.min(parseInt(limit, 10), MAX_LIMIT);
    const safePage = Math.max(parseInt(page, 10), 1);
    const skip = (safePage - 1) * safeLimit;

    const query = {
      isDeleted: false, // Exclude deleted users
    };

    // Search by name or phone if searchTerm is provided
    if (searchTerm) {
      query.$or = [
        { name: { $regex: searchTerm, $options: 'i' } },
        { phone: { $regex: searchTerm, $options: 'i' } },
      ];
    }

    // Filter by latestOrder.status if filter is provided and not 'All'
    if (filter && filter !== 'All') {
      query['latestOrder.status'] = filter;
    }

    // Filter by pointId if provided
    if (pointId) {
      if (!mongoose.Types.ObjectId.isValid(pointId)) {
        return res.status(400).json({ message: 'Invalid point ID format' });
      }
      query['point'] = new mongoose.Types.ObjectId(pointId); // Correct instantiation with 'new'
    }

    const users = await User.aggregate([
      // Match stage to exclude deleted users early in the pipeline
      {
        $match: {
          isDeleted: false, // Exclude deleted users
        },
      },
      // Lookup to join orders and get the latest order
      {
        $lookup: {
          from: 'orders',
          let: { userOrders: '$orders' },
          pipeline: [
            { $match: { $expr: { $in: ['$_id', '$$userOrders'] } } },
            { $sort: { orderStart: -1 } }, // Sort orders by orderStart descending
            { $limit: 1 }, // Get the latest order
          ],
          as: 'latestOrder',
        },
      },
      // Unwind the latestOrder array
      { $unwind: { path: '$latestOrder', preserveNullAndEmptyArrays: true } },
      // Add isPastOrder field based on latestOrder.orderEnd
      {
        $addFields: {
          isPastOrder: {
            $cond: {
              if: { $lt: ['$latestOrder.orderEnd', today] }, // Check if latestOrder.orderEnd is less than today
              then: 1,
              else: 0,
            },
          },
        },
      },
      // Apply filters
      {
        $match: query,
      },
      // Sort by isPastOrder descending to prioritize active orders and then by latest order start date
      {
        $sort: { isPastOrder: -1, 'latestOrder.orderStart': -1 },
      },
      // Pagination: skip and limit
      {
        $skip: skip,
      },
      {
        $limit: safeLimit,
      },
      // Project only the required fields
      {
        $project: {
          name: 1,
          phone: 1,
          point: 1,
          location: 1,
          paymentStatus: 1,
          startDate: 1,
          latestOrder: {
            _id: 1,
            plan: 1,
            orderStart: 1,
            orderEnd: 1,
            status: 1,
            leave: 1,
            // Exclude 'attendances' field
          },
          // Optionally include isPastOrder if needed
          // isPastOrder: 1,
        },
      },
    ]);

    res.status(200).json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
};

/**
 * Get user by ID
 */
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
        $project: {
          name: 1,
          phone: 1,
          point: 1,
          location: 1,
          paymentStatus: 1,
          startDate: 1,
          images: 1,              // Include images in the response
          latestOrder: 1,         // Return the latest order details
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

/**
 * Get Points with Leave Today
 */
const getPointsWithLeaveToday = async (req, res) => {
  try {
    const today = stripTime(new Date());

    const pointsWithLeave = await Point.aggregate([
      // 1. Lookup users who are not deleted
      {
        $lookup: {
          from: 'users',
          let: { pointId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$point', '$$pointId'] },
                    { $eq: ['$isDeleted', false] },
                  ],
                },
              },
            },
            // Project necessary fields
            {
              $project: {
                _id: 1,
                name: 1,
                phone: 1,
                email: 1,
              },
            },
          ],
          as: 'users',
        },
      },
      // 2. Unwind users to process each user individually
      { $unwind: '$users' },
      // 3. Lookup latest order for each user (regardless of status)
      {
        $lookup: {
          from: 'orders',
          let: { userId: '$users._id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$userId', '$$userId'] },
              },
            },
            { $sort: { orderEnd: -1 } }, // Sort to get the latest order
            { $limit: 1 },
          ],
          as: 'latestOrder',
        },
      },
      // 4. Add latestOrder to users
      {
        $addFields: {
          'users.latestOrder': { $arrayElemAt: ['$latestOrder', 0] },
        },
      },
      // 5. Simplify user objects
      {
        $addFields: {
          'users': {
            _id: '$users._id',
            name: '$users.name',
            phone: '$users.phone',
            email: '$users.email',
            latestOrder: '$users.latestOrder',
          },
        },
      },
      // 6. Add per-user isOnLeaveToday flag
      {
        $addFields: {
          'users.isOnLeaveToday': {
            $and: [
              { $ne: ['$users.latestOrder', null] },
              {
                $gt: [
                  {
                    $size: {
                      $filter: {
                        input: { $ifNull: ['$users.latestOrder.leave', []] },
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
      // 7. Group back per point and aggregate data
      {
        $group: {
          _id: '$_id',
          place: { $first: '$place' },
          totalUsers: { $sum: 1 },
          totalLeaveToday: {
            $sum: {
              $cond: ['$users.isOnLeaveToday', 1, 0],
            },
          },
          usersOnLeaveToday: {
            $push: {
              $cond: ['$users.isOnLeaveToday', '$users', '$$REMOVE'],
            },
          },
        },
      },
      // 8. Sort points by 'place'
      {
        $sort: { place: 1 },
      },
    ]);

    res.status(200).json(pointsWithLeave);
  } catch (error) {
    console.error("Error fetching points with leave today:", error);
    res.status(500).json({ message: "Failed to fetch points with leave today" });
  }
};

/**
 * Get Daily Statistics
 */
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

/**
 * Edit User
 */
const editUser = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      phone,
      point,
      plan,
      paymentStatus,
      startDate,
      endDate,
      amount,
      paymentMethod,
      paymentId,
      isVeg,
    } = req.body;

    // Parse arrays from FormData
    const planArray = typeof plan === 'string' ? [plan] : plan;
    const imagesToRemove = req.body.imagesToRemove;
    let imagesToRemoveArray = [];

    if (imagesToRemove) {
      imagesToRemoveArray = Array.isArray(imagesToRemove) ? imagesToRemove : [imagesToRemove];
    }

    // Find the user by ID and populate orders
    const user = await User.findById(id).populate('orders');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Handle image removals
    if (imagesToRemoveArray.length > 0) {
      user.images = user.images.filter((url) => !imagesToRemoveArray.includes(url));
      for (const url of imagesToRemoveArray) {
        const publicId = getPublicIdFromUrl(url);
        if (publicId) {
          await cloudinary.uploader.destroy(publicId);
        } else {
          console.warn(`Invalid URL encountered: ${url}`);
        }
      }
    }

    // Handle new image uploads
    if (req.files && req.files.length > 0) {
      const uploadedImageUrls = [];
      for (const file of req.files) {
        const result = await cloudinary.uploader.upload(file.path, {
          folder: 'dropoff_areas',
        });
        uploadedImageUrls.push(result.secure_url);
        fs.unlinkSync(file.path);  // Delete temp file
      }
      user.images = [...user.images, ...uploadedImageUrls];
    }

    // Ensure total images do not exceed 3
    if (user.images.length > 3) {
      return res.status(400).json({ message: 'You can only have a maximum of 3 images.' });
    }

    // Update user details
    user.name = name;
    user.point = point;
    user.paymentStatus = paymentStatus;

    // Handle phone number change
    if (user.phone !== phone) {
      const existingUser = await User.findOne({ phone });
      if (existingUser) {
        return res.status(400).json({ message: 'Phone number already exists' });
      }
      user.phone = phone;
    }

    // Handle orders if payment status is updated
    if (paymentStatus) {
      if (!planArray || planArray.length === 0) {
        return res.status(400).json({ message: 'Plan details are required' });
      }

      const orderStartDate = stripTime(new Date(startDate));
      const orderEndDate = stripTime(new Date(endDate));
      const currentDate = stripTime(new Date());

      if (isNaN(orderStartDate) || isNaN(orderEndDate)) {
        return res.status(400).json({ message: 'Invalid date(s) provided' });
      }

      if (orderStartDate > orderEndDate) {
        return res.status(400).json({ message: 'Order start date cannot be after end date' });
      }

      let orderStatus = "soon";
      if (orderStartDate <= currentDate && currentDate <= orderEndDate) {
        orderStatus = "active";
      } else if (currentDate > orderEndDate) {
        orderStatus = "expired";
      }

      const latestOrder = user.orders.sort((a, b) => new Date(b.orderStart) - new Date(a.orderStart))[0];

      if (latestOrder && latestOrder.status !== 'expired') {
        const overlappingOrder = user.orders.find(order => {
          if (order._id.toString() === latestOrder._id.toString()) return false;
          const orderStart = stripTime(new Date(order.orderStart)).getTime();
          const orderEnd = stripTime(new Date(order.orderEnd)).getTime();
          return isOverlapping(orderStartDate.getTime(), orderEndDate.getTime(), orderStart, orderEnd);
        });

        if (overlappingOrder) {
          return res.status(400).json({ message: 'Order dates overlap with an existing order.' });
        }

        const hasConflictingLeaves = latestOrder.leave.some(leave => {
          const leaveStart = stripTime(new Date(leave.start));
          const leaveEnd = stripTime(new Date(leave.end));
          return leaveStart < orderStartDate || leaveEnd > orderEndDate;
        });

        if (hasConflictingLeaves) {
          return res.status(400).json({ message: 'Order has conflicting leaves. Please adjust leaves before updating dates.' });
        }

        latestOrder.plan = planArray;
        latestOrder.orderStart = startDate;
        latestOrder.orderEnd = endDate;
        latestOrder.status = orderStatus;
        latestOrder.amount = amount;
        latestOrder.paymentMethod = paymentMethod;
        latestOrder.paymentId = paymentId;
        latestOrder.isVeg = isVeg;

        updateAttendancesForNewPlanAndDateRange(latestOrder, orderStartDate, orderEndDate, planArray);

        await latestOrder.save();
      } else {
        const overlappingOrder = user.orders.find(order => {
          const orderStart = stripTime(new Date(order.orderStart)).getTime();
          const orderEnd = stripTime(new Date(order.orderEnd)).getTime();
          return isOverlapping(orderStartDate.getTime(), orderEndDate.getTime(), orderStart, orderEnd);
        });

        if (overlappingOrder) {
          return res.status(400).json({ message: 'New order dates overlap with an existing order.' });
        }

        const newOrder = new Order({
          userId: user._id,
          plan: planArray,
          orderStart: startDate,
          orderEnd: endDate,
          leave: [],
          status: orderStatus,
          amount,
          paymentMethod,
          paymentId,
          isVeg,
        });

        initializeAttendances(newOrder, orderStartDate, orderEndDate, planArray, isVeg);
        await newOrder.save();
        user.orders.push(newOrder._id);
      }
    }

    await user.save();
    res.status(200).json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Error updating user' });
  }
};

/**
 * Add Leave
 */
const addLeave = async (req, res) => {
  const { orderId } = req.params;
  const { leaveStart, leaveEnd, plan = 'BLD' } = req.body; // Default plan to 'BLD' if not provided

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

    if (leaveStartDate > leaveEndDate) {
      return res.status(400).json({ message: 'Leave start date cannot be after the leave end date' });
    }

    if (leaveStartDate < orderStartDate || leaveEndDate > orderEndDate) {
      return res.status(400).json({ message: 'Leave dates must be within the order date range' });
    }

    const differenceInTime = leaveEndDate - leaveStartDate;
    const differenceInDays = Math.ceil(differenceInTime / (1000 * 60 * 60 * 24));
    const numberOfLeaves = differenceInDays + 1;

    const totalLeaveDays = order.leave.reduce((acc, leave) => acc + leave.numberOfLeaves, 0) + numberOfLeaves;

    if (totalLeaveDays > 8) {
      return res.status(400).json({ message: 'Total number of leave days cannot exceed 8 for this order' });
    }

    const overlappingLeave = order.leave.some(
      (leave) =>
        leaveStartDate <= stripTime(new Date(leave.end)) &&
        leaveEndDate >= stripTime(new Date(leave.start))
    );

    if (overlappingLeave) {
      return res.status(400).json({ message: 'The new leave period overlaps with an existing leave' });
    }

    order.leave.push({
      start: leaveStartDate,
      end: leaveEndDate,
      numberOfLeaves,
    });

    markLeaveInAttendances(order, leaveStartDate, leaveEndDate, plan); // Pass `plan` to the function

    await updateOrderStatus(order);

    await order.save();

    return res.status(200).json({ message: 'Leave added successfully' });
  } catch (error) {
    console.error('Error adding leave:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Edit Leave
 */
const editLeave = async (req, res) => {
  const { orderId, leaveId } = req.params;
  const { leaveStart, leaveEnd, plan = 'BLD' } = req.body; // Default plan to 'BLD' if not provided

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

    const leaveToEdit = order.leave.id(leaveId);
    if (!leaveToEdit) {
      return res.status(404).json({ message: 'Leave not found' });
    }

    const oldLeaveStart = stripTime(new Date(leaveToEdit.start));
    const oldLeaveEnd = stripTime(new Date(leaveToEdit.end));

    const newLeaveStartDate = stripTime(new Date(leaveStart));
    const newLeaveEndDate = stripTime(new Date(leaveEnd));
    const orderStartDate = stripTime(new Date(order.orderStart));
    const orderEndDate = stripTime(new Date(order.orderEnd));

    if (newLeaveStartDate > newLeaveEndDate) {
      return res.status(400).json({ message: 'Leave start date cannot be after the leave end date' });
    }

    if (newLeaveStartDate < orderStartDate || newLeaveEndDate > orderEndDate) {
      return res.status(400).json({ message: 'Leave dates must be within the order date range' });
    }

    const differenceInTime = newLeaveEndDate - newLeaveStartDate;
    const differenceInDays = Math.ceil(differenceInTime / (1000 * 60 * 60 * 24));
    const numberOfLeaves = differenceInDays + 1;

    const totalLeaveDays = order.leave.reduce((acc, leave) => {
      if (leave._id.toString() === leaveId) return acc;
      return acc + leave.numberOfLeaves;
    }, 0) + numberOfLeaves;

    if (totalLeaveDays > 8) {
      return res.status(400).json({ message: 'Total number of leave days cannot exceed 8 for this order' });
    }

    const overlappingLeave = order.leave.some((leave) => {
      if (leave._id.toString() === leaveId) return false;
      const existingLeaveStart = stripTime(new Date(leave.start));
      const existingLeaveEnd = stripTime(new Date(leave.end));
      return newLeaveStartDate <= existingLeaveEnd && newLeaveEndDate >= existingLeaveStart;
    });

    if (overlappingLeave) {
      return res.status(400).json({ message: 'The edited leave period overlaps with an existing leave' });
    }

    // Unmark the old leave period in attendances
    unmarkLeaveInAttendances(order, oldLeaveStart, oldLeaveEnd, plan); // Pass `plan` explicitly

    // Update the leave details
    leaveToEdit.start = newLeaveStartDate;
    leaveToEdit.end = newLeaveEndDate;
    leaveToEdit.numberOfLeaves = numberOfLeaves;

    // Mark the new leave period in attendances
    markLeaveInAttendances(order, newLeaveStartDate, newLeaveEndDate, plan); // Pass `plan` to the function

    await updateOrderStatus(order);

    await order.save();

    return res.status(200).json({ message: 'Leave updated successfully' });
  } catch (error) {
    console.error('Error editing leave:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Delete Leave
 */
const deleteLeave = async (req, res) => {
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

    // Find the leave to be deleted
    const leaveToDelete = order.leave.id(leaveId);
    if (!leaveToDelete) {
      return res.status(404).json({ message: 'Leave not found' });
    }

    const leaveStartDate = stripTime(new Date(leaveToDelete.start));
    const leaveEndDate = stripTime(new Date(leaveToDelete.end));

    // Unmark the leave period in attendances
    unmarkLeaveInAttendances(order, leaveStartDate, leaveEndDate);

    // Remove the leave from the leave array by ID
    order.leave.pull({ _id: leaveId });

    // Update the order's status based on the remaining leaves
    await updateOrderStatus(order);

    // Save the updated order
    await order.save();

    return res.status(200).json({ message: 'Leave deleted successfully' });
  } catch (error) {
    console.error('Error deleting leave:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Update User Attendance
 */
const updateUserAttendance = async (req, res) => {
  try {
    const { userId } = req.params;
    const { date, meal } = req.body;
    console.log(userId, req.body);

    // Validate input
    const { error } = Attendance.validate(req.body);

    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }
    // Validate User ID
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid User ID' });
    }

    // Find the User
    const user = await User.findById(userId).populate('orders');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    };
    // Find the latest order
    const latestOrder = user.orders.sort((a, b) => new Date(b.orderStart) - new Date(a.orderStart))[0];
    if (!latestOrder) {
      return res.status(404).json({ message: 'No orders found for user' });
    }

    // Ensure the latest order is active on the given date
    const orderStart = stripTime(new Date(latestOrder.orderStart));
    const orderEnd = stripTime(new Date(latestOrder.orderEnd));
    const targetDate = stripTime(new Date(date));

    if (targetDate < orderStart || targetDate > orderEnd) {
      return res.status(400).json({ message: 'Date is outside the order period' });
    }

    // Check if the date is a leave day
    const isLeaveDay = latestOrder.leave.some((leave) => {
      const leaveStart = stripTime(new Date(leave.start));
      const leaveEnd = stripTime(new Date(leave.end));
      return targetDate >= leaveStart && targetDate <= leaveEnd;
    });

    if (isLeaveDay) {
      return res.status(400).json({ message: 'Cannot mark attendance on leave days' });
    }

    // Initialize attendance if not present for the date
    if (!latestOrder.attendances) {
      latestOrder.attendances = [];
    }

    // Find the attendance record for the selected date
    let attendanceRecord = latestOrder.attendances.find(
      (att) => stripTime(att.date).getTime() === targetDate.getTime()
    );

    if (!attendanceRecord) {
      return res.status(400).json({ message: 'Attendance record for the selected date does not exist. Please wait for the cron job to create it.' });
    }

    // Validate current status before updating
    const currentStatus = attendanceRecord[meal];
    if (currentStatus === 'delivered') {
      return res.status(400).json({ message: `Meal ${meal} is already marked as delivered` });
    }

    // Update the specific meal status to 'delivered'
    attendanceRecord[meal] = 'delivered';

    // Save the updated order
    await latestOrder.save();

    res.status(200).json({
      message: 'Attendance updated successfully',
      attendance: attendanceRecord,
    });
  } catch (error) {
    // logger.error('Error updating user attendance: %o', error);
    res.status(500).json({ message: 'Failed to update attendance' });
  }
};
/**
 * Update User Attendance Batch Vise
 */
const updateUserAttendanceBatch = async (req, res) => {
  try {
    const { changes, date } = req.body; // changes is an array of { userId, meal, newStatus }

    if (!Array.isArray(changes) || changes.length === 0) {
      return res.status(400).json({ message: 'No changes provided.' });
    }

    for (const change of changes) {
      const { userId, meal, newStatus } = change;

      // Validate input
      const { error } = Attendance.validate({ date, meal, status: newStatus });

      if (error) {
        return res.status(400).json({ message: error.details[0].message });
      }
   
      // Validate User ID
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: `Invalid User ID: ${userId}` });
      }

      // Find the User
      const user = await User.findById(userId).populate('orders');
      if (!user) {
        return res.status(404).json({ message: `User not found: ${userId}` });
      }

      // Find the latest order
      const latestOrder = user.orders.sort((a, b) => new Date(b.orderStart) - new Date(a.orderStart))[0];
      if (!latestOrder) {
        return res.status(404).json({ message: `No orders found for user: ${userId}` });
      }

      // Ensure the latest order is active on the given date
      const orderStart = stripTime(new Date(latestOrder.orderStart));
      const orderEnd = stripTime(new Date(latestOrder.orderEnd));
      const targetDate = stripTime(new Date(date));

      if (targetDate < orderStart || targetDate > orderEnd) {
        return res.status(400).json({ message: `Date is outside the order period for user: ${userId}` });
      }

      // Check if the date is a leave day
      const isLeaveDay = latestOrder.leave.some((leave) => {
        const leaveStart = stripTime(new Date(leave.start));
        const leaveEnd = stripTime(new Date(leave.end));
        return targetDate >= leaveStart && targetDate <= leaveEnd;
      });

      if (isLeaveDay) {
        return res.status(400).json({ message: `Cannot mark attendance on leave days for user: ${userId}` });
      }

      // Initialize attendance if not present for the date
      if (!latestOrder.attendances) {
        latestOrder.attendances = [];
      }

      // Find the attendance record for the selected date
      let attendanceRecord = latestOrder.attendances.find(
        (att) => stripTime(att.date).getTime() === targetDate.getTime()
      );

      if (!attendanceRecord) {
        return res.status(400).json({ message: `Attendance record for the selected date does not exist for user: ${userId}. Please wait for the cron job to create it.` });
      }

      // Validate current status before updating
      const currentStatus = attendanceRecord[meal];
      if (newStatus === 'delivered' && currentStatus === 'delivered') {
        return res.status(400).json({ message: `Meal ${meal} is already marked as delivered for user: ${userId}` });
      }

      // Update the specific meal status
      attendanceRecord[meal] = newStatus;

      // Save the updated order
      await latestOrder.save();
    }

    res.status(200).json({
      message: 'All attendance updates were successful.',
    });
  } catch (error) {
    console.error('Error updating user attendance batch:', error);
    res.status(500).json({ message: 'Failed to update attendance batch.' });
  }
};

/**
 * Location Update
 */
const location = async (req, res) => {
  try {
    console.log('here it is');
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

/**
 * Renew Order
 */
const renewOrder = async (req, res) => {
  const userId = req.params.id;
  const {
    plan,
    paymentStatus,
    startDate,
    endDate,
    amount,
    paymentMethod,
    paymentId,
    isVeg,
  } = req.body;

  try {
    // Fetch the user
    const user = await User.findById(userId).populate('orders');
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Validate input
    if (!paymentStatus) {
      return res.status(400).json({ message: "Payment status is required" });
    }

    if (!plan || plan.length === 0) {
      return res.status(400).json({ message: "Plan details are required" });
    }

    // Validate dates
    const orderStartDate = stripTime(new Date(startDate));
    const orderEndDate = stripTime(new Date(endDate));
    const currentDate = stripTime(new Date());

    if (isNaN(orderStartDate) || isNaN(orderEndDate)) {
      return res.status(400).json({ message: "Invalid date(s) provided" });
    }

    if (orderStartDate > orderEndDate) {
      return res.status(400).json({ message: "Order start date cannot be after end date" });
    }

    // Determine the status based on the dates
    let orderStatus = "soon";
    if (orderStartDate <= currentDate && currentDate <= orderEndDate) {
      orderStatus = "active";
    } else if (currentDate > orderEndDate) {
      orderStatus = "expired";
    }

    // Check for overlapping with any existing orders
    const overlappingOrder = user.orders.find(order => {
      const orderStart = stripTime(new Date(order.orderStart)).getTime();
      const orderEnd = stripTime(new Date(order.orderEnd)).getTime();
      return isOverlapping(orderStartDate.getTime(), orderEndDate.getTime(), orderStart, orderEnd);
    });

    if (overlappingOrder) {
      return res.status(400).json({ message: "New order dates overlap with an existing order." });
    }

    // Create a new order
    const newOrder = new Order({
      userId: user._id,
      plan,
      orderStart: startDate,
      orderEnd: endDate,
      leave: [],
      status: orderStatus,
      paymentStatus,
      amount,
      paymentMethod,
      paymentId,
      isVeg,
    });

    // Initialize attendances
    initializeAttendances(newOrder, orderStartDate, orderEndDate, plan, isVeg);

    await newOrder.save();

    // Add the new order to the user's orders
    user.orders.push(newOrder._id);

    await user.save();

    res.status(200).json({ message: 'Order renewed successfully' });
  } catch (error) {
    console.error('Error renewing order:', error);
    res.status(500).json({ message: 'Error renewing order' });
  }
};

/**
 * Trash User
 */
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

/**
 * Soft Delete User
 */
const softDeleteUser = async (req, res) => {
  const userId = req.params.id;

  try {
    // Find the user by ID
    const user = await User.findById(userId);

    // If user not found, return 404 error
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Set isDeleted to true
    user.isDeleted = true;

    // Save the updated user
    await user.save();

    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Error deleting user' });
  }
};

/**
 * Get Soft Deleted Users
 */
const getSoftDeletedUsers = async (req, res) => {
  try {
    const deletedUsers = await User.find({ isDeleted: true }).populate('point');
    res.status(200).json(deletedUsers);
  } catch (error) {
    console.error('Error fetching deleted users:', error);
    res.status(500).json({ message: 'Error fetching deleted users' });
  }
};

/**
 * Restore Deleted User
 */
const restoreDeletedUsers = async (req, res) => {
  const userId = req.params.id;

  try {
    // Find the user by ID
    const user = await User.findById(userId);

    // If user not found or not deleted, return error
    if (!user || !user.isDeleted) {
      return res.status(404).json({ message: 'User not found or not deleted' });
    }

    // Set isDeleted to false
    user.isDeleted = false;

    // Save the updated user
    await user.save();

    res.status(200).json({ message: 'User restored successfully' });
  } catch (error) {
    console.error('Error restoring user:', error);
    res.status(500).json({ message: 'Error restoring user' });
  }
};

/**
 * Hard Delete User
 */
const hardDeleteUser = async (req, res) => {
  const userId = req.params.id;

  try {
    // Find the user by ID
    const user = await User.findById(userId);

    // If user not found, return 404 error
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Delete associated orders
    await Order.deleteMany({ userId: user._id });

    // Delete the user
    await User.findByIdAndDelete(userId);

    return res.status(200).json({ message: 'User permanently deleted' });
  } catch (error) {
    console.error('Error permanently deleting user:', error);
    res.status(500).json({ message: 'Error permanently deleting user' });
  }
};
// ------------------------------------------------------------------------------------------------------------------------------end

// Points Controller Functions-----------------------------------------------------------------------------------------------
const getPointsWithExpiredUsers = async (req, res) => {
  try {
    const today = stripTime(new Date());

    const pointsWithExpiredUsers = await Point.aggregate([
      // 1. Lookup users who are not deleted
      {
        $lookup: {
          from: 'users',
          let: { pointId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$point', '$$pointId'] },
                    { $eq: ['$isDeleted', false] },
                  ],
                },
              },
            },
            // Project necessary fields
            {
              $project: {
                _id: 1,
                name: 1,
                phone: 1,
                email: 1,
                orders: 1,
              },
            },
          ],
          as: 'users',
        },
      },
      // 2. Unwind users to process each user individually
      { $unwind: '$users' },
      // 3. Lookup latest order for each user (regardless of status)
      {
        $lookup: {
          from: 'orders',
          let: { userId: '$users._id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$userId', '$$userId'] },
              },
            },
            { $sort: { orderEnd: -1 } }, // Sort to get the latest order
            { $limit: 1 },
          ],
          as: 'latestOrder',
        },
      },
      // 4. Add latestOrder to users
      {
        $addFields: {
          'users.latestOrder': { $arrayElemAt: ['$latestOrder', 0] },
        },
      },
      // 5. Simplify user objects
      {
        $addFields: {
          'users': {
            _id: '$users._id',
            name: '$users.name',
            phone: '$users.phone',
            email: '$users.email',
            latestOrder: '$users.latestOrder',
          },
        },
      },
      // 6. Add per-user isExpired flag
      {
        $addFields: {
          'users.isExpired': {
            $and: [
              { $ne: ['$users.latestOrder', null] },
              { $eq: ['$users.latestOrder.status', 'expired'] },
            ],
          },
        },
      },
      // 7. Group back per point and calculate sums
      {
        $group: {
          _id: '$_id',
          place: { $first: '$place' },
          totalUsers: { $sum: 1 },
          totalExpiredUsers: {
            $sum: {
              $cond: ['$users.isExpired', 1, 0],
            },
          },
          usersExpired: {
            $push: {
              $cond: ['$users.isExpired', '$users', '$$REMOVE'],
            },
          },
        },
      },
      // 8. Add hasExpiredUsers flag
      {
        $addFields: {
          hasExpiredUsers: { $gt: ['$totalExpiredUsers', 0] },
        },
      },
      // 9. Sort points with expired users first
      {
        $sort: { hasExpiredUsers: -1, place: 1 },
      },
      // 10. Project required fields
      {
        $project: {
          place: 1,
          totalUsers: 1,
          totalExpiredUsers: 1,
          usersExpired: 1,
          hasExpiredUsers: 1,
        },
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
      // 1. Join with Users who are not deleted
      {
        $lookup: {
          from: 'users',
          let: { pointId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$point', '$$pointId'] },
                    { $eq: ['$isDeleted', false] },
                  ],
                },
              },
            },
            // Project necessary fields
            {
              $project: {
                _id: 1,
                name: 1,
                phone: 1,
                email: 1,
                orders: 1,
              },
            },
          ],
          as: 'users',
        },
      },
      // 2. Unwind users
      { $unwind: '$users' },
      // 3. Lookup latest order for each user (regardless of status)
      {
        $lookup: {
          from: 'orders',
          let: { userId: '$users._id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$userId', '$$userId'],
                },
              },
            },
            { $sort: { orderEnd: -1 } }, // Sort to get the latest order
            { $limit: 1 },
          ],
          as: 'latestOrder',
        },
      },
      // 4. Add latestOrder to users
      {
        $addFields: {
          'users.latestOrder': { $arrayElemAt: ['$latestOrder', 0] },
          // Include isVeg field from latestOrder
          'users.isVeg': '$users.latestOrder.isVeg',
        },
      },
      // 5. Add per-user flags with modifications
      {
        $addFields: {
          'users.isActiveToday': {
            $and: [
              { $ne: ['$users.latestOrder', null] },
              { $eq: ['$users.latestOrder.status', 'active'] },
              { $lte: ['$users.latestOrder.orderStart', today] },
              { $gte: ['$users.latestOrder.orderEnd', today] },
            ],
          },
          'users.isOnLeaveToday': {
            $and: [
              { $ne: ['$users.latestOrder', null] },
              {
                $gt: [
                  {
                    $size: {
                      $filter: {
                        input: { $ifNull: ['$users.latestOrder.leave', []] },
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
          'users.hasBreakfast': {
            $and: [
              { $ne: ['$users.latestOrder', null] },
              {
                $in: [
                  'B',
                  { $ifNull: ['$users.latestOrder.plan', []] },
                ],
              },
            ],
          },
          'users.hasLunch': {
            $and: [
              { $ne: ['$users.latestOrder', null] },
              {
                $in: [
                  'L',
                  { $ifNull: ['$users.latestOrder.plan', []] },
                ],
              },
            ],
          },
          'users.hasDinner': {
            $and: [
              { $ne: ['$users.latestOrder', null] },
              {
                $in: [
                  'D',
                  { $ifNull: ['$users.latestOrder.plan', []] },
                ],
              },
            ],
          },
          'users.isExpired': {
            $and: [
              { $ne: ['$users.latestOrder', null] },
              { $eq: ['$users.latestOrder.status', 'expired'] },
            ],
          },
          // New fields for veg users
          'users.isVegActiveToday': {
            $and: [
              { $eq: ['$users.isVeg', true] },
              { $eq: ['$users.isActiveToday', true] },
              { $ne: ['$users.isOnLeaveToday', true] },
            ],
          },
          'users.isVegUser': {
            $eq: ['$users.isVeg', true],
          },
        },
      },
      // 6. Group back per point and calculate sums
      {
        $group: {
          _id: '$_id',
          place: { $first: '$place' },
          mode: { $first: '$mode' },
          totalCustomers: { $sum: 1 },
          totalExpired: {
            $sum: {
              $cond: ['$users.isExpired', 1, 0],
            },
          },
          todaysActiveCustomers: {
            $sum: {
              $cond: ['$users.isActiveToday', 1, 0],
            },
          },
          todaysLeave: {
            $sum: {
              $cond: ['$users.isOnLeaveToday', 1, 0],
            },
          },
          totalBreakfast: {
            $sum: {
              $cond: ['$users.hasBreakfast', 1, 0],
            },
          },
          totalLunch: {
            $sum: {
              $cond: ['$users.hasLunch', 1, 0],
            },
          },
          totalDinner: {
            $sum: {
              $cond: ['$users.hasDinner', 1, 0],
            },
          },
          // New fields for veg counts
          totalVegNeededToday: {
            $sum: {
              $cond: ['$users.isVegActiveToday', 1, 0],
            },
          },
          totalVeg: {
            $sum: {
              $cond: ['$users.isVegUser', 1, 0],
            },
          },
        },
      },
      // 7. Sort points with more total customers first
      {
        $sort: { totalCustomers: -1, place: 1 },
      },
      // 8. Project required fields
      {
        $project: {
          place: 1,
          mode: 1,
          totalCustomers: 1,
          totalExpired: 1,
          todaysActiveCustomers: 1,
          todaysLeave: 1,
          totalBreakfast: 1,
          totalLunch: 1,
          totalDinner: 1,
          totalVegNeededToday: 1,
          totalVeg: 1,
        },
      },
    ]);

    res.status(200).json(pointsWithStats);
  } catch (error) {
    console.error('Error fetching points with statistics:', error);
    res.status(500).json({ message: 'Failed to fetch points with statistics' });
  }
};

/**
 * Get Users by Point ID
 */
const getUsersByPointId = async (req, res) => {
  try {
    const { pointId } = req.params;

    // Validate Point ID
    if (!mongoose.Types.ObjectId.isValid(pointId)) {
      return res.status(400).json({ message: 'Invalid Point ID' });
    }

    const users = await User.find({ point: pointId, isDeleted: false }).populate('orders');

    res.status(200).json(users);
  } catch (error) {
    // logger.error('Error fetching users by point ID: %o', error); 
    res.status(500).json({ message: 'Failed to fetch users' });
  }
};
// ------------------------------------------------------------------------------------------------------------------------------end

// Additional Controller Functions-------------------------------------------------------------------------------------------------
/**
 * Get Points with Leave Today
 */

/**
 * Update Order Status
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
 * Update Order Status for All Orders
 */
async function updateOrderStatuses() {
  try {
    const orders = await Order.find({}); 
    const today = stripTime(new Date());

    for (let order of orders) {
      const orderStart = stripTime(new Date(order.orderStart));
      const orderEnd = stripTime(new Date(order.orderEnd));

      // Check if the current date is a leave day
      const isLeaveDay = order.leave.some((leave) => {
        const leaveStart = stripTime(new Date(leave.start));
        const leaveEnd = stripTime(new Date(leave.end));
        return today >= leaveStart && today <= leaveEnd;
      });

      if (isLeaveDay) {
        order.status = 'leave';
      } else if (today < orderStart) {
        order.status = 'soon';
      } else if (today >= orderStart && today <= orderEnd) {
        order.status = 'active';
      } else if (today > orderEnd) {
        order.status = 'expired';
      }

      // Save the updated order
      await order.save();
    }

    console.log('Order statuses updated successfully');
  } catch (error) {
    console.error('Error updating order statuses:', error);
  }
};

/**
 * Add Attendance
 */
const addAttendance = async (req, res) => {
  const { userId, period } = req.body;

  const today = new Date().setHours(0, 0, 0, 0);
  console.log(today);

  const user = await User.findById(userId);
  let attendanceRecord = await Attendance.findOne({ userId: user, date: { $gte: today, $lt: new Date(today).setHours(24, 0, 0, 0) } });

  console.log("dasda", attendanceRecord);

  if (!attendanceRecord) {
    attendanceRecord = new Attendance({ userId, date: today });
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

/**
 * Get Attendance Status
 */
const getAttendance = async (req, res) => {
  const { studentId, date } = req.params;
  const user = await User.findById(studentId);
  const today = new Date(date).setHours(0, 0, 0, 0);
  console.log(today);

  const attendanceRecord = await Attendance.findOne({ userId: studentId, date: { $gte: today, $lt: new Date(today).setHours(24, 0, 0, 0) } });

  if (!attendanceRecord) {
    return res.status(404).send({ message: 'Attendance record not found' });
  }

  res.send(attendanceRecord);
};
/**
 * Update Attendances
 */
const updateAttendances = async () => {
  try {
    // Find all orders without attendances or with empty attendances
    const ordersWithoutAttendances = await Order.find({
      $or: [
        { attendances: { $exists: false } },
        { attendances: { $size: 0 } },
      ],
    }).exec();

    console.log(`Found ${ordersWithoutAttendances.length} orders without attendances.`);

    for (const order of ordersWithoutAttendances) {
      const { orderStart, orderEnd, leave, plan } = order;

      if (!orderStart || !orderEnd) {
        console.warn(`Order ${order._id} is missing orderStart or orderEnd. Skipping.`);
        continue;
      }

      if (!plan || !Array.isArray(plan) || plan.length === 0) {
        console.warn(`Order ${order._id} has no plan defined. Skipping.`);
        continue;
      }

      const startDate = stripTime(orderStart);
      const endDate = stripTime(orderEnd);
      const dayMilliseconds = 24 * 60 * 60 * 1000;
      const attendanceRecords = [];

      // Build a set of leave dates for quick lookup
      const leaveDatesSet = new Set();
      if (leave && Array.isArray(leave)) {
        for (const leavePeriod of leave) {
          const { start, end } = leavePeriod;
          if (start && end) {
            const leaveStart = stripTime(new Date(start));
            const leaveEnd = stripTime(new Date(end));
            for (let d = new Date(leaveStart); d <= leaveEnd; d = new Date(d.getTime() + dayMilliseconds)) {
              leaveDatesSet.add(stripTime(d).getTime());
            }
          }
        }
      }

      // Loop over each date in the order range
      for (let d = new Date(startDate); d <= endDate; d = new Date(d.getTime() + dayMilliseconds)) {
        const attDate = new Date(d);
        const attTime = stripTime(attDate).getTime();
        const attendance = { date: attDate };

        // For each meal, set the status based on the plan and leaves
        for (const meal of ['B', 'L', 'D']) {
          if (plan.includes(meal)) {
            // Meal is included in the plan
            if (leaveDatesSet.has(attTime)) {
              attendance[meal] = 'leave';
            } else {
              attendance[meal] = 'packed';
            }
          } else {
            // Meal is not included in the plan
            attendance[meal] = 'NIL';
          }
        }

        attendanceRecords.push(attendance);
      }

      // Assign the generated attendances to the order
      order.attendances = attendanceRecords;

      // Save the updated order
      await order.save();
      console.log(`Updated attendances for Order ID: ${order._id}`);
    }

    console.log('Attendance update process completed.');
  } catch (error) {
    console.error('Error updating attendances:', error);
  }
};

/**
 * Cleanup Junk Orders
 */
const cleanupJunkOrders = async () => {
  try {
    // Fetch all user IDs
    console.log('opopoo');
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

/**
 * Update Invalid Users' Points
 */
const updateInvalidUsersPoints = async (req, res) => {
  try {
    // Define the target valid Point ID
    const targetPointId = '67265fd0abf4a6207da4601b';

    // Validate the target Point ID format
    if (!mongoose.Types.ObjectId.isValid(targetPointId)) {
      return res.status(400).json({ message: 'Invalid target Point ID format.' });
    }

    // Check if the target Point exists
    const targetPoint = await Point.findById(targetPointId);
    if (!targetPoint) {
      return res.status(404).json({ message: `Point with ID ${targetPointId} does not exist.` });
    }

    // Fetch all valid Point IDs
    const validPoints = await Point.find({}, '_id').lean();
    const validPointIds = validPoints.map(point => point._id.toString());

    // Identify users with invalid points
    const usersWithInvalidPoints = await User.find({
      $or: [
        { point: { $exists: false } },
        { point: { $in: [null, undefined] } },
        { point: { $nin: validPointIds } },
      ],
    });

    if (usersWithInvalidPoints.length === 0) {
      // return res.status(200).json({ message: 'No users with invalid points found.', updatedCount: 0 });
    }

    // Update users' point to the target Point ID
    const updateResult = await User.updateMany(
      {
        $or: [
          { point: { $exists: false } },
          { point: { $in: [null, undefined] } },
          { point: { $nin: validPointIds } },
        ],
      },
      { $set: { point: targetPointId } }
    );

    // return res.status(200).json({
    //   message: `Successfully updated ${updateResult.nModified} user(s) with invalid points to Point ID ${targetPointId}.`,
    //   updatedCount: updateResult.nModified,
    // });
  } catch (error) {
    console.error('❌ Error updating users with invalid points:', error);
    // return res.status(500).json({ message: 'Internal server error.' });
  }
};
// ------------------------------------------------------------------------------------------------------------------------------end

// Cron Jobs------------------------------------------------------------------------------------------------------------------------
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

// Schedule the functions to run daily at midnight
cron.schedule('0 0 * * *', () => {
  console.log('Running daily cron jobs at midnight');
  updateOrderStatuses();
});
// ------------------------------------------------------------------------------------------------------------------------------end

// Module Exports-------------------------------------------------------------------------------------------------------------------
module.exports = {
  login, 
  postUser,
  postOrder,
  getUsers,
  getDailyStatistics,
  editUser,
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
  getPointsWithStatistics,
  getUsersByPointId,
  updateUserAttendance,
  renewOrder,
  softDeleteUser,
  getSoftDeletedUsers,
  restoreDeletedUsers,
  hardDeleteUser,
  updateUserAttendanceBatch
};
// ------------------------------------------------------------------------------------------------------------------------------end
