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
      // Fetch expired orders
      const orders = await Order.find({ status: 'expired' })
        .populate('userId', 'isDeleted')
        .lean();
  
      // Filter out orders where user is deleted or userId is null
      const validOrders = orders.filter(order => order.userId && !order.userId.isDeleted);
  
      let pendingAmount = 0;
  
      validOrders.forEach(order => {
        const planLength = order.plan.length;
        let baseAmount = 0;
  
        if (planLength === 3) {
          baseAmount = 3200;
        } else if (planLength === 2) {
          baseAmount = 2750;
        } else if (planLength === 1) {
          baseAmount = 1500;
        }
  
        // Calculate total leaves
        const totalLeaves = order.leave ? order.leave.length : 0;
  
        // Deduct leaves
        let deduction = 0;
        if (planLength === 3) {
          deduction = totalLeaves * 100;
        } else if (planLength === 2) {
          deduction = totalLeaves * 80;
        }
        // For planLength ===1, no deduction
  
        const amount = baseAmount - deduction;
  
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
