const jwt = require("jsonwebtoken")
const { User, Accountant } = require("../models")

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"]
    // console.log("Authorization header:", authHeader)

    const token = authHeader && authHeader.split(" ")[1]
    // console.log("Extracted token:", token)

    if (!token) {
      // return res.status(401).json({ error: "Access token required" })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    // console.log("✅ Decoded token:", decoded)

    let user = null
    if (decoded.role === "user") {
      user = await User.findByPk(decoded.userId)
    } else if (decoded.role === "accountant") {
      user = await Accountant.findByPk(decoded.userId)
    }

    if (!user || !user.is_active) {
      return res.status(401).json({ error: "Invalid or inactive user" })
    }

    req.user = user
    req.userRole = decoded.role
    next()
  } catch (error) {
    console.error("❌ Auth middleware error:", error.message)
    return res.status(403).json({ error: "Invalid token" })
  }
}

const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" })
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" })
    }

    next()
  }
}

const requireBusinessType = (businessTypes) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" })
    }

    if (!businessTypes.includes(req.user.business_type)) {
      return res.status(403).json({
        error: "This feature is not available for your business type",
      })
    }

    next()
  }
}


module.exports = {
  authenticateToken,
  requireRole,
  requireBusinessType,
}
