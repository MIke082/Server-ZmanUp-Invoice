const schedule = require("node-schedule")
const { Document, Client, User, Service, DocumentItem, AllocationRequest } = require("../models")
const { sendEmail, sendWhatsAppMessage } = require("./notificationService")
const { createBackup } = require("./backupService")
const { Op, sequelize } = require("sequelize")

function startCronJobs() {
  console.log("Starting cron jobs...")

  // Daily reminder check - runs every day at 9:00 AM
  schedule.scheduleJob("0 9 * * *", async () => {
    console.log("Running daily reminder check...")
    await checkOverdueDocuments()
    await checkUpcomingDueDates()
  })

  // Weekly backup - runs every Sunday at 2:00 AM
  schedule.scheduleJob("0 2 * * 0", async () => {
    console.log("Running weekly backup...")
    await performWeeklyBackups()
  })

  // Monthly reports - runs on the 1st of each month at 8:00 AM
  schedule.scheduleJob("0 8 1 * *", async () => {
    console.log("Running monthly reports...")
    await sendMonthlyReports()
  })

  console.log("Cron jobs started successfully")
}

async function checkOverdueDocuments() {
  try {
    const overdueDocuments = await Document.findAll({
      where: {
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
        {
          model: User,
          as: "user",
          attributes: ["business_name", "settings"],
        },
      ],
    })

    for (const document of overdueDocuments) {
      const user = document.user
      const client = document.client

      if (!user.settings?.notifications?.overdue_reminders) {
        continue
      }

      const messageData = {
        business_name: user.business_name,
        client_name: client.name,
        document_type: document.document_type,
        document_number: document.document_number,
        amount: document.total_amount,
        due_date: document.due_date,
      }

      // Send email reminder if enabled and client has email
      if (user.settings.notifications.email && client.email) {
        await sendEmail(client.email, "payment_reminder", messageData)
      }

      // Send WhatsApp reminder if enabled and client has phone
      if (user.settings.notifications.whatsapp && client.phone) {
        await sendWhatsAppMessage(client.phone, "payment_reminder", messageData)
      }
    }

    console.log(`Processed ${overdueDocuments.length} overdue documents`)
  } catch (error) {
    console.error("Check overdue documents error:", error)
  }
}

async function checkUpcomingDueDates() {
  try {
    const upcomingDate = new Date()
    upcomingDate.setDate(upcomingDate.getDate() + 7) // 7 days ahead

    const upcomingDocuments = await Document.findAll({
      where: {
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
        {
          model: User,
          as: "user",
          attributes: ["business_name", "settings"],
        },
      ],
    })

    for (const document of upcomingDocuments) {
      const user = document.user
      const client = document.client

      if (!user.settings?.notifications?.upcoming_reminders) {
        continue
      }

      const reminderDays = user.settings.notifications.reminder_days || 7
      const daysUntilDue = Math.ceil((new Date(document.due_date) - new Date()) / (1000 * 60 * 60 * 24))

      if (daysUntilDue <= reminderDays) {
        const messageData = {
          business_name: user.business_name,
          client_name: client.name,
          document_type: document.document_type,
          document_number: document.document_number,
          amount: document.total_amount,
          due_date: document.due_date,
          custom_message: `תאריך הפירעון מתקרב (עוד ${daysUntilDue} ימים)`,
        }

        // Send email reminder if enabled and client has email
        if (user.settings.notifications.email && client.email) {
          await sendEmail(client.email, "payment_reminder", messageData)
        }

        // Send WhatsApp reminder if enabled and client has phone
        if (user.settings.notifications.whatsapp && client.phone) {
          await sendWhatsAppMessage(client.phone, "payment_reminder", messageData)
        }
      }
    }

    console.log(`Processed ${upcomingDocuments.length} upcoming due dates`)
  } catch (error) {
    console.error("Check upcoming due dates error:", error)
  }
}

async function performWeeklyBackups() {
  try {
    const users = await User.findAll({
      where: {
        is_active: true,
        "settings.backup.auto_backup": true,
        "settings.backup.backup_frequency": "weekly",
      },
    })

    for (const user of users) {
      try {
        const backupData = {
          user: user.toJSON(),
          created_at: new Date().toISOString(),
          version: "1.0",
          type: "auto_weekly",
        }

        // Get user's data for backup
        const [clients, services, documents] = await Promise.all([
          Client.findAll({ where: { user_id: user.id, is_active: true } }),
          Service.findAll({ where: { user_id: user.id, is_active: true } }),
          Document.findAll({
            where: { user_id: user.id },
            include: [
              { model: DocumentItem, as: "items" },
              { model: AllocationRequest, as: "allocationRequest" },
            ],
          }),
        ])

        backupData.clients = clients
        backupData.services = services
        backupData.documents = documents

        const backupResult = await createBackup(user.id, backupData)

        if (backupResult.success) {
          console.log(`Weekly backup created for user ${user.id}`)
        } else {
          console.error(`Weekly backup failed for user ${user.id}:`, backupResult.error)
        }
      } catch (error) {
        console.error(`Weekly backup error for user ${user.id}:`, error)
      }
    }
  } catch (error) {
    console.error("Weekly backups error:", error)
  }
}

async function sendMonthlyReports() {
  try {
    const users = await User.findAll({
      where: {
        is_active: true,
        email: { [Op.ne]: null },
      },
    })

    const lastMonth = new Date()
    lastMonth.setMonth(lastMonth.getMonth() - 1)
    const year = lastMonth.getFullYear()
    const month = lastMonth.getMonth() + 1

    const startDate = `${year}-${month.toString().padStart(2, "0")}-01`
    const endDate = new Date(year, month, 0).toISOString().split("T")[0] // Last day of month

    for (const user of users) {
      try {
        // Get monthly statistics
        const monthlyStats = await Document.findAll({
          where: {
            user_id: user.id,
            issue_date: {
              [Op.between]: [startDate, endDate],
            },
          },
          attributes: [
            [sequelize.fn("COUNT", sequelize.col("id")), "total_documents"],
            [sequelize.fn("SUM", sequelize.col("subtotal")), "total_revenue"],
            [sequelize.fn("SUM", sequelize.col("vat_amount")), "total_vat"],
            [sequelize.fn("SUM", sequelize.col("total_amount")), "total_with_vat"],
          ],
          raw: true,
        })

        const stats = monthlyStats[0] || {}

        const emailData = {
          business_name: user.business_name,
          month: lastMonth.toLocaleDateString("he-IL", { month: "long", year: "numeric" }),
          total_documents: stats.total_documents || 0,
          total_revenue: Number(stats.total_revenue) || 0,
          total_vat: Number(stats.total_vat) || 0,
          total_with_vat: Number(stats.total_with_vat) || 0,
        }

        await sendEmail(user.email, "monthly_report", emailData)
        console.log(`Monthly report sent to user ${user.id}`)
      } catch (error) {
        console.error(`Monthly report error for user ${user.id}:`, error)
      }
    }
  } catch (error) {
    console.error("Monthly reports error:", error)
  }
}

module.exports = {
  startCronJobs,
  checkOverdueDocuments,
  checkUpcomingDueDates,
  performWeeklyBackups,
  sendMonthlyReports,
}
