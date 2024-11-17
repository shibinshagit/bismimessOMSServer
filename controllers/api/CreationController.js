// controllers/api/categoryController.js

const Group = require('../../Models/GroupModel');
const Point = require('../../Models/PointSchema');
const Bulk = require('../../Models/BulkModel');
const User = require('../../Models/UserSchema');

const isOverlapping = (start1, end1, start2, end2) => {
    return start1 <= end2 && start2 <= end1;
  };
  


/**
 * Create a new Group
 */
const createGroup = async (req, res) => {
  try {
    const { title, location, point } = req.body;

    // Validate Point ID
    const existingPoint = await Point.findById(point);
    if (!existingPoint) {
      return res.status(400).json({ message: 'Invalid Point ID.' });
    }

    const group = new Group({ title, location, point });
    await group.save();

    res.status(201).json({ message: 'Group created successfully', group });
  } catch (error) {
    console.error('Error creating group:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

/**
 * Get all Groups
 */
const getAllGroups = async (req, res) => {
  try {
    const groups = await Group.find().populate('point');
    res.status(200).json(groups);
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

/**
 * Update a Group
 */
const updateGroup = async (req, res) => {
  try {
    const groupId = req.params.id;
    const { title, location, point } = req.body;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found.' });
    }

    if (point) {
      const existingPoint = await Point.findById(point);
      if (!existingPoint) {
        return res.status(400).json({ message: 'Invalid Point ID.' });
      }
      group.point = point;
    }

    if (title) group.title = title;
    if (location) group.location = location;

    await group.save();

    res.status(200).json({ message: 'Group updated successfully', group });
  } catch (error) {
    console.error('Error updating group:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

/**
 * Delete a Group
 */
const deleteGroup = async (req, res) => {
    try {
      const groupId = req.params.id;
  
      // Find the group by ID
      const group = await Group.findById(groupId);
      if (!group) {
        return res.status(404).json({ message: 'Group not found.' });
      }
  
      // Delete the group
      await Group.findByIdAndDelete(groupId);
  
      // Update all users who have this group, setting their group to null
      const updateResult = await User.updateMany(
        { group: groupId },
        { $set: { group: null } }
      );
  
      res.status(200).json({ message: 'Group deleted successfully and users updated.' });
    } catch (error) {
      console.error('Error deleting group:', error);
      res.status(500).json({ message: 'Server Error' });
    }
  };
  

/**
 * Create a new Bulk
 */
const createBulk = async (req, res) => {
  try {
    const { title, location, point, phone, orders } = req.body;

    // Validate Point ID
    const existingPoint = await Point.findById(point);
    if (!existingPoint) {
      return res.status(400).json({ message: 'Invalid Point ID.' });
    }

    // Validate Orders for Overlaps
    for (let newOrder of orders) {
      const { startDate, billDate } = newOrder;
      if (!startDate || !billDate) {
        return res.status(400).json({ message: 'Order start and bill dates are required.' });
      }

      const newStart = new Date(startDate);
      const newEnd = new Date(billDate);

      if (newStart > newEnd) {
        return res.status(400).json({ message: 'Order start date cannot be after bill date.' });
      }

      // Check against existing Bulks and their Orders
      const existingBulks = await Bulk.find().populate('orders');
      for (let bulk of existingBulks) {
        for (let existingOrder of bulk.orders) {
          const existingStart = new Date(existingOrder.startDate);
          const existingEnd = new Date(existingOrder.billDate);
          if (isOverlapping(newStart, newEnd, existingStart, existingEnd)) {
            return res.status(400).json({ message: `Order dates overlap with existing order in Bulk: ${bulk.title}` });
          }
        }
      }
    }

    const bulk = new Bulk({ title, location, point, phone, orders });
    await bulk.save();

    res.status(201).json({ message: 'Bulk created successfully', bulk });
  } catch (error) {
    console.error('Error creating bulk:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

/**
 * Get all Bulks
 */
const getAllBulks = async (req, res) => {
  try {
    const bulks = await Bulk.find().populate('point');
    res.status(200).json(bulks);
  } catch (error) {
    console.error('Error fetching bulks:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

/**
 * Update a Bulk
 */
const updateBulk = async (req, res) => {
  try {
    const bulkId = req.params.id;
    const { title, location, point, phone, orders } = req.body;

    const bulk = await Bulk.findById(bulkId);
    if (!bulk) {
      return res.status(404).json({ message: 'Bulk not found.' });
    }

    if (point) {
      const existingPoint = await Point.findById(point);
      if (!existingPoint) {
        return res.status(400).json({ message: 'Invalid Point ID.' });
      }
      bulk.point = point;
    }

    if (title) bulk.title = title;
    if (location) bulk.location = location;
    if (phone) bulk.phone = phone;

    if (orders) {
      // Validate Orders for Overlaps
      for (let newOrder of orders) {
        const { startDate, billDate } = newOrder;
        if (!startDate || !billDate) {
          return res.status(400).json({ message: 'Order start and bill dates are required.' });
        }

        const newStart = new Date(startDate);
        const newEnd = new Date(billDate);

        if (newStart > newEnd) {
          return res.status(400).json({ message: 'Order start date cannot be after bill date.' });
        }

        // Check against existing Bulks and their Orders excluding current Bulk
        const existingBulks = await Bulk.find({ _id: { $ne: bulkId } }).populate('orders');
        for (let existingBulk of existingBulks) {
          for (let existingOrder of existingBulk.orders) {
            const existingStart = new Date(existingOrder.startDate);
            const existingEnd = new Date(existingOrder.billDate);
            if (isOverlapping(newStart, newEnd, existingStart, existingEnd)) {
              return res.status(400).json({ message: `Order dates overlap with existing order in Bulk: ${existingBulk.title}` });
            }
          }
        }
      }

      // Replace existing orders with new ones
      bulk.orders = orders;
    }

    await bulk.save();

    res.status(200).json({ message: 'Bulk updated successfully', bulk });
  } catch (error) {
    console.error('Error updating bulk:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

/**
 * Delete a Bulk
 */
const deleteBulk = async (req, res) => {
  try {
    const bulkId = req.params.id;

    const bulk = await Bulk.findById(bulkId);
    if (!bulk) {
      return res.status(404).json({ message: 'Bulk not found.' });
    }

    await Bulk.findByIdAndDelete(bulkId);

    res.status(200).json({ message: 'Bulk deleted successfully' });
  } catch (error) {
    console.error('Error deleting bulk:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

/**
 * Add Leave to a Bulk's Order
 */
const addLeaveToBulkOrder = async (req, res) => {
  try {
    const bulkId = req.params.id;
    const { orderId, leave } = req.body; // leave contains leaveStart, leaveEnd, totalBreakfastAbsent, etc.

    const bulk = await Bulk.findById(bulkId);
    if (!bulk) {
      return res.status(404).json({ message: 'Bulk not found.' });
    }

    const order = bulk.orders.id(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found.' });
    }

    const leaveStart = new Date(leave.leaveStart);
    const leaveEnd = new Date(leave.leaveEnd);

    if (leaveStart > leaveEnd) {
      return res.status(400).json({ message: 'Leave start date cannot be after end date.' });
    }

    // Ensure leave is within order date range
    const orderStart = new Date(order.startDate);
    const orderEnd = new Date(order.billDate);

    if (leaveStart < orderStart || leaveEnd > orderEnd) {
      return res.status(400).json({ message: 'Leave dates must be within the order date range.' });
    }

    // Check for overlapping leaves
    const overlappingLeave = order.leaves.some(existingLeave =>
      isOverlapping(leaveStart, leaveEnd, new Date(existingLeave.leaveStart), new Date(existingLeave.leaveEnd))
    );

    if (overlappingLeave) {
      return res.status(400).json({ message: 'Leave dates overlap with an existing leave.' });
    }

    // Add the leave
    order.leaves.push(leave);
    await bulk.save();

    res.status(200).json({ message: 'Leave added successfully', order });
  } catch (error) {
    console.error('Error adding leave:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

/**
 * Update Leave in a Bulk's Order
 */
const updateLeaveInBulkOrder = async (req, res) => {
  try {
    const bulkId = req.params.id;
    const { orderId, leaveId, leave } = req.body; // leave contains updated leave fields

    const bulk = await Bulk.findById(bulkId);
    if (!bulk) {
      return res.status(404).json({ message: 'Bulk not found.' });
    }

    const order = bulk.orders.id(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found.' });
    }

    const existingLeave = order.leaves.id(leaveId);
    if (!existingLeave) {
      return res.status(404).json({ message: 'Leave not found.' });
    }

    const updatedLeaveStart = new Date(leave.leaveStart);
    const updatedLeaveEnd = new Date(leave.leaveEnd);

    if (updatedLeaveStart > updatedLeaveEnd) {
      return res.status(400).json({ message: 'Leave start date cannot be after end date.' });
    }

    // Ensure leave is within order date range
    const orderStart = new Date(order.startDate);
    const orderEnd = new Date(order.billDate);

    if (updatedLeaveStart < orderStart || updatedLeaveEnd > orderEnd) {
      return res.status(400).json({ message: 'Leave dates must be within the order date range.' });
    }

    // Check for overlapping leaves excluding current leave
    const overlappingLeave = order.leaves.some(existingLeave =>
      existingLeave._id.toString() !== leaveId &&
      isOverlapping(updatedLeaveStart, updatedLeaveEnd, new Date(existingLeave.leaveStart), new Date(existingLeave.leaveEnd))
    );

    if (overlappingLeave) {
      return res.status(400).json({ message: 'Leave dates overlap with an existing leave.' });
    }

    // Update the leave
    existingLeave.leaveStart = leave.leaveStart;
    existingLeave.leaveEnd = leave.leaveEnd;
    existingLeave.totalBreakfastAbsent = leave.totalBreakfastAbsent;
    existingLeave.totalLunchAbsent = leave.totalLunchAbsent;
    existingLeave.totalDinnerAbsent = leave.totalDinnerAbsent;

    await bulk.save();

    res.status(200).json({ message: 'Leave updated successfully', order });
  } catch (error) {
    console.error('Error updating leave:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

/**
 * Delete Leave from a Bulk's Order
 */
const deleteLeaveFromBulkOrder = async (req, res) => {
  try {
    const bulkId = req.params.id;
    const { orderId, leaveId } = req.body;

    const bulk = await Bulk.findById(bulkId);
    if (!bulk) {
      return res.status(404).json({ message: 'Bulk not found.' });
    }

    const order = bulk.orders.id(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found.' });
    }

    const leave = order.leaves.id(leaveId);
    if (!leave) {
      return res.status(404).json({ message: 'Leave not found.' });
    }

    leave.remove();
    await bulk.save();

    res.status(200).json({ message: 'Leave deleted successfully', order });
  } catch (error) {
    console.error('Error deleting leave:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

const getGroupsByPointId = async (req, res) => {
    try {
      const { id } = req.query;
      console.log('here',id)
      if (!id) {
        return res.status(400).json({ message: 'Point ID is required.' });
      }
  console.log('here',id)
      const groups = await Group.find({ point: id });
      res.status(200).json(groups);
    } catch (error) {
      console.error('Error fetching groups:', error);
      res.status(500).json({ message: 'Server Error' });
    }
  };


module.exports = {
  createGroup,
  getAllGroups,
  updateGroup,
  deleteGroup,
  createBulk,
  getAllBulks,
  updateBulk,
  deleteBulk,
  addLeaveToBulkOrder,
  updateLeaveInBulkOrder,
  deleteLeaveFromBulkOrder,
  getGroupsByPointId,
};
