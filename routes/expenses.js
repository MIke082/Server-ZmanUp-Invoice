const express = require("express")
const multer = require("multer")
const path = require("path")
const fs = require("fs") // ← исправлено
const { Op } = require("sequelize")
const { Expense, User, Client, sequelize } = require("../models")
const { authenticateToken } = require("../middleware/auth")
const { logAudit } = require("../utils/auditLogger")

const router = express.Router()

// ✅ Создаёт директорию, если её нет
const ensureDirectoryExists = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const userId = req.user?.id || "unknown_user" // На случай если токен не подставлен
    const dateFolder = new Date().toISOString().split("T")[0] // YYYY-MM-DD
    const uploadPath = path.join(__dirname, "..", "uploads", "expenses", String(userId), dateFolder)

    ensureDirectoryExists(uploadPath)
    cb(null, uploadPath)
  },

  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname)
    const base = path.basename(file.originalname, ext)
    const timestamp = Date.now()
    cb(null, `${base}-${timestamp}${ext}`)
  },
})

const upload = multer({ storage })

router.post("/upload/:expenseId", upload.single("receipt"), async (req, res) => {
  console.log("req.file:", req.file)
  if (!req.file) {
    return res.status(400).json({ error: "Файл не загружен" })
  }

  const userId = req.user?.id
  const dateFolder = new Date().toISOString().split("T")[0]

  const filePath = `/uploads/expenses/${userId}/${dateFolder}/${req.file.filename}`
  return res.status(200).json({ file_path: filePath })
})

router.put("/:id/update-image-path", authenticateToken, async (req, res) => {
  try {
    const { image_path } = req.body
    const { id } = req.params

    const expense = await Expense.findByPk(id)
    if (!expense) {
      return res.status(404).json({ error: "Расход не найден" })
    }

    expense.image_path = image_path
    await expense.save()

    res.status(200).json({ success: true, expense })
  } catch (error) {
    console.error("Ошибка обновления image_path:", error)
    res.status(500).json({ error: "Ошибка при сохранении image_path" })
  }
})

router.get("/:id/download", authenticateToken, async (req, res) => {
  try {
    const expense = await Expense.findOne({
      where: {
        id: req.params.id,
        user_id: req.user.id,
        is_active: true,
      },
    })

    if (!expense || !expense.image_path) {
      return res.status(404).json({ error: "הקובץ לא נמצא" })
    }

    const filePath = path.join(__dirname, "..", expense.image_path)
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "הקובץ לא קיים בשרת" })
    }

    res.download(filePath)
  } catch (error) {
    console.error("Download error:", error)
    res.status(500).json({ error: "שגיאה בהורדת קובץ" })
  }
})

// GET /expenses - Get all expenses with filters
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      dateFrom,
      dateTo,
      clientId,
      search,
      sortBy = "expense_date",
      sortOrder = "DESC",
    } = req.query

    const offset = (page - 1) * limit
    const whereClause = {
      user_id: req.user.id,
      is_active: true,
    }

    // Filters
    if (category) {
      whereClause.category = category
    }

    if (dateFrom || dateTo) {
      whereClause.expense_date = {}
      if (dateFrom) whereClause.expense_date[Op.gte] = dateFrom
      if (dateTo) whereClause.expense_date[Op.lte] = dateTo
    }

    if (clientId) {
      whereClause.client_id = clientId
    }

    if (search) {
      whereClause[Op.or] = [
        { description: { [Op.iLike]: `%${search}%` } },
        { vendor_name: { [Op.iLike]: `%${search}%` } },
        { receipt_number: { [Op.iLike]: `%${search}%` } },
      ]
    }

    const { count, rows } = await Expense.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Client,
          as: "client",
          attributes: ["id", "firstName", "lastName"],
        },
      ],
      order: [[sortBy, sortOrder.toUpperCase()]],
      limit: Number.parseInt(limit),
      offset: Number.parseInt(offset),
    })

    // Calculate totals
    const totalAmount = await Expense.sum("amount", {
      where: whereClause,
    })

    const categoryTotals = await Expense.findAll({
      where: whereClause,
      attributes: [
        "category",
        [sequelize.fn("SUM", sequelize.col("amount")), "total"],
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      group: ["category"],
      raw: true,
    })

    res.json({
      success: true,
      data: {
        expenses: rows,
        pagination: {
          page: Number.parseInt(page),
          limit: Number.parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit),
        },
        summary: {
          totalAmount: totalAmount || 0,
          totalCount: count,
          categoryTotals,
        },
      },
    })
  } catch (error) {
    console.error("Error fetching expenses:", error)
    res.status(500).json({ error: "Failed to fetch expenses" })
  }
})

