const express = require("express")
const { Document, Client, User, sequelize } = require("../models")
const { sendWhatsAppMessage, sendEmail } = require("../services/notificationService")
const { logAudit } = require("../utils/auditLogger")
const { Op } = require("sequelize")

const router = express.Router()

// GET /notifications/overdue - просроченные документы
router.get("/overdue", async (req, res) => {
  try {
    const overdueDocuments = await Document.findAll({
      where: {
        user_id: req.user.id,
        status: "pending",
        due_date: {
          [Op.lt]: new Date(),
        },
      },
      include: [
        {
          model: Client,
          as: "client",
          attributes: ["name", "phone", "email"],
        },
      ],
      order: [["due_date", "ASC"]],
    })

    res.json({
      success: true,
      data: overdueDocuments,
      count: overdueDocuments.length,
    })
  } catch (error) {
    console.error("Get overdue documents error:", error)
    res.status(500).json({ error: "Failed to fetch overdue documents" })
  }
})

// GET /notifications/upcoming - документы с приближающимся сроком
router.get("/upcoming", async (req, res) => {
  try {
    const { days = 7 } = req.query

    const upcomingDate = new Date()
    upcomingDate.setDate(upcomingDate.getDate() + Number.parseInt(days))

    const upcomingDocuments = await Document.findAll({
      where: {
        user_id: req.user.id,
        status: "pending",
        due_date: {
          [Op.between]: [new Date(), upcomingDate],
        },
      },
      include: [
        {
          model: Client,
          as: "client",
          attributes: ["name", "phone", "email"],
        },
      ],
      order: [["due_date", "ASC"]],
    })

    res.json({
      success: true,
      data: upcomingDocuments,
      count: upcomingDocuments.length,
    })
  } catch (error) {
    console.error("Get upcoming documents error:", error)
    res.status(500).json({ error: "Failed to fetch upcoming documents" })
  }
})

// POST /notifications/send-reminder - отправить напоминание
router.post("/send-reminder", async (req, res) => {
  try {
    const { document_id, method, custom_message } = req.body

    if (!document_id || !method) {
      return res.status(400).json({
        error: "Document ID and notification method are required",
      })
    }

    if (!["email", "whatsapp"].includes(method)) {
      return res.status(400).json({
        error: "Invalid notification method. Use 'email' or 'whatsapp'",
      })
    }

    const document = await Document.findOne({
      where: { id: document_id, user_id: req.user.id },
      include: [
        {
          model: Client,
          as: "client",
        },
      ],
    })

    if (!document) {
      return res.status(404).json({ error: "Document not found" })
    }

    if (!document.client) {
      return res.status(400).json({ error: "Document has no associated client" })
    }

    let result
    const messageData = {
      business_name: req.user.business_name,
      client_name: document.client.name,
      document_type: document.document_type,
      document_number: document.document_number,
      amount: document.total_amount,
      due_date: document.due_date,
      custom_message,
    }

    if (method === "email") {
      if (!document.client.email) {
        return res.status(400).json({ error: "Client has no email address" })
      }
      result = await sendEmail(document.client.email, "payment_reminder", messageData)
    } else if (method === "whatsapp") {
      if (!document.client.phone) {
        return res.status(400).json({ error: "Client has no phone number" })
      }
      result = await sendWhatsAppMessage(document.client.phone, "payment_reminder", messageData)
    }

    if (result.success) {
      await logAudit(
        req.user.id,
        "send_reminder",
        "document",
        document.id,
        { method, client_id: document.client.id },
        req,
      )

      res.json({
        success: true,
        message: `Reminder sent successfully via ${method}`,
        data: result,
      })
    } else {
      res.status(500).json({
        error: `Failed to send reminder via ${method}`,
        details: result.error,
      })
    }
  } catch (error) {
    console.error("Send reminder error:", error)
    res.status(500).json({ error: "Failed to send reminder" })
  }
})

