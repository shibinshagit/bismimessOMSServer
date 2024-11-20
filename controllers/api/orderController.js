// controllers/api/categoryController.js
const mongoose = require("mongoose");
const Group = require('../../Models/GroupModel');
const Order = require('../../Models/OrderSchema');
const Point = require('../../Models/PointSchema');
const Bulk = require('../../Models/BulkModel');
const User = require('../../Models/UserSchema');

const stripTime = (date) => {
    const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    return utcDate;
  };
// ... existing imports

/**
 * Get all orders for a user
 */

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

const getUserOrders = async (req, res) => {
    console.log('khdshfjhdsgfhdg')
    try {
      const { userId } = req.params;
      const today = stripTime(new Date());
  
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: 'Invalid User ID' });
      }
  
      // Fetch all orders for the user
      const orders = await Order.find({ userId }).sort({ orderStart: -1 });
  
      // Determine the active order ID
      let activeOrderId = null;
      const activeOrder = await Order.findOne({
        userId,
        status: { $in: ['active', 'leave'] },
        orderStart: { $lte: today },
        orderEnd: { $gte: today },
      });
  
      if (activeOrder) {
        activeOrderId = activeOrder._id;
      }
  
      res.status(200).json({ orders, activeOrderId });
    } catch (error) {
      console.error('Error fetching user orders:', error);
      res.status(500).json({ message: 'Failed to fetch user orders' });
    }
  };
  

/**
 * Add a new order for a user
 */
const addOrder = async (req, res) => {
    try {
      const { userId } = req.params;
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
  
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: 'Invalid User ID' });
      }
  
      // Fetch the user
      const user = await User.findById(userId);
      if (!user || user.isDeleted) {
        return res.status(404).json({ message: 'User not found' });
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
  
  
     
      let orderStatus = 'soon';
      if (orderStartDate <= currentDate && currentDate <= orderEndDate) {
        orderStatus = 'active';
      } else if (currentDate > orderEndDate) {
        orderStatus = 'expired';
      }
  
      // Check for overlapping orders
      const overlappingOrder = await Order.findOne({
        userId,
        $or: [
          {
            orderStart: { $lte: orderEndDate },
            orderEnd: { $gte: orderStartDate },
          },
        ],
      });
  
      if (overlappingOrder) {
        return res.status(400).json({ message: 'Order dates overlap with an existing order.' });
      }
  
      // Create new order
      const newOrder = new Order({
        userId,
        plan,
        orderStart: startDate,
        orderEnd: endDate,
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
  
      // Add order to user's orders
      user.orders.push(newOrder._id);
      await user.save();
  
      res.status(200).json({ message: 'Order added successfully' });
    } catch (error) {
      console.error('Error adding order:', error);
      res.status(500).json({ message: 'Failed to add order' });
    }
  };

  
  /**
 * Edit an existing order
 */
const editOrder = async (req, res) => {
    try {
      const { orderId } = req.params;
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
  
      if (!mongoose.Types.ObjectId.isValid(orderId)) {
        return res.status(400).json({ message: 'Invalid Order ID' });
      }
  
      // Fetch the order
      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }
  
      // Validate input
      // ... (validation logic similar to addOrder)
  
      // Update order details
      order.plan = plan;
      order.orderStart = startDate;
      order.orderEnd = endDate;
      order.paymentStatus = paymentStatus;
      order.amount = amount;
      order.paymentMethod = paymentMethod;
      order.paymentId = paymentId;
      order.isVeg = isVeg;
  
      // Determine order status
      const currentDate = stripTime(new Date());
      const orderStartDate = stripTime(new Date(startDate));
      const orderEndDate = stripTime(new Date(endDate));
      let orderStatus = 'soon';
      if (orderStartDate <= currentDate && currentDate <= orderEndDate) {
        orderStatus = 'active';
      } else if (currentDate > orderEndDate) {
        orderStatus = 'expired';
      }
      order.status = orderStatus;
  
      // Re-initialize attendances
      initializeAttendances(order, orderStartDate, orderEndDate, plan, isVeg);
  
      await order.save();
  
      res.status(200).json({ message: 'Order updated successfully' });
    } catch (error) {
      console.error('Error editing order:', error);
      res.status(500).json({ message: 'Failed to edit order' });
    }
  };

  
  /**
 * Delete an order
 */
const deleteOrder = async (req, res) => {
    try {
      const { orderId } = req.params;
  
      if (!mongoose.Types.ObjectId.isValid(orderId)) {
        return res.status(400).json({ message: 'Invalid Order ID' });
      }
  
      // Find and delete the order
      const order = await Order.findByIdAndDelete(orderId);
      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }
  
      // Remove the order reference from the user
      await User.updateOne(
        { _id: order.userId },
        { $pull: { orders: order._id } }
      );
  
      res.status(200).json({ message: 'Order deleted successfully' });
    } catch (error) {
      console.error('Error deleting order:', error);
      res.status(500).json({ message: 'Failed to delete order' });
    }
  };
  







module.exports = {
getUserOrders,
addOrder,
editOrder,
deleteOrder
};
