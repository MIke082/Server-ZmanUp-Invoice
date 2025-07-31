// const express = require("express")
// const crypto = require("crypto")
// const { User, AccountantAccess, Document, Expense, sequelize } = require("../models")
// const { authenticateToken } = require("../middleware/auth")
// const { sendEmail } = require("../services/notificationService")
// const { Op } = require("sequelize")

// const router = express.Router()

// // Middleware to check if user is accountant
// const requireAccountant = (req, res, next) => {
//   if (req.user.role !== "accountant" && req.user.role !== "admin") {
//     return res.status(403).json({ error: "Access denied. Accountant role required." })
//   }
//   next()
// }





// // POST /accountants/resend-invitation/:clientId - Resend invitation
// router.post("/resend-invitation/:clientId", authenticateToken, requireAccountant, async (req, res) => {
//   try {
//     const client = await User.findOne({
//       where: {
//         id: req.params.clientId,
//         invited_by: req.user.id,
//         password: null, // Only for non-activated users
//       },
//     })

//     if (!client) {
//       return res.status(404).json({ error: "Client not found or already activated" })
//     }

//     // Generate new invitation token
//     const invitationToken = crypto.randomBytes(32).toString("hex")
//     const invitationExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

//     await client.update({
//       invitation_token: invitationToken,
//       invitation_expires: invitationExpires,
//     })

//     // Send invitation email
//     const invitationUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/activate-invitation?token=${invitationToken}`

//     const emailResult = await sendEmail(client.email, "client_invitation", {
//       accountant_name: req.user.getFullName(),
//       accountant_business: req.user.business_name,
//       client_name: client.firstName || client.business_name,
//       invitation_url: invitationUrl,
//       language: client.preferred_language,
//     })

//     if (!emailResult.success) {
//       console.error("Failed to send invitation email:", emailResult.error)
//       return res.status(500).json({ error: "Failed to send invitation email" })
//     }

//     res.json({
//       success: true,
//       message: "Invitation resent successfully",
//     })
//   } catch (error) {
//     console.error("Resend invitation error:", error)
//     res.status(500).json({ error: "Failed to resend invitation" })
//   }
// })

// // GET /accountants/client/:clientId - Get specific client details
// router.get("/client/:clientId", authenticateToken, requireAccountant, async (req, res) => {
//   try {
//     const client = await User.findOne({
//       where: {
//         id: req.params.clientId,
//         invited_by: req.user.id,
//       },
//       attributes: { exclude: ["password", "reset_code", "reset_token", "invitation_token"] },
//     })

//     if (!client) {
//       return res.status(404).json({ error: "Client not found" })
//     }

//     // Get detailed stats
//     const [documents, expenses, totalRevenue] = await Promise.all([
//       Document.findAll({
//         where: { user_id: client.id },
//         attributes: ["id", "document_number", "type", "status", "total_amount", "created_at"],
//         order: [["created_at", "DESC"]],
//         limit: 10,
//       }),
//       Expense.findAll({
//         where: { user_id: client.id },
//         attributes: ["id", "description", "amount", "category", "expense_date", "created_at"],
//         order: [["created_at", "DESC"]],
//         limit: 10,
//       }),
//       Document.sum("total_amount", {
//         where: {
//           user_id: client.id,
//           status: "paid",
//         },
//       }),
//     ])

//     const clientData = client.toJSON()
//     clientData.stats = {
//       documents: documents.length,
//       expenses: expenses.length,
//       total_revenue: totalRevenue || 0,
//     }
//     clientData.recent_documents = documents
//     clientData.recent_expenses = expenses

//     res.json({
//       success: true,
//       data: clientData,
//     })
//   } catch (error) {
//     console.error("Get client details error:", error)
//     res.status(500).json({ error: "Failed to fetch client details" })
//   }
// })



// // GET /accountants/client/:clientId/expenses - Get client expenses
// router.get("/client/:clientId/expenses", authenticateToken, requireAccountant, async (req, res) => {
//   try {
//     const { page = 1, limit = 20, category, from_date, to_date } = req.query

//     // Verify client belongs to this accountant
//     const client = await User.findOne({
//       where: {
//         id: req.params.clientId,
//         invited_by: req.user.id,
//       },
//     })

//     if (!client) {
//       return res.status(404).json({ error: "Client not found" })
//     }