// POST /notifications/bulk-reminders - массовая отправка напоминаний
router.post("/bulk-reminders", async (req, res) => {
  try {
    const { document_ids, method, custom_message } = req.body

    if (!document_ids || !Array.isArray(document_ids) || document_ids.length === 0) {
      return res.status(400).json({ error: "Document IDs array is required" })
    }

    if (!["email", "whatsapp"].includes(method)) {
      return res.status(400).json({
        error: "Invalid notification method. Use 'email' or 'whatsapp'",
      })
    }

    const documents = await Document.findAll({
      where: {
        id: { [Op.in]: document_ids },
        user_id: req.user.id,
      },
      include: [
        {
          model: Client,
          as: "client",
        },
      ],
    })

    const results = []

    for (const document of documents) {
      if (!document.client) {
        results.push({
          document_id: document.id,
          success: false,
          error: "No associated client",
        })
        continue
      }

      const contactInfo = method === "email" ? document.client.email : document.client.phone

      if (!contactInfo) {
        results.push({
          document_id: document.id,
          success: false,
          error: `Client has no ${method === "email" ? "email" : "phone"}`,
        })
        continue
      }

      const messageData = {
        business_name: req.user.business_name,
        client_name: document.client.name,
        document_type: document.document_type,
        document_number: document.document_number,
        amount: document.total_amount,
        due_date: document.due_date,
        custom_message,
      }

      try {
        let result
        if (method === "email") {
          result = await sendEmail(contactInfo, "payment_reminder", messageData)
        } else {
          result = await sendWhatsAppMessage(contactInfo, "payment_reminder", messageData)
        }

        results.push({
          document_id: document.id,
          success: result.success,
          error: result.success ? null : result.error,
        })

        if (result.success) {
          await logAudit(
            req.user.id,
            "send_bulk_reminder",
            "document",
            document.id,
            { method, client_id: document.client.id },
            req,
          )
        }
      } catch (error) {
        results.push({
          document_id: document.id,
          success: false,
          error: error.message,
        })
      }

      // Небольшая задержка между отправками
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    const successCount = results.filter((r) => r.success).length
    const failureCount = results.filter((r) => !r.success).length

    res.json({
      success: true,
      message: `Bulk reminders completed. ${successCount} sent, ${failureCount} failed.`,
      results,
      summary: {
        total: results.length,
        success: successCount,
        failed: failureCount,
      },
    })
  } catch (error) {
    console.error("Bulk reminders error:", error)
    res.status(500).json({ error: "Failed to send bulk reminders" })
  }
})

// GET /notifications/settings - настройки уведомлений
router.get("/settings", async (req, res) => {
  try {
    const settings = req.user.settings?.notifications || {
      email: true,
      whatsapp: false,
      overdue_reminders: true,
      upcoming_reminders: true,
      reminder_days: 7,
    }

    res.json({
      success: true,
      data: settings,
    })
  } catch (error) {
    console.error("Get notification settings error:", error)
    res.status(500).json({ error: "Failed to fetch notification settings" })
  }
})

// PUT /notifications/settings - обновить настройки уведомлений
router.put("/settings", async (req, res) => {
  try {
    const { email, whatsapp, overdue_reminders, upcoming_reminders, reminder_days } = req.body

    const currentSettings = req.user.settings || {}
    const newNotificationSettings = {
      ...currentSettings.notifications,
      email: email !== undefined ? email : currentSettings.notifications?.email,
      whatsapp: whatsapp !== undefined ? whatsapp : currentSettings.notifications?.whatsapp,
      overdue_reminders:
        overdue_reminders !== undefined ? overdue_reminders : currentSettings.notifications?.overdue_reminders,
      upcoming_reminders:
        upcoming_reminders !== undefined ? upcoming_reminders : currentSettings.notifications?.upcoming_reminders,
      reminder_days: reminder_days !== undefined ? reminder_days : currentSettings.notifications?.reminder_days,
    }

    await req.user.update({
      settings: {
        ...currentSettings,
        notifications: newNotificationSettings,
      },
    })

    await logAudit(req.user.id, "update_notification_settings", "user", req.user.id, newNotificationSettings, req)

    res.json({
      success: true,
      data: newNotificationSettings,
      message: "Notification settings updated successfully",
    })
  } catch (error) {
    console.error("Update notification settings error:", error)
    res.status(500).json({ error: "Failed to update notification settings" })
  }
})

module.exports = router
