const express = require("express");
const cors = require("cors");
const session = require("express-session");
const dotenv = require("dotenv");
const { createServer } = require("http"); // Import createServer
const { Server } = require("socket.io"); // Import Server from socket.io
const connectDB = require("./dbConfig/db");
const ApiRoutes = require("./routers/apiRouter");
const AppRoutes = require("./routers/appRouter");
const ServiceRoutes = require("./routers/servicesRouter");
const { setSocketIOInstance } = require("./controllers/api/notifyControllers");

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
app.use(express.static("public/"));

// Session setup
const sessionSecret = process.env.SESSION_SECRET || "default_secret_key";

app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
);

// DB Connection
connectDB();

const port = process.env.PORT || 5000;
const host = process.env.HOST || "localhost";

// Create HTTP server and attach socket.io
const server = createServer(app);
const io = new Server(server, {
  cors: {
<<<<<<< HEAD
    origin: "https://admin.bismimess.online",  // Make sure this is your frontend URL
    methods: ["GET", "POST"]
}
});

=======
    origin: "https://admin.bismimess.online",
  },
});
>>>>>>> 6cf5aec15a5efb45e0a1e1fcee72cefc87c9526d
setSocketIOInstance(io);
// Example: Handle socket.io connections
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("A user disconnected:", socket.id);
  });
});

// Routes
app.use("/api", ApiRoutes);       
app.use("/app", AppRoutes);
app.use("/services", ServiceRoutes);

app.use("*", (req, res) => {
  res.status(404).json({ message: "request not found" });
});

// Start server
server.listen(port, () => console.log(`Server is running on ${host}:${port}`));
