const { AuditLog } = require("../models")

async function logAudit(userId, action, resourceType, resourceId, details = {}, req = null) {
  try {
    const auditData = {
      user_id: userId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      details,
    }

    if (req) {
      auditData.ip_address = req.ip || req.connection.remoteAddress
      auditData.user_agent = req.get("User-Agent")
    }

    await AuditLog.create(auditData)
  } catch (error) {
    console.error("Audit log error:", error)
    // Don't throw error to avoid breaking the main operation
  }
}

module.exports = {
  logAudit,
}
