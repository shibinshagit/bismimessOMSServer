// imports---------------------------------------------------------------------------------------------------------------------
const mongoose = require("mongoose");
const cron = require('node-cron');
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cloudinary = require('../../config/cloudinary');
const upload = require('../../middlewares/multer');
const Admin = require("../../Models/adminSchema");
const User = require("../../Models/UserSchema");
const userTemp = require("../../Models/AppUserModel");
const Point = require("../../Models/PointSchema");
const Order = require("../../Models/OrderSchema");
const Attendance = require("../../Models/attendanceSchema");
const fs = require('fs');
const dotenv = require("dotenv");
const twilio = require('twilio');
dotenv.config();
const accountSid = process.env.TWILIO_ACCOUNT_SID; // Replace with your Twilio Account SID
const authToken = process.env.TWILIO_TOKEN;    // Replace with your Twilio Auth Token
const client = twilio(accountSid, authToken);   
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

const markLeaveInAttendances = (order, leave) => {
  const { start, end, meals } = leave;
  const startDate = stripTime(new Date(start));
  const endDate = stripTime(new Date(end));
  const dayMilliseconds = 24 * 60 * 60 * 1000;

  let fullLeaveDays = 0;

  for (let d = startDate; d <= endDate; d = new Date(d.getTime() + dayMilliseconds)) {
    const attendanceDate = new Date(d);
    const attendanceRecord = order.attendances.find(
      (att) => stripTime(att.date).getTime() === stripTime(attendanceDate).getTime()
    );

    if (attendanceRecord) {
      // Mark specified meals as 'leave'
      for (const meal of meals) {
        if (attendanceRecord[meal] !== 'NIL') {
          attendanceRecord[meal] = 'leave';
        }
      }

      // Check if all meals in plan are on leave for this day
      const userMeals = order.plan;
      const isFullLeaveDay = userMeals.every(
        (meal) => attendanceRecord[meal] === 'leave' || attendanceRecord[meal] === 'NIL'
      );

      if (isFullLeaveDay) {
        fullLeaveDays += 1;
      }
    }
  }

  return fullLeaveDays;
};


const unmarkLeaveInAttendances = (order, leave) => {
  const { start, end, meals } = leave;
  const startDate = stripTime(new Date(start));
  const endDate = stripTime(new Date(end));
  const dayMilliseconds = 24 * 60 * 60 * 1000;

  for (let d = startDate; d <= endDate; d = new Date(d.getTime() + dayMilliseconds)) {
    const attendanceDate = new Date(d);
    const attendanceRecord = order.attendances.find(
      (att) => stripTime(att.date).getTime() === stripTime(attendanceDate).getTime()
    );

    if (attendanceRecord) {
      // Unmark specified meals from 'leave' to 'packed' if they are in the plan
      for (const meal of meals) {
        if (attendanceRecord[meal] === 'leave' && order.plan.includes(meal)) {
          attendanceRecord[meal] = 'packed';
        }
      }
    }
  }
};


const initializeAttendances = (order, startDate, endDate, plan, isVeg) => {
  const today = stripTime(new Date());
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

    // If the order start date is today or before, mark all days till today as 'delivered'
    if (start <= today && d <= today) {
      for (const meal of ['B', 'L', 'D']) {
        if (plan.includes(meal)) {
          attendance[meal] = 'delivered';
        }
      }
    }

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
// console.log('env:',process.env.GOOGLE_CLIENT_ID);
const createGoogleContact = async (name, phone, pointName) => {
  // Set up OAuth2 client with your credentials
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );


  // Set the refresh token
  oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

  const peopleService = google.people({ version: 'v1', auth: oAuth2Client });

  const resource = {
    names: [{ givenName: `${name} ${pointName}` }],
    phoneNumbers: [{ value: phone }],
  };

  try {
    const response = await peopleService.people.createContact({
      requestBody: resource,
    });
    console.log('Contact created:', response.data);
  } catch (error) {
    console.error('Error creating contact:', error);
  }
};

// Updated postOrder function
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
      group,
    } = req.body;
