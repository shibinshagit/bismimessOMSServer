// application router
const express = require('express');
const router = express.Router();
const upload = require('../middlewares/multer');
const controllers = require('../controllers/api/adminControllers')
const pointsController = require('../controllers/api/pointsControllers');
const deliveryBoyController = require('../controllers/api/DeliveryControllers');
const financeController = require('../controllers/api/financeControllers');
const appController = require('../controllers/app/userControllers')
require('dotenv').config();

router.use(express.json(), express.urlencoded({ extended: true }))  
         .use((req, res, next) => {res.locals.session = req.session; next();})


// ========================================================
router.put('/user/:userId', controllers.location);
router.post('/login',controllers.login );
router.get('/users/:id',controllers.getUsers );
router.get('/user/:id', controllers.getUserById);
router.get('/statistics',controllers.getDailyStatistics );
router.delete('/deleteUser/:id', controllers.deleteUser);
router.put('/trashUser/:id', controllers.trashUser);
router.get('/pointsWithStatistics', controllers.getPointsWithStatistics);
router.post('/users/:id/renew', controllers.renewOrder);
router.delete('/users/:id', controllers.softDeleteUser);
router.delete('/users/:id/permanent', controllers.hardDeleteUser);
// Add a new leave
router.post('/addLeave/:orderId', controllers.addLeave);
router.get('/pointsWithExpiredUsers', controllers.getPointsWithExpiredUsers);
router.get('/deleted-users', controllers.getSoftDeletedUsers);
router.post('/users/:id/restore', controllers.restoreDeletedUsers);

// Edit an existing leave
router.put('/editLeave/:orderId/:leaveId', controllers.editLeave);

router.get('/points/:pointId/users', controllers.getUsersByPointId);
router.put('/users/:userId/attendance', controllers.updateUserAttendance);

// Delete a leave
router.delete('/deleteLeave/:orderId/:leaveId', controllers.deleteLeave);
router.get('/pointsWithLeaveToday', controllers.getPointsWithLeaveToday);
router.post('/attendance', controllers.addAttendance);
router.get('/attendance/:studentId/:date',controllers.getAttendance );


// Points Routes
router.get('/points', pointsController.getAllPoints);
router.post('/points', pointsController.addNewPoint);

// Delivery Boys Routes
router.get('/delivery-boys', deliveryBoyController.getAllDeliveryBoys);
router.post('/delivery-boys', deliveryBoyController.addNewDeliveryBoy);
router.put('/delivery-boys/:id', deliveryBoyController.editDeliveryBoy);
router.delete('/delivery-boys/:id', deliveryBoyController.deleteDeliveryBoy);

router.post('/postOrder', upload.array('images', 3), controllers.postOrder);
router.put('/updateUser/:id', upload.array('images', 3), controllers.editUser);


router.get('/finance/total-payments', financeController.getTotalPaymentsReceived);
router.get('/finance/pending-payments', financeController.getPendingPayments);
router.get('/finance/transactions', financeController.getTransactionHistory);
router.get('/finance/revenue-over-time', financeController.getRevenueOverTime);



module.exports = router;

   
