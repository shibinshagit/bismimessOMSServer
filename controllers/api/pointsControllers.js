// pointsController.js

const Point = require('../../Models/PointSchema');

// Fetch all points
const getAllPoints = async (req, res) => {
  try {
    const points = await Point.find({});
    res.status(200).json(points);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch points' });
  }
};

// Add a new point
const addNewPoint = async (req, res) => {
  const { place, mode } = req.body;
  try {
    // Check if point already exists
    const existingPoint = await Point.findOne({ place });
    if (existingPoint) {
      return res.status(400).json({ error: 'Point already exists' });
    }

    const newPoint = new Point({ place, mode });
    await newPoint.save();
    res.status(201).json(newPoint);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add point' });
  }
};

module.exports = {
  getAllPoints,
  addNewPoint,
};
