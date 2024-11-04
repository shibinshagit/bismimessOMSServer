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