console.log('plan',plan)
    // Check for existing user by phone number
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({
        message: 'Phone number already exists',
        user: existingUser,
      });
    }
    if (!plan || plan.length === 0) {
      return res.status(400).json({ message: 'Fill all plan data' });
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

    // Get the point name for contact creation
    const pointData = await Point.findById(point);
    const pointName = pointData ? pointData.place : '';

    // Create new user
    const newUser = new User({
      name,
      phone,
      point,
      group,
      images: imageUrls,
    });

    // Handle order creation if payment status is 'success' or 'failed'
    if (paymentStatus) {
      console.log('pay:',paymentStatus)
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
  group,
  orderStart: startDate,
  orderEnd: endDate,
  leave: [],
  status: orderStatus,
  amount,
  ...(paymentMethod && { paymentMethod }),
  ...(paymentId && { paymentId }),
  ...(paymentStatus && { paymentStatus }),
  isVeg,
});


      // Initialize attendances
      initializeAttendances(newOrder, orderStartDate, orderEndDate, plan, isVeg);

      await newOrder.save();
      newUser.orders.push(newOrder._id);
    }

    await newUser.save();

    // Save user as contact
    // await createGoogleContact(name, phone, pointName);

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
    const { id: pointId } = req.params;

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
      query['point'] = new mongoose.Types.ObjectId(pointId);
    }

    const users = await User.aggregate([
      // Match stage to exclude deleted users
      { $match: { isDeleted: false } },
      // Lookup to join orders and get the latest order, prioritizing active orders
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
      // Unwind the latestOrder array
      { $unwind: { path: '$latestOrder', preserveNullAndEmptyArrays: true } },
      // Apply filters
      {
        $match: query,
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
          group: 1,
          point: 1,
          location: 1,
          paymentStatus: 1,
          startDate: 1,
          latestOrder: {
            _id: 1,
            plan: 1,
            orderStart: 1,
            isBilled: 1,
            orderEnd: 1,
            status: 1,
            leave: 1,
            // Exclude 'attendances' field if not needed
          },
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
 
    const { id } = req.params;
    
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
console.log('in the admin:',user[0])
    res.status(200).json(user[0]);
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
  const userId = req.params.id;

  try {
    // Find the user by ID
    const user = await User.findById(userId).populate('orders');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update user details
    const {
      name,
      phone,
      point,
      paymentStatus,
      startDate,
      endDate,
      amount,
      paymentMethod,
      paymentId,
      isVeg,
      group,
      plan,
    } = req.body;

    if (name) user.name = name;
    if (phone) user.phone = phone;
    if (point) user.point = point;
    user.group = group || null;

    // Handle image updates
    // Remove images if requested
    if (req.body.imagesToRemove) {
      const imagesToRemove = Array.isArray(req.body.imagesToRemove) ? req.body.imagesToRemove : [req.body.imagesToRemove];
      user.images = user.images.filter(image => !imagesToRemove.includes(image));
      // Also delete images from cloud storage if needed
      for (const url of imagesToRemove) {
        const publicId = getPublicIdFromUrl(url);
        if (publicId) {
          try {
            await cloudinary.uploader.destroy(publicId);
          } catch (error) {
            console.error(`Error deleting image ${publicId} from Cloudinary:`, error);
          }
        }
      }
    }

    // Add new images if uploaded
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const result = await cloudinary.uploader.upload(file.path, {
          folder: 'dropoff_areas',
        });
        user.images.push(result.secure_url);
      }
    }

    // Save user updates
    await user.save();

    const today = stripTime(new Date());

    // Update the latest order if it exists
    let latestOrder = await Order.findOne({
      userId: user._id,
      status: { $in: ['active', 'leave'] },
      orderStart: { $lte: today },
      orderEnd: { $gte: today },
    }).sort({ orderStart: -1 });

    if (latestOrder) {
      console.log('groups:',latestOrder)
      // Update paymentStatus
      if (paymentStatus) latestOrder.paymentStatus = paymentStatus;

   
        // Ensure orderStart and orderEnd are provided
        if (!startDate || !endDate) {
          return res.status(400).json({ message: "orderStart and orderEnd are required when paymentStatus is 'success' or 'failed'." });
        }

        // Update order details
        latestOrder.orderStart = startDate;
        latestOrder.orderEnd = endDate;

        if (amount) latestOrder.amount = amount;
        if (paymentMethod) latestOrder.paymentMethod = paymentMethod;
        if (paymentId) latestOrder.paymentId = paymentId;
        if (isVeg !== undefined) latestOrder.isVeg = isVeg;
        if (plan && plan.length > 0) latestOrder.plan = plan;

        // Determine order status
        let orderStatus = "soon";
        const currentDate = stripTime(new Date());
        const orderStartDate = stripTime(new Date(latestOrder.orderStart));
        const orderEndDate = stripTime(new Date(latestOrder.orderEnd));

        if (!isNaN(orderStartDate) && !isNaN(orderEndDate)) {
          if (orderStartDate <= currentDate && currentDate <= orderEndDate) {
            orderStatus = "active";
          }
        } else {
          return res.status(400).json({ message: "Invalid date(s) provided" });
        }

        latestOrder.status = orderStatus;

        // Re-initialize attendances if dates or plan have changed
        const orderStartDateTime = stripTime(new Date(latestOrder.orderStart));
        const orderEndDateTime = stripTime(new Date(latestOrder.orderEnd));
        initializeAttendances(latestOrder, orderStartDateTime, orderEndDateTime, latestOrder.plan, latestOrder.isVeg);


      await latestOrder.save();
    } else {
     
        // Ensure orderStart and orderEnd are provided
        if (!startDate || !endDate) {
          return res.status(400).json({ message: "orderStart and orderEnd are required when paymentStatus is 'success' or 'failed'." });
        }

        // Determine order status
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

        const newOrder = new Order({
          userId: user._id,
          plan,
          point: user.point,
          orderStart: startDate,
          orderEnd: endDate,
          leave: [],
          status: orderStatus,
          amount,
          paymentMethod,
          paymentId,
          paymentStatus,
          isVeg,
        });

        // Initialize attendances
        initializeAttendances(newOrder, orderStartDate, orderEndDate, plan, isVeg);

        await newOrder.save();
        user.orders.push(newOrder._id);
        await user.save();
      
    }

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
  const { leaveStart, leaveEnd, meals } = req.body;
  console.log(req.body)

  if (!Array.isArray(meals) || meals.length === 0) {
    return res.status(400).json({ message: 'Meals are required' });
  }

  try {
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const leaveStartDate = stripTime(new Date(leaveStart));
    const leaveEndDate = stripTime(new Date(leaveEnd));

    // Validate dates
    if (isNaN(leaveStartDate) || isNaN(leaveEndDate)) {
      return res.status(400).json({ message: 'Invalid date(s) provided' });
    }

    if (leaveStartDate > leaveEndDate) {
      return res.status(400).json({ message: 'Leave start date cannot be after end date' });
    }

    // Ensure leave is within order period
    const orderStart = stripTime(new Date(order.orderStart));
    const orderEnd = stripTime(new Date(order.orderEnd));

    if (leaveStartDate < orderStart || leaveEndDate > orderEnd) {
      return res.status(400).json({ message: 'Leave dates must be within the order period' });
    }

    // Check for overlapping leaves
    const overlappingLeave = order.leave.some((existingLeave) => {
      const existingStart = stripTime(new Date(existingLeave.start));
      const existingEnd = stripTime(new Date(existingLeave.end));

      return (
        (leaveStartDate <= existingEnd && leaveEndDate >= existingStart) &&
        existingLeave.meals.some((meal) => meals.includes(meal))
      );
    });

    if (overlappingLeave) {
      return res.status(400).json({ message: 'Leave dates overlap with existing leave' });
    }

    // Add the leave
    const newLeave = {
      start: leaveStartDate,
      end: leaveEndDate,
      meals,
    };

    // Mark leave in attendances and calculate number of full leave days
    const numberOfLeaves = markLeaveInAttendances(order, newLeave);

    // Store the number of full leave days in the leave object
    newLeave.numberOfLeaves = numberOfLeaves;

    order.leave.push(newLeave);

    await order.save();
    await updateOrderStatus(order);
    res.status(200).json({ message: 'Leave added successfully' });
  } catch (error) {
    console.error('Error adding leave:', error);
    res.status(500).json({ message: 'Error adding leave' });
  }
};


/**
 * Edit Leave
 */
/**
 * Edit an existing leave
 */
const editLeave = async (req, res) => {
  const { orderId, leaveId } = req.params;
  const { leaveStart, leaveEnd, meals } = req.body;

  if (!Array.isArray(meals) || meals.length === 0) {
    return res.status(400).json({ message: 'Meals are required' });
  }

  try {
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const leave = order.leave.id(leaveId);
    if (!leave) {
      return res.status(404).json({ message: 'Leave not found' });
    }

    // Unmark previous leave in attendances
    unmarkLeaveInAttendances(order, leave);

    // Update leave details
    leave.start = stripTime(new Date(leaveStart));
    leave.end = stripTime(new Date(leaveEnd));
    leave.meals = meals;

    // Validate dates
    const leaveStartDate = stripTime(new Date(leaveStart));
    const leaveEndDate = stripTime(new Date(leaveEnd));

    if (isNaN(leaveStartDate) || isNaN(leaveEndDate)) {
      return res.status(400).json({ message: 'Invalid date(s) provided' });
    }

    if (leaveStartDate > leaveEndDate) {
      return res.status(400).json({ message: 'Leave start date cannot be after end date' });
    }

    // Ensure leave is within order period
    const orderStart = stripTime(new Date(order.orderStart));
    const orderEnd = stripTime(new Date(order.orderEnd));

    if (leaveStartDate < orderStart || leaveEndDate > orderEnd) {
      return res.status(400).json({ message: 'Leave dates must be within the order period' });
    }

    // Check for overlapping leaves (excluding the current leave)
    const overlappingLeave = order.leave.some((existingLeave) => {
      if (existingLeave._id.equals(leaveId)) {
        return false;
      }
      const existingStart = stripTime(new Date(existingLeave.start));
      const existingEnd = stripTime(new Date(existingLeave.end));

      return (
        (leaveStartDate <= existingEnd && leaveEndDate >= existingStart) &&
        existingLeave.meals.some((meal) => meals.includes(meal))
      );
    });

    if (overlappingLeave) {
      return res.status(400).json({ message: 'Leave dates overlap with existing leave' });
    }

    // Mark new leave in attendances and calculate number of full leave days
    const numberOfLeaves = markLeaveInAttendances(order, leave);
    leave.numberOfLeaves = numberOfLeaves;

    await order.save();
    await updateOrderStatus(order);
    res.status(200).json({ message: 'Leave updated successfully' });
  } catch (error) {
    console.error('Error updating leave:', error);
    res.status(500).json({ message: 'Error updating leave' });
  }
};



/**
 * Delete Leave
 */
const deleteLeave = async (req, res) => {
  const { orderId, leaveId } = req.params;

  try {
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const leave = order.leave.id(leaveId);
    if (!leave) {
      return res.status(404).json({ message: 'Leave not found' });
    }

    // Unmark leave in attendances
    unmarkLeaveInAttendances(order, leave);

   order.leave.pull({ _id: leaveId });

    await order.save();
    await updateOrderStatus(order);
    res.status(200).json({ message: 'Leave deleted successfully' });
  } catch (error) {
    console.error('Error deleting leave:', error);
    res.status(500).json({ message: 'Error deleting leave' });
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
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const targetDate = stripTime(new Date(date));

    // Find the active order for the given date
    const latestOrder = await Order.findOne({
      userId: user._id,
      status: { $in: ['active', 'leave'] },
      orderStart: { $lte: targetDate },
      orderEnd: { $gte: targetDate },
    });

    if (!latestOrder) {
      return res.status(404).json({ message: 'No active order found for the given date' });
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
// const updateUserAttendanceBatch = async (req, res) => {
//   try {
//     const { changes, date } = req.body; // changes is an array of { userId, meal, newStatus }

//     if (!Array.isArray(changes) || changes.length === 0) {
//       return res.status(400).json({ message: 'No changes provided.' });
//     }

//     for (const change of changes) {
//       const { userId, meal, newStatus } = change;

//       // Validate input
//       const { error } = Attendance.validate({ date, meal, status: newStatus });

//       if (error) {
//         return res.status(400).json({ message: error.details[0].message });
//       }
   
//       // Validate User ID
//       if (!mongoose.Types.ObjectId.isValid(userId)) {
//         return res.status(400).json({ message: `Invalid User ID: ${userId}` });
//       }
//   // Find the User
//   const user = await User.findById(userId);
//   if (!user) {
//     return res.status(404).json({ message: `User not found: ${userId}` });
//   }

//   const targetDate = stripTime(new Date(date));

//   // Find the active order for the given date
//   const latestOrder = await Order.findOne({
//     userId: user._id,
//     status: { $in: ['active', 'leave'] },
//     orderStart: { $lte: targetDate },
//     orderEnd: { $gte: targetDate },
//   });

//   if (!latestOrder) {
//     return res.status(404).json({ message: `No active order found for user: ${userId} on date: ${date}` });
//   }

//       // Ensure the latest order is active on the given date
//       const orderStart = stripTime(new Date(latestOrder.orderStart));
//       const orderEnd = stripTime(new Date(latestOrder.orderEnd));
  

//       if (targetDate < orderStart || targetDate > orderEnd) {
//         return res.status(400).json({ message: `Date is outside the order period for user: ${userId}` });
//       }

//       // Check if the date is a leave day
//       const isLeaveDay = latestOrder.leave.some((leave) => {
//         const leaveStart = stripTime(new Date(leave.start));
//         const leaveEnd = stripTime(new Date(leave.end));
//         return targetDate >= leaveStart && targetDate <= leaveEnd;
//       });

//       if (isLeaveDay) {
//         return res.status(400).json({ message: `Cannot mark attendance on leave days for user: ${userId}` });
//       }

//       // Initialize attendance if not present for the date
//       if (!latestOrder.attendances) {
//         latestOrder.attendances = [];
//       }

//       // Find the attendance record for the selected date
//       let attendanceRecord = latestOrder.attendances.find(
//         (att) => stripTime(att.date).getTime() === targetDate.getTime()
//       );

//       if (!attendanceRecord) {
//         return res.status(400).json({ message: `Attendance record for the selected date does not exist for user: ${userId}. Please wait for the cron job to create it.` });
//       }

//       // Validate current status before updating
//       const currentStatus = attendanceRecord[meal];
//       if (newStatus === 'delivered' && currentStatus === 'delivered') {
//         return res.status(400).json({ message: `Meal ${meal} is already marked as delivered for user: ${userId}` });
//       }

//       // Update the specific meal status
//       attendanceRecord[meal] = newStatus;

//       // Save the updated order
//       await latestOrder.save();
//     }

//     res.status(200).json({
//       message: 'All attendance updates were successful.',
//     });
//   } catch (error) {
//     console.error('Error updating user attendance batch:', error);
//     res.status(500).json({ message: 'Failed to update attendance batch.' });
//   }
// };

// Update a single user's attendance
const updateUserAttendanceApp = async (req, res) => {
  try {
    const { userId, meal, date, newStatus } = req.body;
    console.log(req.body);

    // Validate User ID
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: `Invalid User ID: ${userId}` });
    }

    // Find the User
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: `User not found: ${userId}` });
    }

    const targetDate = stripTime(new Date(date));
    console.log(targetDate);

    // Find the active order for the given date
    const latestOrder = await Order.findOne({
      userId: user._id,
      status: { $in: ['active', 'leave'] },
      orderStart: { $lte: targetDate },
      orderEnd: { $gte: targetDate },
    });

    if (!latestOrder) {
      return res.status(404).json({ message: `No active order found for user: ${userId} on date: ${date}` });
    }

    // Ensure the latest order is active on the given date
    const orderStart = stripTime(new Date(latestOrder.orderStart));
    const orderEnd = stripTime(new Date(latestOrder.orderEnd));

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

    // You can adjust validation logic as needed
    // For example, prevent changing from 'delivered' back to 'packed' only if necessary

    // Update the specific meal status
    attendanceRecord[meal] = newStatus;

    // Mark the 'attendances' field as modified
    latestOrder.markModified('attendances');

    // Save the updated order
    await latestOrder.save();

    res.status(200).json({
      message: 'Attendance updated successfully.',
    });
  } catch (error) {
    console.error('Error updating user attendance:', error);
    res.status(500).json({ message: 'Failed to update attendance.' });
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
  try {
    const { id } = req.params; // Assuming user ID is passed as a route parameter

    // Step 1: Find the user by ID
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Step 2: Delete images from Cloudinary
    if (user.images && user.images.length > 0) {
      for (const url of user.images) {
        const publicId = getPublicIdFromUrl(url);
        if (publicId) {
          try {
            const result = await cloudinary.uploader.destroy(publicId);
            if (result.result !== 'ok' && result.result !== 'not_found') {
              console.warn(`Failed to delete image ${publicId} from Cloudinary:`, result);
            }
          } catch (error) {
            console.error(`Error deleting image ${publicId} from Cloudinary:`, error);
            // Optionally, decide whether to continue or abort the deletion
          }
        } else {
          console.warn(`Could not extract public ID from URL: ${url}`);
        }
      }
    }

    // Step 3: Delete all orders associated with the user
    await Order.deleteMany({ userId: user._id });

    // Step 4: Delete the user from the database
    // Using deleteOne() instead of remove()
    await User.deleteOne({ _id: id });

    // Step 5: Respond with a success message
    res.status(200).json({ message: 'User and associated images deleted successfully' });

  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Failed to delete user and images' });
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
    // Define the start and end of today
    const todayStart = stripTime(new Date());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1); // 23:59:59

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
      // 3. Lookup latest order for each user
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
            { $sort: { orderEnd: -1 } }, // Get the latest order by date
            { $limit: 1 },
            // Project only the needed fields
            {
              $project: {
                _id: 1,
                orderStart: 1,
                orderEnd: 1,
                status: 1,
                isVeg: 1,
                plan: 1,
                leave: 1,
              },
            },
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
      // 5. Add isActiveToday
      {
        $addFields: {
          'users.isActiveToday': {
            $and: [
              { $ne: ['$users.latestOrder', null] },
              { $eq: ['$users.latestOrder.status', 'active'] },
              { $lte: ['$users.latestOrder.orderStart', todayEnd] },
              { $gte: ['$users.latestOrder.orderEnd', todayStart] },
            ],
          },
        },
      },
      // 6. Add isOnLeaveToday
      {
        $addFields: {
          'users.isOnLeaveToday': {
            $gt: [
              {
                $size: {
                  $filter: {
                    input: { $ifNull: ['$users.latestOrder.leave', []] },
                    as: 'leave',
                    cond: {
                      $and: [
                        { $lte: ['$$leave.start', todayEnd] },
                        { $gte: ['$$leave.end', todayStart] },
                      ],
                    },
                  },
                },
              },
              0,
            ],
          },
        },
      },
      // 7. Add meal fields
      {
        $addFields: {
          'users.hasBreakfast': {
            $in: ['B', { $ifNull: ['$users.latestOrder.plan', []] }],
          },
          'users.hasLunch': {
            $in: ['L', { $ifNull: ['$users.latestOrder.plan', []] }],
          },
          'users.hasDinner': {
            $in: ['D', { $ifNull: ['$users.latestOrder.plan', []] }],
          },
        },
      },
      // 8. Add isVegUser
      {
        $addFields: {
          'users.isVegUser': { $eq: ['$users.latestOrder.isVeg', true] },
        },
      },
      // 9. Add isExpired
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
      // 10. Group by point and calculate sums
      {
        $group: {
          _id: '$_id',
          place: { $first: '$place' },
          mode: { $first: '$mode' },
          totalCustomers: { $sum: 1 },
          totalExpired: {
            $sum: { $cond: ['$users.isExpired', 1, 0] },
          },
          todaysActiveCustomers: {
            $sum: { $cond: ['$users.isActiveToday', 1, 0] },
          },
          todaysLeave: {
            $sum: { $cond: ['$users.isOnLeaveToday', 1, 0] },
          },
          totalBreakfast: {
            $sum: { $cond: ['$users.hasBreakfast', 1, 0] },
          },
          totalLunch: {
            $sum: { $cond: ['$users.hasLunch', 1, 0] },
          },
          totalDinner: {
            $sum: { $cond: ['$users.hasDinner', 1, 0] },
          },
          totalVeg: {
            $sum: { $cond: ['$users.isVegUser', 1, 0] },
          },
          totalVegNeededToday: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$users.isVegUser', true] },
                    { $eq: ['$users.isActiveToday', true] },
                    { $eq: ['$users.isOnLeaveToday', false] },
                  ],
                },
                1,
                0
              ]
            },
          },
          // **New Fields for Vegetarian Meals Needed Today**
          vegBreakfastToday: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$users.isVegUser', true] },
                    { $eq: ['$users.isActiveToday', true] },
                    { $eq: ['$users.isOnLeaveToday', false] },
                    { $eq: ['$users.hasBreakfast', true] },
                  ],
                },
                1,
                0
              ]
            },
          },
          vegLunchToday: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$users.isVegUser', true] },
                    { $eq: ['$users.isActiveToday', true] },
                    { $eq: ['$users.isOnLeaveToday', false] },
                    { $eq: ['$users.hasLunch', true] },
                  ],
                },
                1,
                0
              ]
            },
          },
          vegDinnerToday: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$users.isVegUser', true] },
                    { $eq: ['$users.isActiveToday', true] },
                    { $eq: ['$users.isOnLeaveToday', false] },
                    { $eq: ['$users.hasDinner', true] },
                  ],
                },
                1,
                0
              ]
            },
          },
          // **New Field for Veg Users on Leave Today**
          vegOnLeaveToday: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$users.isVegUser', true] },
                    { $eq: ['$users.isOnLeaveToday', true] },
                  ],
                },
                1,
                0
              ]
            },
          },
        },
      },
      // 11. Sort points by totalCustomers
      {
        $sort: { totalCustomers: -1, place: 1 },
      },
      // 12. Project required fields
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
          totalVeg: 1,
          totalVegNeededToday: 1,
          vegBreakfastToday: 1,
          vegLunchToday: 1,
          vegDinnerToday: 1,
          vegOnLeaveToday: 1, // Include the new field in the output
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
      try {
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
        console.log(`added paymentStatus for order with ID: ${order._id}`);
      } catch (orderError) {
        console.error(`Error processing order with ID ${order._id}:`, orderError);
        console.error('Problematic order data:', order); // Log the full order for debugging
      }
    }

    console.log('Order statuses updated successfully');
  } catch (error) {
    console.error('Error updating order statuses:', error);
  }
}


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
const getNewOrders = async (req, res) => {
  try {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    // Aggregation pipeline to fetch new orders with point names
    const newOrders = await Order.aggregate([
      // 1. Match orders created within the last three days
      {
        $match: {
          createdAt: { $gte: threeDaysAgo },
        },
      },
      // 2. Lookup to join with users
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user',
        },
      },
      // 3. Unwind the user array
      {
        $unwind: '$user',
      },
      // 4. Exclude orders where user is deleted or userId is null
      {
        $match: {
          'user.isDeleted': false,
          'user._id': { $ne: null },
        },
      },
      // 5. Lookup to join with points using user.point
      {
        $lookup: {
          from: 'points',
          localField: 'user.point',
          foreignField: '_id',
          as: 'point',
        },
      },
      // 6. Unwind the point array
      {
        $unwind: {
          path: '$point',
          preserveNullAndEmptyArrays: true, // In case some users don't have a point
        },
      },
      // 7. Sort orders by creation date descending
      {
        $sort: {
          createdAt: -1,
        },
      },
      // 8. Project necessary fields
      {
        $project: {
          orderId: '$_id', // Use the order's _id as orderId
          _id: '$user._id',
          userName: '$user.name',
          userPhone: '$user.phone',
          pointName: '$point.place', // Correct field for point name
          plan: 1,
          orderStart: 1,
          orderEnd: 1,
          status: 1,
          paymentStatus: 1,
          paymentMethod: 1,
          paymentId: 1,
          isVeg: 1,
          createdAt: 1,
        },
      },
    ]);

    // Fetch the total number of users joined in the last three days
    const newUsersCount = await User.countDocuments({
      createdAt: { $gte: threeDaysAgo },
      isDeleted: false,
    });

    res.status(200).json({ newOrders, newUsersCount });
  } catch (error) {
    console.error('Error fetching new orders:', error);
    res.status(500).json({ message: 'Error fetching new orders' });
  }
};