// POST /expenses - Create new expense
router.post("/", upload.single("receipt"), async (req, res) => {
  try {
    const {
      amount,
      category,
      description,
      expense_date,
      client_id,
      vendor_name,
      receipt_number,
      is_business_expense,
      tax_deductible,
      notes,
    } = req.body


    // 🔒 Валидация
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Valid amount is required" })
    }

    if (!category) {
      return res.status(400).json({ error: "Category is required" })
    }

    // 🔍 Проверка клиента (если указан)
    if (client_id) {
      const client = await Client.findOne({
        where: { id: client_id, user_id: req.user.id, is_active: true },
      })
      if (!client) {
        return res.status(400).json({ error: "Invalid client" })
      }
    }

    // 📸 Подготовка пути к изображению (если есть)
    const imagePath = req.file
      ? req.file.path.replace(/\\/g, "/").replace(/^.*?\/uploads\//, "uploads/")
      : null


    // 💾 Создание записи
    const expenseData = {
      user_id: req.user.id,
      amount: Number.parseFloat(amount),
      category,
      description,
      expense_date: expense_date || new Date().toISOString().split("T")[0],
      client_id: client_id || null,
      vendor_name,
      receipt_number,
      is_business_expense: is_business_expense !== "false",
      tax_deductible: tax_deductible !== "false",
      notes,
      image_path: imagePath,
    }

    const expense = await Expense.create(expenseData)

    // 📎 Загрузка ассоциаций
    const createdExpense = await Expense.findByPk(expense.id, {
      include: [
        {
          model: Client,
          as: "client",
          attributes: ["id", "firstName", "lastName"],
        },
      ],
    })

    // 📘 Аудит
    await logAudit(
      req.user.id,
      "expense_created",
      "Expense",
      expense.id,
      { amount: expense.amount, category: expense.category },
      req
    )

    console.log("✅ Expense created by user:", req.user.id)

    res.status(201).json({
      success: true,
      data: createdExpense,
      message: "Expense created successfully",
    })
  } catch (error) {
    console.error("Error creating expense:", error)
    res.status(500).json({ error: "Failed to create expense" })
  }
})

// GET /expenses/:id - Get expense by ID
router.get("/:id", async (req, res) => {
  try {
    const expense = await Expense.findOne({
      where: {
        id: req.params.id,
        user_id: req.user.id,
        is_active: true,
      },
      include: [
        {
          model: Client,
          as: "client",
          attributes: ["id", "firstName", "lastName"],
        },
      ],
    })

    if (!expense) {
      return res.status(404).json({ error: "Expense not found" })
    }

    res.json({
      success: true,
      data: expense,
    })
  } catch (error) {
    console.error("Error fetching expense:", error)
    res.status(500).json({ error: "Failed to fetch expense" })
  }
})

// PUT /expenses/:id - Update expense
router.put("/:id", upload.single("receipt"), async (req, res) => {
  try {
    const expense = await Expense.findOne({
      where: {
        id: req.params.id,
        user_id: req.user.id,
        is_active: true,
      },
    })

    if (!expense) {
      return res.status(404).json({ error: "Expense not found" })
    }

    const {
      amount,
      category,
      description,
      expense_date,
      client_id,
      vendor_name,
      receipt_number,
      is_business_expense,
      tax_deductible,
      notes,
    } = req.body

    // Verify client belongs to user if provided
    if (client_id) {
      const client = await Client.findOne({
        where: { id: client_id, user_id: req.user.id, is_active: true },
      })
      if (!client) {
        return res.status(400).json({ error: "Invalid client" })
      }
    }

    const updateData = {}
    if (amount !== undefined) updateData.amount = Number.parseFloat(amount)
    if (category !== undefined) updateData.category = category
    if (description !== undefined) updateData.description = description
    if (expense_date !== undefined) updateData.expense_date = expense_date
    if (client_id !== undefined) updateData.client_id = client_id || null
    if (vendor_name !== undefined) updateData.vendor_name = vendor_name
    if (receipt_number !== undefined) updateData.receipt_number = receipt_number
    if (is_business_expense !== undefined) updateData.is_business_expense = is_business_expense !== "false"
    if (tax_deductible !== undefined) updateData.tax_deductible = tax_deductible !== "false"
    if (notes !== undefined) updateData.notes = notes

    // Handle new receipt image
    if (req.file) {
      // Delete old image if exists
      if (expense.image_path) {
        try {
          await fs.unlink(expense.image_path)
        } catch (error) {
          console.warn("Could not delete old receipt image:", error.message)
        }
      }
      updateData.image_path = req.file.path.replace(/\\/g, "/")
    }

    await expense.update(updateData)

    // Load updated expense with associations
    const updatedExpense = await Expense.findByPk(expense.id, {
      include: [
        {
          model: Client,
          as: "client",
          attributes: ["id", "firstName", "lastName"],
        },
      ],
    })

    // Audit log
    await auditLogger.log(req.user.id, "expense_updated", {
      expenseId: expense.id,
      changes: updateData,
    })

    res.json({
      success: true,
      data: updatedExpense,
      message: "Expense updated successfully",
    })
  } catch (error) {
    console.error("Error updating expense:", error)
    res.status(500).json({ error: "Failed to update expense" })
  }
})

