// application router
const express = require('express');
const router = express.Router();
const controllers = require('../controllers/adminController')

require('dotenv').config();

router.use(express.json(), express.urlencoded({ extended: true }))  
         .use((req, res, next) => {res.locals.session = req.session; next();})

router.post('/login',controllers.login );
router.post('/postorder',controllers.postOrder );
router.get('/users',controllers.getUsers );
router.get('/statistics',controllers.getDailyStatistics );

// Export the router
module.exports = router;      
