// imports---------------------------------------------------------------------------------------------------------------------
const express = require('express');
const router = express.Router();
const upload = require('../middlewares/multer');
const controllers = require('../controllers/api/adminControllers');
const pointsController = require('../controllers/api/pointsControllers');
const deliveryBoyController = require('../controllers/api/DeliveryControllers');
const financeController = require('../controllers/api/financeControllers');
const CreationController = require('../controllers/api/CreationController')
const searchController = require('../controllers/api/searchController')
const notificationController = require('../controllers/api/notifyControllers.js')
const appController = require('../controllers/app/userControllers');
const orderController = require('../controllers/api/orderController');
// ------------------------------------------------------------------------------------------------------------------------------end

require('dotenv').config();

router.use(express.json(), express.urlencoded({ extended: true }))
      .use((req, res, next) => { res.locals.session = req.session; next(); });
      router.get('/:userId/orders', orderController.getUserOrders);
      router.post('/user/:userId/orders', orderController.addOrder);
      router.put('/orders/:orderId', orderController.editOrder);
      router.delete('/orders/:orderId', orderController.deleteOrder);
// User Routes------------------------------------------------------------------------------------------------------------------
router.put('/user/:userId', controllers.location);
router.post('/login', controllers.login);
router.get('/users/:id', controllers.getUsers);
router.get('/user/:id', controllers.getUserById);
router.get('/statistics', controllers.getDailyStatistics);  
router.put('/trashUser/:id', controllers.trashUser);
router.get('/pointsWithStatistics', controllers.getPointsWithStatistics);
router.post('/users/:id/renew', controllers.renewOrder);
router.delete('/users/:id', controllers.softDeleteUser);
router.delete('/users/:id/permanent', controllers.hardDeleteUser);
router.post('/addLeave/:orderId', controllers.addLeave);
router.get('/pointsWithExpiredUsers', controllers.getPointsWithExpiredUsers);
router.get('/deleted-users', controllers.getSoftDeletedUsers);
router.post('/users/:id/restore', controllers.restoreDeletedUsers);
router.get('/orders/new', controllers.getNewOrders);
// ------------------------------------------------------------------------------------------------------------------------------end

// Edit Leave-------------------------------------------------------------------------------------------------------------------
router.put('/editLeave/:orderId/:leaveId', controllers.editLeave);
router.get('/points/:pointId/users', controllers.getUsersByPointId);
// router.put('/users/:userId/attendance', controllers.updateUserAttendance);
// router.put('/users/attendance/batch', controllers.updateUserAttendanceBatch);
router.put('/users/attendanceApp', controllers.updateUserAttendanceApp);
// ------------------------------------------------------------------------------------------------------------------------------end

// Delete a Leave----------------------------------------------------------------------------------------------------------------
router.delete('/deleteLeave/:orderId/:leaveId', controllers.deleteLeave);
router.get('/pointsWithLeaveToday', controllers.getPointsWithLeaveToday);
router.post('/attendance', controllers.addAttendance);
router.get('/attendance/:studentId/:date', controllers.getAttendance);
// ------------------------------------------------------------------------------------------------------------------------------end

// Points Routes-----------------------------------------------------------------------------------------------------------------
router.get('/points', pointsController.getAllPoints);
router.post('/points', pointsController.addNewPoint);
// ------------------------------------------------------------------------------------------------------------------------------end

// Delivery Boys Routes---------------------------------------------------------------------------------------------------------
router.get('/replace/delivery-boys', deliveryBoyController.getAllDeliveryBoys);
router.post('/replace/delivery-boys', deliveryBoyController.addNewDeliveryBoy);
router.put('/replace/delivery-boys/:id', deliveryBoyController.editDeliveryBoy);
router.delete('/replace/delivery-boys/:id', deliveryBoyController.deleteDeliveryBoy);

// Authentication Routes
router.post('/replace/login', deliveryBoyController.loginDeliveryBoy);
router.get('/replace/profile', deliveryBoyController.getUserProfile);

// Delivery Boy Management Routes
router.get('/replace', deliveryBoyController.getAllDeliveryBoys);
router.post('/replace', deliveryBoyController.addNewDeliveryBoy);
router.put('/replace/:id', deliveryBoyController.editDeliveryBoy);
router.delete('/replace/:id', deliveryBoyController.deleteDeliveryBoy);

// Delivery Points and Orders
router.get('/replace/:id/points', deliveryBoyController.getDeliverypoints);
router.get('/replace/:id/orders', deliveryBoyController.getOrders);
router.get('/replace', deliveryBoyController.getUsersByPoint);

// ------------------------------------------------------------------------------------------------------------------------------end

// Order Routes------------------------------------------------------------------------------------------------------------------
router.post('/postOrder', upload.array('images', 3), controllers.postOrder);
router.put('/updateUser/:id', upload.array('images', 3), controllers.editUser);
router.put('/orders/:orderId/bill', controllers.markOrderAsBilled);
// ------------------------------------------------------------------------------------------------------------------------------end

// Finance Routes----------------------------------------------------------------------------------------------------------------
router.get('/finance/total-payments', financeController.getTotalPaymentsReceived);
router.get('/finance/pending-payments', financeController.getPendingPayments);
router.get('/finance/transactions', financeController.getTransactionHistory);
router.get('/finance/revenue-over-time', financeController.getRevenueOverTime);
// ------------------------------------------------------------------------------------------------------------------------------end
// creation Routes----------------------------------------------------------------------------------------------------------------
router.post('/groups', CreationController.createGroup);
router.get('/groups', CreationController.getAllGroups);
router.get('/groupByID', CreationController.getGroupsByPointId);
router.put('/groups/:id', CreationController.updateGroup);
router.delete('/groups/:id', CreationController.deleteGroup);

// Bulk Routes
router.post('/bulks', CreationController.createBulk);
router.get('/bulks', CreationController.getAllBulks);
router.put('/bulks/:id', CreationController.updateBulk);
router.delete('/bulks/:id', CreationController.deleteBulk);
   
// Bulk Leave Routes
router.post('/bulks/:id/addLeave', CreationController.addLeaveToBulkOrder);
router.put('/bulks/:id/updateLeave', CreationController.updateLeaveInBulkOrder);
router.delete('/bulks/:id/deleteLeave', CreationController.deleteLeaveFromBulkOrder);
// ------------------------------------------------------------------------------------------------------------------------------end
// Search Routes
router.get('/search', searchController.searchUsers);
router.get('/suggestions', searchController.getUserSuggestions);
router.get('/paymentStatus/pending', searchController.getUsersWithPendingPayment);
// ------------------------------------------------------------------------------------------------------------------------------end
// Notes Routes
router.get('/notes', notificationController.getAllNotes);

// GET note by ID
router.get('/notes/:id', notificationController.getNoteById);

// POST add new note
router.post('/notes', notificationController.createNote);

// PUT update note
router.put('/notes/:id', notificationController.updateNote);

// DELETE note
router.delete('/notes/:id', notificationController.deleteNote);
// ------------------------------------------------------------------------------------------------------------------------------end

module.exports = router;