// DELETE /expenses/:id - Soft delete expense
router.delete("/:id", async (req, res) => {
  try {

    const expense = await Expense.findOne({
      where: {
        id: req.params.id,
        user_id: req.user.id,
        is_active: true,
      },
    })

    if (!expense) {
      return res.status(404).json({ error: "Expense not found" })
    }

    await expense.update({ is_active: false })

    // Audit log
    await auditLogger.log(req.user.id, "expense_deleted", {
      expenseId: expense.id,
      amount: expense.amount,
    })

    res.json({
      success: true,
      message: "Expense deleted successfully",
    })
  } catch (error) {
    console.error("Error deleting expense:", error)
    res.status(500).json({ error: "Failed to delete expense" })
  }
})

// GET /expenses/stats/summary - Get expense statistics
router.get("/stats/summary", async (req, res) => {
  try {
    const { year, month } = req.query
    const currentYear = year || new Date().getFullYear()
    const currentMonth = month || new Date().getMonth() + 1

    const whereClause = {
      user_id: req.user.id,
      is_active: true,
    }

    // Monthly stats
    const monthlyWhere = {
      ...whereClause,
      expense_date: {
        [Op.gte]: `${currentYear}-${currentMonth.toString().padStart(2, "0")}-01`,
        [Op.lt]:
          month === 12
            ? `${Number.parseInt(currentYear) + 1}-01-01`
            : `${currentYear}-${(Number.parseInt(currentMonth) + 1).toString().padStart(2, "0")}-01`,
      },
    }

    // Yearly stats
    const yearlyWhere = {
      ...whereClause,
      expense_date: {
        [Op.gte]: `${currentYear}-01-01`,
        [Op.lt]: `${Number.parseInt(currentYear) + 1}-01-01`,
      },
    }

    const [monthlyTotal, yearlyTotal, categoryBreakdown, recentExpenses] = await Promise.all([
      Expense.sum("amount", { where: monthlyWhere }),
      Expense.sum("amount", { where: yearlyWhere }),
      Expense.findAll({
        where: yearlyWhere,
        attributes: [
          "category",
          [sequelize.fn("SUM", sequelize.col("amount")), "total"],
          [sequelize.fn("COUNT", sequelize.col("id")), "count"],
        ],
        group: ["category"],
        raw: true,
      }),
      Expense.findAll({
        where: whereClause,
        include: [
          {
            model: Client,
            as: "client",
            attributes: ["firstName", "lastName"],
          },
        ],
        order: [["created_at", "DESC"]],
        limit: 5,
      }),
    ])

    res.json({
      success: true,
      data: {
        monthlyTotal: monthlyTotal || 0,
        yearlyTotal: yearlyTotal || 0,
        categoryBreakdown: categoryBreakdown || [],
        recentExpenses: recentExpenses || [],
        period: {
          year: currentYear,
          month: currentMonth,
        },
      },
    })
  } catch (error) {
    console.error("Error fetching expense stats:", error)
    res.status(500).json({ error: "Failed to fetch expense statistics" })
  }
})

// GET /expenses/export/csv - Export expenses to CSV
router.get("/export/csv", async (req, res) => {
  try {
    const { dateFrom, dateTo, category } = req.query

    const whereClause = {
      user_id: req.user.id,
      is_active: true,
    }

    if (dateFrom || dateTo) {
      whereClause.expense_date = {}
      if (dateFrom) whereClause.expense_date[Op.gte] = dateFrom
      if (dateTo) whereClause.expense_date[Op.lte] = dateTo
    }

    if (category) {
      whereClause.category = category
    }

    const expenses = await Expense.findAll({
      where: whereClause,
      include: [
        {
          model: Client,
          as: "client",
          attributes: ["firstName", "lastName"],
        },
      ],
      order: [["expense_date", "DESC"]],
    })

    // Generate CSV
    const csvHeader = [
      "Date",
      "Amount",
      "Category",
      "Description",
      "Vendor",
      "Receipt Number",
      "Client",
      "Business Expense",
      "Tax Deductible",
      "Image Path",
      "Notes",
    ].join(",")

    const csvRows = expenses.map((expense) =>
      [
        expense.expense_date,
        expense.amount,
        expense.category,
        `"${expense.description || ""}"`,
        `"${expense.vendor_name || ""}"`,
        expense.receipt_number || "",
        `"${expense.client ? expense.client.company_name || `${expense.client.firstName} ${expense.client.lastName}` : ""}"`,
        expense.is_business_expense ? "Yes" : "No",
        expense.tax_deductible ? "Yes" : "No",
        expense.image_path || "",
        `"${expense.notes || ""}"`,
      ].join(","),
    )

    const csvContent = [csvHeader, ...csvRows].join("\n")

    res.setHeader("Content-Type", "text/csv; charset=utf-8")
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="expenses_${new Date().toISOString().split("T")[0]}.csv"`,
    )
    res.send(csvContent)
  } catch (error) {
    console.error("Error exporting expenses:", error)
    res.status(500).json({ error: "Failed to export expenses" })
  }
})



module.exports = router
