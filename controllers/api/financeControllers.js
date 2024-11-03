const Order = require('../../Models/OrderSchema');
const User = require('../../Models/UserSchema');

// Get total payments received
const getTotalPaymentsReceived = async (req, res) => {
    try {
      // Fetch orders where order status is not 'expired'
      const orders = await Order.find({ status: { $ne: 'expired' } })
        .populate('userId', 'isDeleted')
        .lean();
  
      // Filter out orders where userId is null
      const validOrders = orders.filter(order => order.userId);
  
      // Sum the 'amount' field from these orders
      const totalAmount = validOrders.reduce((sum, order) => {
        return sum + (order.amount || 0);
      }, 0);
  
      res.status(200).json({ totalAmount });
    } catch (error) {
      console.error('Error fetching total payments:', error);
      res.status(500).json({ message: 'Error fetching total payments' });
    }
  };

  const getPendingPayments = async (req, res) => {
    try {
      const pendingPaymentsAggregation = await Order.aggregate([
        // 1. Match orders with status 'expired'
        {
          $match: {
            status: 'expired',
          },
        },
        // 2. Lookup to join with users and fetch 'isDeleted' status
        {
          $lookup: {
            from: 'users', // Ensure this matches your User collection name
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
        // 5. Sort by userId and orderEnd descending to get latest orders first
        {
          $sort: {
            userId: 1,
            orderEnd: -1,
          },
        },
        // 6. Group by userId and select the first (latest) order per user
        {
          $group: {
            _id: '$userId',
            latestOrder: { $first: '$$ROOT' },
          },
        },
        // 7. Add totalLeaves by summing numberOfLeaves from the leave array
        {
          $addFields: {
            totalLeaves: {
              $sum: {
                $map: {
                  input: '$latestOrder.leave',
                  as: 'leaveEntry',
                  in: { $ifNull: ['$$leaveEntry.numberOfLeaves', 0] },
                },
              },
            },
          },
        },
        // 8. Project necessary fields
        {
          $project: {
            _id: 0,
            userId: '$_id',
            plan: '$latestOrder.plan',
            totalLeaves: 1,
          },
        },
      ]);
  
      // Initialize pendingAmount
      let pendingAmount = 0;
  
      // Iterate through the aggregated results to calculate pendingAmount
      pendingPaymentsAggregation.forEach((order) => {
        const { plan, totalLeaves } = order;
        const planLength = Array.isArray(plan) ? plan.length : 0;
        let baseAmount = 0;
  
        if (planLength === 3) {
          baseAmount = 3200;
        } else if (planLength === 2) {
          baseAmount = 2750;
        } else if (planLength === 1) {
          baseAmount = 1500;
        }
  
        // Calculate deduction based on planLength and totalLeaves
        let deduction = 0;
        if (planLength === 3) {
          deduction = totalLeaves * 100;
        } else if (planLength === 2) {
          deduction = totalLeaves * 80;
        }
        // For planLength ===1, no deduction
        console.log(baseAmount, deduction)
        // Ensure deduction does not exceed baseAmount
        const amount = baseAmount - deduction >= 0 ? baseAmount - deduction : 0;
  
        // Add to pendingAmount
        pendingAmount += amount;
      });
  
      res.status(200).json({ pendingAmount });
    } catch (error) {
      console.error('Error fetching pending payments:', error);
      res.status(500).json({ message: 'Error fetching pending payments' });
    }
  };
  const getTransactionHistory = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '' } = req.query;

        const query = {};

        if (search) {
            const users = await User.find({
                name: { $regex: search, $options: 'i' },
            }).select('_id');

            query.userId = { $in: users.map((user) => user._id) };
        }

        const transactions = await Order.find(query)
            .select('-attendances') // Exclude attendances field
            .populate('userId', 'name phone')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit));

        const total = await Order.countDocuments(query);

        res.status(200).json({
            transactions,
            total,
            page: Number(page),
            totalPages: Math.ceil(total / limit),
        });
    } catch (error) {
        console.error('Error fetching transaction history:', error);
        res.status(500).json({ message: 'Error fetching transaction history' });
    }
};

  const getRevenueOverTime = async (req, res) => {
    try {
      const revenueData = await Order.aggregate([
        { $match: { paymentStatus: true } },
        {
          $group: {
            _id: {
              month: { $month: '$createdAt' },
              year: { $year: '$createdAt' },
            },
            totalAmount: { $sum: '$amount' },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]);
  
      res.status(200).json(revenueData);
    } catch (error) {
      console.error('Error fetching revenue over time:', error);
      res.status(500).json({ message: 'Error fetching revenue over time' });
    }
  };
  

module.exports = {
  getTotalPaymentsReceived,
  getPendingPayments,
  getTransactionHistory,
  getRevenueOverTime
};