//     const where = { user_id: req.params.clientId }
//     if (category) where.category = category
//     if (from_date && to_date) {
//       where.expense_date = {
//         [Op.between]: [new Date(from_date), new Date(to_date)],
//       }
//     }

//     const expenses = await Expense.findAndCountAll({
//       where,
//       order: [["expense_date", "DESC"]],
//       limit: Number.parseInt(limit),
//       offset: (Number.parseInt(page) - 1) * Number.parseInt(limit),
//     })

//     res.json({
//       success: true,
//       data: expenses.rows,
//       pagination: {
//         total: expenses.count,
//         page: Number.parseInt(page),
//         limit: Number.parseInt(limit),
//         pages: Math.ceil(expenses.count / Number.parseInt(limit)),
//       },
//     })
//   } catch (error) {
//     console.error("Get client expenses error:", error)
//     res.status(500).json({ error: "Failed to fetch client expenses" })
//   }
// })

// // POST /accountants/client/:clientId/comment - Add comment for client
// router.post("/client/:clientId/comment", authenticateToken, requireAccountant, async (req, res) => {
//   try {
//     const { message } = req.body

//     if (!message) {
//       return res.status(400).json({ error: "Message is required" })
//     }

//     // Verify client belongs to this accountant
//     const client = await User.findOne({
//       where: {
//         id: req.params.clientId,
//         invited_by: req.user.id,
//       },
//     })

//     if (!client) {
//       return res.status(404).json({ error: "Client not found" })
//     }

//     // Send email notification to client
//     const emailResult = await sendEmail(client.email, "accountant_comment", {
//       accountant_name: req.user.getFullName(),
//       accountant_business: req.user.business_name,
//       client_name: client.firstName || client.business_name,
//       message,
//       language: client.preferred_language,
//     })

//     res.json({
//       success: true,
//       message: "Comment sent to client successfully",
//     })
//   } catch (error) {
//     console.error("Send comment error:", error)
//     res.status(500).json({ error: "Failed to send comment" })
//   }
// })

// // DELETE /accountants/client/:clientId - Remove client (soft delete)
// router.delete("/client/:clientId", authenticateToken, requireAccountant, async (req, res) => {
//   try {
//     const client = await User.findOne({
//       where: {
//         id: req.params.clientId,
//         invited_by: req.user.id,
//       },
//     })

//     if (!client) {
//       return res.status(404).json({ error: "Client not found" })
//     }

//     // Soft delete - remove the invitation relationship
//     await client.update({
//       invited_by: null,
//       is_invited: false,
//     })

//     res.json({
//       success: true,
//       message: "Client removed successfully",
//     })
//   } catch (error) {
//     console.error("Remove client error:", error)
//     res.status(500).json({ error: "Failed to remove client" })
//   }
// })

// module.exports = router

const express = require("express")
const crypto = require("crypto")
const { User, Document, Expense, Client } = require("../models")
const { authenticateToken, requireRole } = require("../middleware/auth")
const { sendEmail } = require("../services/notificationService")
const { Op } = require("sequelize")
const bcrypt = require("bcryptjs")
const dayjs = require("dayjs")
const path = require("path")
const fs = require("fs")

const router = express.Router()

// ✅ POST /accountants/register - Register a new accountant
router.post("/register", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      password,
      businessName,
      licenseNumber,
      specialization,
      experience,
      agreeToTerms,
      address,
      city,
      website,
      business_type, // פתור / מורשה / חברה
    } = req.body

    console.log("=== Accountant register ===", req.body)

    // Валидация обязательных полей
    if (!email || !firstName || !lastName || !businessName || !licenseNumber || !password || !phone || !agreeToTerms) {
      return res.status(400).json({ error: "Missing required fields" })
    }

    // Проверка дубликата по email
    const existing = await Accountant.findOne({ where: { email } })
    if (existing) {
      return res.status(409).json({ error: "Accountant with this email already exists" })
    }

    // Хеш пароля
    const passwordHash = await bcrypt.hash(password, 10)

    // Создание бухгалтера
    const accountant = await Accountant.create({
      firstName,
      lastName,
      email,
      phone,
      passwordHash,
      businessName,
      licenseNumber,
      specialization,
      experience: experience === '' ? null : Number(experience),
      agreeToTerms,
      address,
      city,
      website,
      business_type,
      role: "accountant", // по умолчанию
    })

    res.status(201).json({ success: true, data: accountant })
  } catch (error) {
    console.error("Register accountant error:", error)
    res.status(500).json({ error: "Failed to register accountant" })
  }
})

