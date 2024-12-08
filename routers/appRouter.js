// application router
const express = require('express');
const session = require('express-session');
const router = express.Router();
const appController = require('../controllers/app/userControllers')
const authenticate = require('../middlewares/auth');
const dotenv = require('dotenv');
dotenv.config();


require('dotenv').config();

router.use(express.json(), express.urlencoded({ extended: true }))  
         .use(session({secret:process.env.SESSION_SECRET,resave: false , saveUninitialized: false}))
         .use((req, res, next) => {res.locals.session = req.session;next();})


// app Routes============================================================================
// router.get('/protected-route', authenticate, appController.protectedRoute);
router.post("/login", appController.login);  
router.post("/otpcheck", appController.otpCheck);
router.get('/user',authenticate, appController.getUserById);
router.get("/orders", authenticate, appController.getUserOrders);
router.put("/updateProfile",authenticate, appController.updateProfile);
// routes/appRoutes.js
router.post('/orders/:orderId/leaves', authenticate, appController.addLeave);
router.delete('/orders/:orderId/leaves/:leaveId', authenticate, appController.deleteLeave);
router.get('/orders/:orderId/leaves', authenticate, appController.getLeaves);








module.exports = router;      
 