const markOrderAsBilled = async (req, res) => {
  try {
    const orderId = req.params.orderId;

    // Update the order's isBilled field to true
    const order = await Order.findByIdAndUpdate(
      orderId,
      { isBilled: true },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.status(200).json({ message: 'Order marked as billed', order });
  } catch (error) {
    console.error('Error marking order as billed:', error);
    res.status(500).json({ message: 'Server Error' });
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



async function removePendingPaymentStatus() {
  try {
    // Find all orders with paymentStatus as "Pending"
    const orders = await Order.find({ paymentStatus: "Pending" });

    if (orders.length === 0) {
      console.log('No orders with "Pending" paymentStatus found.');
      return;
    }

    // Update each order by removing the paymentStatus field
    for (let order of orders) {
      try {
        order.paymentStatus = undefined; // Remove the paymentStatus field
        await order.save(); // Save the updated order
        console.log(`Removed paymentStatus for order with ID: ${order._id}`);
      } catch (orderError) {
        console.error(`Error removing paymentStatus for order ID ${order._id}:`, orderError);
      }
    }

    console.log('All pending payment statuses removed successfully.');
  } catch (error) {
    console.error('Error updating payment statuses:', error);
  }
}
  

async function sentInvoiceBackendAuto() {
  try {
    const today = new Date();
    const threeDaysLater = new Date();
    threeDaysLater.setDate(today.getDate() + 3);

    const calculateInvoice = (leave, plan) => {
      const totalLeave = leave.reduce((acc, leave) => {
        const startDate = new Date(leave.start);
        const endDate = new Date(leave.end);
        const numberOfLeaves =
          Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
        return acc + numberOfLeaves;
      }, 0);

      const planLength = plan?.length || 0;
      let bill = 0, reduce = 0;

      switch (planLength) {
        case 3:
          bill = 3200;
          reduce = 100;
          break;
        case 2:
          bill = 2750;
          reduce = 70;
          break;
        default:
          bill = 1500;
          reduce = 0;
      }

      const invoiceAmount = bill - totalLeave * reduce;

      return { totalLeave, invoiceAmount, bill, reduce };
    };

    const sendMessage = async (user, message) => {
      try {
        const whatsappNumber = `whatsapp:+919995442239`;
        await client.messages.create({
          from: process.env.WHATSAPP_NUM,
          to: whatsappNumber,
          body: message,
        });
        console.log(`Invoice sent to ${user.phone}`);
        return true;
      } catch (error) {
        console.error(`Failed to send invoice to ${user.phone}:`, error.message);
        return false;
      }
    };

    const processOrders = async (query) => {
      // Update query to exclude deleted users
      const orders = await Order.find(query).populate({
        path: 'userId',
        match: { isDeleted: false }, // Exclude deleted users from population
      });

      for (const order of orders) {
        // Ensure the user data is valid (userId exists and is not deleted)
        if (order.userId) {
          const { userId, orderEnd, plan, leave = [] } = order;
          const user = userId;
          const { totalLeave, invoiceAmount, bill, reduce } = calculateInvoice(leave, plan);

          const formattedEndDate = new Date(orderEnd)
            .toLocaleDateString("en-GB")
            .replace(/\//g, "-");

          const message = `
${user.name}, your food bill till ${formattedEndDate} is as follows:

Total leaves: ${totalLeave}
Total amount: ₹${bill}
Leave deduction: ₹${reduce} x ${totalLeave} = ₹${totalLeave * reduce}
------------------------------------
Amount to pay: ₹${invoiceAmount} 👍

Bismi Mess Payment Method:

Pay to - 9847952414 (Shebeer km)
(GPay, PhonePe, Paytm, other UPI)

(Send the screenshot after payment)
`;

          const messageSent = await sendMessage(user, message);

          if (messageSent) {
            // Log that invoice sent successfully
            console.log(`Invoice sent to ${user.name}`);
            // Optional: Update the order status here if needed
            // order.isBilled = true;
            // await order.save();
          }
        }
      }
    };

    // Query adjusted to exclude inactive users
    await processOrders({
      isBilled: false,
      orderStart: { $lte: today },
      orderEnd: { $gte: today, $lte: threeDaysLater },
    });

    console.log("Automatic invoice sending completed.");
  } catch (error) {
    console.error("Error in sentInvoiceBackendAuto:", error.message);
  }
}






// Schedule the functions to run daily at midnight
// cron.schedule('0 0 * * *', () => {
//   console.log('Running daily cron jobs at midnight');
//   updateOrderStatuses();
// });
cron.schedule('0 1 * * *', () => {
  console.log('Running daily cron job at 1:00 AM IST');
  updateOrderStatuses();
}, {
  scheduled: true,
  timezone: 'Asia/Kolkata',
});
cron.schedule('0 6 * * *', () => {
  console.log('Running daily cron job at 6:00 AM IST');
  updateOrderStatuses();
  sentInvoiceBackendAuto();
}, {
  scheduled: true,
  timezone: 'Asia/Kolkata',
});

// cron.schedule('* * * * *', () => {
//   console.log('Running task every second');
// sentInvoiceBackendAuto();
// });

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
  // updateUserAttendanceBatch,
  getNewOrders,
  markOrderAsBilled,
  updateUserAttendanceApp
};
// ------------------------------------------------------------------------------------------------------------------------------end