// GET /accountants/clients - Get all clients for this accountant
router.get("/clients", authenticateToken, requireRole(["accountant"]), async (req, res) => {
  try {
    const { page = 1, limit = 20, status = "all", search } = req.query

    const where = {
      accountant_id: req.user.id,
    }

    if (status === "active") {
      where.is_active = true
      where.password = { [Op.ne]: null }
    } else if (status === "pending") {
      where.password = null
    }

    if (search) {
      where[Op.or] = [
        { first_name: { [Op.like]: `%${search}%` } },
        { last_name: { [Op.like]: `%${search}%` } },
        { business_name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
      ]
    }

    const clientsResult = await User.findAndCountAll({
      where,
      attributes: [
        "id",
        "email",
        "first_name",
        "last_name",
        "business_name",
        "business_type",
        "phone",
        "is_active",
        "last_login",
        "password", // нужно только для проверки is_activated
      ],
      order: [["created_at", "DESC"]],
      limit: Number.parseInt(limit),
      offset: (Number.parseInt(page) - 1) * Number.parseInt(limit),
    })

    const clientsWithStats = await Promise.all(
      clientsResult.rows.map(async (client) => {
        const clientData = client.toJSON?.() || client

        clientData.is_activated = !!clientData.password
        delete clientData.password

        // Считаем документы и расходы
        const [documentCount, expenseCount] = await Promise.all([
          Document.count({ where: { user_id: clientData.id } }),
          Expense.count({ where: { user_id: clientData.id } }),
        ])

        clientData.stats = {
          documents: documentCount,
          expenses: expenseCount,
        }

        return clientData
      })

    )

    res.json({
      success: true,
      data: clientsWithStats,
      // pagination: {
      //   total: clientsResult.count,
      //   page: Number.parseInt(page),
      //   limit: Number.parseInt(limit),
      //   pages: Math.ceil(clientsResult.count / Number.parseInt(limit)),
      // },
    })
  } catch (error) {
    console.error("Get accountant clients error:", error)
    res.status(500).json({ error: "Failed to fetch clients" })
  }
})

// routes/accountant.js
router.get("/stats/monthly-documents", authenticateToken, requireRole(["accountant"]), async (req, res) => {
  try {
    const fromDate = new Date(dayjs().startOf("month").format("YYYY-MM-DD"))
    const toDate = new Date(dayjs().endOf("month").format("YYYY-MM-DD"))

    // Получаем всех клиентов, у которых accountant_id = req.user.id
    const clients = await User.findAll({
      where: {
        accountant_id: req.user.id,
        role: "user",
      },
      attributes: ["id"],
    })

    const clientIds = clients.map((c) => c.id)

    if (clientIds.length === 0) {
      return res.json({ totalDocumentsThisMonth: 0 })
    }

    // Считаем все документы по этим клиентам за текущий месяц
    const totalCount = await Document.count({
      where: {
        user_id: clientIds,
        due_date: {
          [Op.between]: [fromDate, toDate],
        },
      },
    })

    res.json({ totalDocumentsThisMonth: totalCount })
  } catch (error) {
    console.error("Error fetching monthly documents count:", error)
    res.status(500).json({ error: "שגיאה בספירת מסמכים" })
  }
})

// GET /accountants/client/:clientId/documents - Get client documents
router.get("/client/:clientId/documents", authenticateToken, requireRole(["accountant"]), async (req, res) => {
  try {
    const { page = 1, limit = 20, status, type, from_date, to_date } = req.query

    // Verify client belongs to this accountant
    const client = await User.findOne({
      where: {
        id: req.params.clientId,
        accountant_id: req.user.id,
      },
    })

    if (!client) {
      return res.status(404).json({ error: "Client not found" })
    }

    const where = { user_id: req.params.clientId }
    if (status) where.status = status
    if (type) where.type = type
    if (from_date && to_date) {
      where.created_at = {
        [Op.between]: [new Date(from_date), new Date(to_date)],
      }
    }

    const documents = await Document.findAndCountAll({
      where,
      order: [["created_at", "DESC"]],
      limit: Number.parseInt(limit),
      offset: (Number.parseInt(page) - 1) * Number.parseInt(limit),
    })

    res.json({
      success: true,
      data: documents.rows,
      pagination: {
        total: documents.count,
        page: Number.parseInt(page),
        limit: Number.parseInt(limit),
        pages: Math.ceil(documents.count / Number.parseInt(limit)),
      },
    })
  } catch (error) {
    console.error("Get client documents error:", error)
    res.status(500).json({ error: "Failed to fetch client documents" })
  }
})

// routes/document.js
router.get('/view-pdf/:id', authenticateToken, requireRole(["accountant"]), async (req, res) => {
  try {
    const document = await Document.findByPk(req.params.id)

    if (!document) {
      return res.status(404).send("Document not found")
    }

    const client = await User.findOne({
      where: {
        id: document.user_id,
        accountant_id: req.user.id,
      },
    })

    if (!client) {
      return res.status(403).send("Unauthorized")
    }

    const filePath = path.resolve(__dirname, "..", document.pdf_path)
    console.log("📄 Sending PDF from:", filePath)

    // Проверим, существует ли файл
    if (!fs.existsSync(filePath)) {
      return res.status(404).send("File not found on disk")
    }

    return res.sendFile(filePath)
  } catch (err) {
    console.error("Error sending PDF:", err)
    res.status(500).send("Internal Server Error")
  }
})

// 📦 Получить все расходы конкретного клиента (user_id)
router.get("/clients/:clientId/expenses", authenticateToken, async (req, res) => {
  try {
    const { clientId } = req.params
    const accountantId = req.user.id

    console.log("🔎 Получение расходов клиента:", { clientId, accountantId })

    // Проверяем, что у этого клиента (пользователя) действительно бухгалтер — текущий пользователь
    const client = await User.findOne({
      where: {
        id: clientId,
        accountant_id: accountantId,
        is_active: true,
      },
    })

    if (!client) {
      return res.status(403).json({
        error: "אין לך הרשאה לצפות בהוצאות של לקוח זה",
      })
    }

    // ✅ Ищем все расходы, где user_id = clientId
    const expenses = await Expense.findAll({
      where: {
        user_id: clientId,
        is_active: true,
      },
      order: [["expense_date", "DESC"]],
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "first_name", "last_name", "email"],
        },
        {
          model: Client,
          as: "client",
          attributes: ["id", "firstName", "lastName", "email", "phone"],
        },
      ],
    })

    res.json({ success: true, data: expenses })
  } catch (error) {
    console.error("❌ Ошибка при получении расходов клиента:", error)
    res.status(500).json({ error: "שגיאה בקבלת הוצאות הלקוח" })
  }
})





