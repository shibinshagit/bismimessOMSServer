// application router
const express = require('express');
const router = express.Router();

const DeliveryControllers = require('../controllers/api/DeliveryControllers')


require('dotenv').config();

router.use(express.json(), express.urlencoded({ extended: true }))  
         .use((req, res, next) => {res.locals.session = req.session; next();})


// app Routes============================================================================

router.post('/delivery_login',DeliveryControllers.loginDeliveryBoy );
router.get('/DBData',DeliveryControllers.getUserProfile );
router.get('/deliverypoints/:id',DeliveryControllers.getDeliverypoints );
router.get('/orders/:id',DeliveryControllers.getOrders );

// Export the router
module.exports = router;      
