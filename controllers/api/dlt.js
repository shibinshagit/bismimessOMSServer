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