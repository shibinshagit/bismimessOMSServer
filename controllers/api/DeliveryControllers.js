// deliveryBoyController.js

const DeliveryBoy = require('../../Models/DeliveryBoySchema'); 

// Login delivery boy
const loginDeliveryBoy = async (req, res) => {
  console.log('shihbihbshsjsjsu')
  const { phone, code } = req.body;

  try {
    // Find the delivery boy by phone number and code
    const deliveryBoy = await DeliveryBoy.findOne({ phone, code });

    if (!deliveryBoy) {
      return res.status(401).json({ error: 'Invalid phone number or code' });
    }

    // If found, return success response
    res.status(200).json({ message: 'Login successful', deliveryBoy });
  } catch (error) {
    res.status(500).json({ error: 'Failed to login delivery boy' });
  }
};

// Fetch all delivery boys
const getAllDeliveryBoys = async (req, res) => {
  try {
    const deliveryBoys = await DeliveryBoy.find({}).populate('points');
    res.status(200).json(deliveryBoys);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch delivery boys' });
  }
};

// Add a new delivery boy
const addNewDeliveryBoy = async (req, res) => {
  const { name, phone, code, points } = req.body;
  try {
    const newDeliveryBoy = new DeliveryBoy({
      name,
      phone,
      code,
      points, // Assuming points are sent as an array of point IDs
    });

    await newDeliveryBoy.save();
    res.status(201).json(newDeliveryBoy);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add delivery boy' });
  }
};

// Edit a delivery boy
const editDeliveryBoy = async (req, res) => {
  const { id } = req.params;
  const { name, phone, code, points } = req.body;

  try {
    const updatedDeliveryBoy = await DeliveryBoy.findByIdAndUpdate(
      id,
      { name, phone, code, points },
      { new: true }
    );

    if (!updatedDeliveryBoy) {
      return res.status(404).json({ error: 'Delivery boy not found' });
    }

    res.status(200).json(updatedDeliveryBoy);
  } catch (error) {
    res.status(500).json({ error: 'Failed to edit delivery boy' });
  }
};

// Delete a delivery boy
const deleteDeliveryBoy = async (req, res) => {
  const { id } = req.params;

  try {
    const deletedDeliveryBoy = await DeliveryBoy.findByIdAndDelete(id);

    if (!deletedDeliveryBoy) {
      return res.status(404).json({ error: 'Delivery boy not found' });
    }

    res.status(200).json({ message: 'Delivery boy deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete delivery boy' });
  }
};

module.exports = {
  loginDeliveryBoy,
  getAllDeliveryBoys,
  addNewDeliveryBoy,
  editDeliveryBoy,
  deleteDeliveryBoy,
};
