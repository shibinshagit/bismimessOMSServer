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

router.post('/login',controllers.login );
router.post('/postorder',controllers.postOrder );
router.get('/users',controllers.getUsers );
router.get('/statistics',controllers.getDailyStatistics );
router.put('/updateUser/:id',controllers.editUser);  
router.delete('/deleteUser/:id', controllers.deleteUser);
router.put('/trashUser/:id', controllers.trashUser);
router.post('/addLeave/:orderId', controllers.addLeave);
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



module.exports = router;      
