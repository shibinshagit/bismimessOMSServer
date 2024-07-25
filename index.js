const express = require('express');
const cors = require('cors');
const session = require('express-session');
const dotenv = require('dotenv');
const connectDB = require('./dbConfig/db');
const Routes = require('./routers/appRouter');


dotenv.config();

const app = express(); 

// CORS setup
app.use(
  cors({
    origin: "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true, 
  })
);

// Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static('public/'));

// Session setup
const sessionSecret = process.env.SESSION_SECRET || "default_secret_key";

app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } 
}));
 
// DB Connection
connectDB();

const port = process.env.PORT || 5000;
const host = process.env.HOST || 'localhost';  


// Routes
app.use('/api', Routes);

app.use('*',(req, res) => {
  res.status(404).json({message: 'request not found'})
})


// Server
app.listen(port, () => console.log(`Server is running on ${host}:${port}`));