// // ✅ GET /accountants/me - Get current logged-in accountant profile
// router.get("/me", authenticateToken, async (req, res) => {
//   try {
//     if (req.user.role !== "accountant") {
//       return res.status(403).json({ error: "Only accountants can access this endpoint" })
//     }

//     const accountant = await Accountant.findOne({
//       where: { id: req.user.id },
//       attributes: { exclude: ["passwordHash"] },
//     })

//     if (!accountant) {
//       return res.status(404).json({ error: "Accountant not found" })
//     }

//     res.json({ success: true, data: accountant })
//   } catch (error) {
//     console.error("Get accountant profile error:", error)
//     res.status(500).json({ error: "Failed to fetch profile" })
//   }
// })

// // ✅ PATCH /accountants/me - Update accountant profile
// router.patch("/me", authenticateToken, async (req, res) => {
//   try {
//     if (req.user.role !== "accountant") {
//       return res.status(403).json({ error: "Only accountants can update profile" })
//     }

//     const accountant = await Accountant.findByPk(req.user.id)
//     if (!accountant) {
//       return res.status(404).json({ error: "Accountant not found" })
//     }

//     await accountant.update(req.body)
//     res.json({ success: true, data: accountant })
//   } catch (error) {
//     console.error("Update accountant profile error:", error)
//     res.status(500).json({ error: "Failed to update profile" })
//   }
// })

// // ✅ DELETE /accountants/me - Delete accountant account
// router.delete("/me", authenticateToken, async (req, res) => {
//   try {
//     if (req.user.role !== "accountant") {
//       return res.status(403).json({ error: "Only accountants can delete their account" })
//     }

//     const accountant = await Accountant.findByPk(req.user.id)
//     if (!accountant) {
//       return res.status(404).json({ error: "Accountant not found" })
//     }

//     await accountant.destroy()
//     res.json({ success: true, message: "Account deleted successfully" })
//   } catch (error) {
//     console.error("Delete accountant error:", error)
//     res.status(500).json({ error: "Failed to delete account" })
//   }
// })


module.exports = router

