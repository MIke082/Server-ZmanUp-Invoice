const express = require("express")
const cors = require("cors")
const helmet = require("helmet")
const rateLimit = require("express-rate-limit")
const path = require("path")
require("dotenv").config()

const { sequelize } = require("./models")
const authRoutes = require("./routes/auth")
const documentsRoutes = require("./routes/documents")
const clientsRoutes = require("./routes/clients")
const servicesRoutes = require("./routes/services")
const reportsRoutes = require("./routes/reports")
const allocationRoutes = require("./routes/allocation")
const accountantRoutes = require("./routes/accountant")
const notificationsRoutes = require("./routes/notifications")
const archiveRoutes = require("./routes/archive")
const inviteClientController = require("./routes/invitations")
const expensesRoutes = require("./routes/expenses")
const { authenticateToken } = require("./middleware/auth")
const { startCronJobs } = require("./services/cronService")
const { createUploadsDir } = require("./utils/fileUtils")
const startMonthlyReportCron = require("./cron/cronTasks")

const app = express()
const PORT = process.env.PORT || 3000

// Security middleware
app.use(helmet())
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:19006" || "http://192.168.1.101:3000/api",
    credentials: true,
  }),
)

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: "Too many requests, please try again later" },
})
app.use(limiter)

// Body parsing middleware
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true }))

// Static files for uploads
app.use("/uploads", express.static(path.join(__dirname, "uploads")))

// Routes
app.use("/api/auth", authRoutes)
app.use("/api/accountants", accountantRoutes)

app.use("/api/documents", authenticateToken, documentsRoutes)
app.use("/api/clients", authenticateToken, clientsRoutes)
app.use("/api/services", authenticateToken, servicesRoutes)
app.use("/api/reports", authenticateToken, reportsRoutes)
app.use("/api/allocation", authenticateToken, allocationRoutes)
app.use("/api/notifications", authenticateToken, notificationsRoutes)
app.use("/api/archive", authenticateToken, archiveRoutes)
app.use('/api/invitation', authenticateToken, inviteClientController)
app.use('/api/expenses', authenticateToken, expensesRoutes)



// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    environment: process.env.NODE_ENV || "development",
  })
})

// API info
app.get("/api", (req, res) => {
  res.json({
    name: "ZmanUp Invoice System API",
    version: "1.0.0",
    description: "Israeli Invoice Management System",
    endpoints: {
      auth: "/api/auth",
      documents: "/api/documents",
      clients: "/api/clients",
      services: "/api/services",
      reports: "/api/reports",
      allocation: "/api/allocation",
      accountant: "/api/accountant",
      notifications: "/api/notifications",
      archive: "/api/archive",
    },
  })
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err)

  // Sequelize validation errors
  if (err.name === "SequelizeValidationError") {
    return res.status(400).json({
      error: "Validation error",
      details: err.errors.map((e) => ({ field: e.path, message: e.message })),
    })
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({ error: "Invalid token" })
  }

  res.status(err.status || 500).json({
    error: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  })
})

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ error: "Route not found" })
})

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully")
  await sequelize.close()
  process.exit(0)
})

//Отправляем отчет каждый месяц первого числа за прошлый месяц и так же 1 января за весь год
startMonthlyReportCron()


// Start server
async function startServer() {
  try {
    // Create uploads directory
    await createUploadsDir()
    console.log("✅ Uploads directory created")

    // Test database connection
    await sequelize.authenticate()
    console.log("✅ Database connection established successfully")

    // Sync database models
    if (process.env.NODE_ENV === "development") {
      console.log("⛔ DB auto-sync is DISABLED in dev")
    } else {
      console.log("⛔ DB auto-sync is DISABLED in prod")
    }


    // Start cron jobs
    startCronJobs()
    console.log("✅ Cron jobs started")

    app.listen(PORT, () => {
      console.log(`🚀 ZmanUp Invoice System Backend running on port ${PORT}`)
      console.log(`📊 Environment: ${process.env.NODE_ENV || "development"}`)
      console.log(`🌐 API Base URL: http://localhost:${PORT}/api`)
    })
  } catch (error) {
    console.error("❌ Unable to start server:", error)
    process.exit(1)
  }
}

// sequelize.sync({ alter: true }) // или { force: true } для полной пересборки
//   .then(() => {
//     console.log("✅ All models synced");
//   })
//   .catch((err) => {
//     console.error("❌ Sync error:", err);
//   });

startServer()
