// controllers/api/categoryController.js

const Group = require('../../Models/GroupModel');
const Point = require('../../Models/PointSchema');
const Bulk = require('../../Models/BulkModel');
const User = require('../../Models/UserSchema');


// controllers/userController.js

const searchUsers = async (req, res) => {
    try {
      const query = req.query.query;
  
      if (!query) {
        return res.status(400).json({ message: 'Query parameter is required.' });
      }
  
      const users = await User.find({
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { phone: { $regex: query, $options: 'i' } },
        ],
      }).populate('latestOrder');
  
      res.status(200).json(users);
    } catch (error) {
      console.error('Error searching users:', error);
      res.status(500).json({ message: 'Server Error' });
    }
  };
  
  
  const getUserSuggestions = async (req, res) => {
    try {
      const query = req.query.query;
  
      if (!query) {
        return res.status(400).json({ message: 'Query parameter is required.' });
      }
  
      const users = await User.find({
        name: { $regex: query, $options: 'i' },
      })
        .limit(5)
        .select('name');
  
      res.status(200).json(users);
    } catch (error) {
      console.error('Error fetching user suggestions:', error);
      res.status(500).json({ message: 'Server Error' });
    }
  };
  

  const getUsersWithPendingPayment = async (req, res) => {
    try {
        console.log('hefjdshjkdhkj')
      const users = await User.find({ isDeleted: false })
        .populate({
          path: 'latestOrder',
          match: { paymentStatus: 'pending' },
        })
        .then((users) => users.filter((user) => user.latestOrder));
  console.log(users)
      res.status(200).json(users);
    } catch (error) {
      console.error('Error fetching users with pending payment:', error);
      res.status(500).json({ message: 'Server Error' });
    }
  };
  


module.exports = {
    getUsersWithPendingPayment,
    searchUsers,
    getUserSuggestions

};
