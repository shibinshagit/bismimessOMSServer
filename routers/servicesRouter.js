// application router
const express = require('express');
const router = express.Router();

const deliveryBoyController = require('../controllers/api/DeliveryControllers')


require('dotenv').config();

router.use(express.json(), express.urlencoded({ extended: true }))  
         .use((req, res, next) => {res.locals.session = req.session; next();})


// app Routes============================================================================

// router.post('/delivery_login',DeliveryControllers.loginDeliveryBoy );
// router.get('/DBData',DeliveryControllers.getUserProfile );
// router.get('/deliverypoints/:id',DeliveryControllers.getDeliverypoints );
// router.get('/orders/:id',DeliveryControllers.getOrders );

// Delivery Boys Routes---------------------------------------------------------------------------------------------------------
router.get('/delivery-boys', deliveryBoyController.getAllDeliveryBoys);
router.post('/delivery-boys', deliveryBoyController.addNewDeliveryBoy);
router.put('/delivery-boys/:id', deliveryBoyController.editDeliveryBoy);
router.delete('/delivery-boys/:id', deliveryBoyController.deleteDeliveryBoy);

// Authentication Routes
router.post('/login', deliveryBoyController.loginDeliveryBoy);
router.get('/profile', deliveryBoyController.getUserProfile);

// Delivery Boy Management Routes
router.get('/', deliveryBoyController.getAllDeliveryBoys);
router.post('/', deliveryBoyController.addNewDeliveryBoy);
router.put('/:id', deliveryBoyController.editDeliveryBoy);
router.delete('/:id', deliveryBoyController.deleteDeliveryBoy);

// Delivery Points and Orders
router.get('/:id/points', deliveryBoyController.getDeliverypoints);
router.get('/:id/orders', deliveryBoyController.getOrders);
router.get('/', deliveryBoyController.getUsersByPoint);



// Export the router
module.exports = router;      
