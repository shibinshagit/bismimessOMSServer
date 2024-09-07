// application router
const express = require('express');
const router = express.Router();
const appController = require('../controllers/app/userControllers')

require('dotenv').config();

router.use(express.json(), express.urlencoded({ extended: true }))  
         .use((req, res, next) => {res.locals.session = req.session; next();})


// app Routes============================================================================
router.post("/login", appController.login);  
router.post("/otpcheck", appController.otpCheck);


module.exports = router;      
