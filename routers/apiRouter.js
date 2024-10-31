// application router
const express = require('express');
const router = express.Router();
const controllers = require('../controllers/api/adminControllers')
const pointsController = require('../controllers/api/pointsControllers');
const deliveryBoyController = require('../controllers/api/DeliveryControllers');
const appController = require('../controllers/app/userControllers')
require('dotenv').config();

router.use(express.json(), express.urlencoded({ extended: true }))  
         .use((req, res, next) => {res.locals.session = req.session; next();})


// ========================================================
router.put('/user/:userId', controllers.location);

router.post('/login',controllers.login );
router.post('/postorder',controllers.postOrder );
router.post('/users',controllers.postUser );
router.post('/orders',controllers.postOrder );
router.post('/users',controllers.postUser );
router.get('/users/:id',controllers.getUsers );
router.get('/user/:id', controllers.getUserById);
router.get('/statistics',controllers.getDailyStatistics );
router.put('/updateUser/:id',controllers.editUser);  
router.delete('/deleteUser/:id', controllers.deleteUser);
router.put('/trashUser/:id', controllers.trashUser);
router.get('/pointsWithStatistics', controllers.getPointsWithStatistics);
// Add a new leave
router.post('/addLeave/:orderId', controllers.addLeave);
router.get('/pointsWithExpiredUsers', controllers.getPointsWithExpiredUsers);

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




module.exports = router;

   
