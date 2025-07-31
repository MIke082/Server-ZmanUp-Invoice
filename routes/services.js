const express = require("express")
const { Service, DocumentItem, Document, sequelize } = require("../models")
const { Op } = require("sequelize")

const router = express.Router()

// GET /services
// router.get("/", async (req, res) => {
//   try {
//     const { page = 1, limit = 20, category, search, is_active = true } = req.query

//     const where = { user_id: req.user.id }

//     if (category) where.category = category
//     if (is_active !== undefined) where.is_active = is_active === "true"
//     if (search) {
//       where[Op.or] = [{ name: { [Op.like]: `%${search}%` } }, { description: { [Op.like]: `%${search}%` } }]
//     }

//     const services = await Service.findAndCountAll({
//       where,
//       order: [["name", "ASC"]],
//       limit: Number.parseInt(limit),
//       offset: (Number.parseInt(page) - 1) * Number.parseInt(limit),
//     })

//     res.json({
//       success: true,
//       data: services.rows,
//       pagination: {
//         total: services.count,
//         page: Number.parseInt(page),
//         limit: Number.parseInt(limit),
//         pages: Math.ceil(services.count / Number.parseInt(limit)),
//       },
//     })
//   } catch (error) {
//     console.error("Get services error:", error)
//     res.status(500).json({ error: "Failed to fetch services" })
//   }
// })

// GET /services
router.get("/", async (req, res) => {
  try {
    const userId = req.user.id

    // console.log("🔍 Получаем все сервисы для user_id:", userId)

    const services = await Service.findAll({
      where: { user_id: userId, is_active: true },
      order: [["name", "ASC"]],
    })

    res.json(services)
  } catch (error) {
    console.error("❌ Ошибка при получении сервисов:", error)
    res.status(500).json({ error: "שגיאה בקבלת השירותים" })
  }
})


// POST /services
router.post("/", async (req, res) => {
  try {
    const { name, description, price, currency = "NIS", category } = req.body

    if (!name) {
      return res.status(400).json({ error: "Service name is required" })
    }

    if (!price || price < 0) {
      return res.status(400).json({ error: "Valid price is required" })
    }

    const service = await Service.create({
      user_id: req.user.id,
      name,
      description: description || null,
      price: Number.parseFloat(price),
      currency,
      category: category || null,
    })

    console.log("✅ Service created:", service.toJSON()) // <--- ДОБАВЬ ЭТО

    res.status(201).json({
      success: true,
      data: service,
      message: "Service created successfully",
    })
  } catch (error) {
    console.error("Create service error:", error)
    res.status(500).json({ error: "Failed to create service" })
  }
})

// PUT /services/:id
router.put("/:id", async (req, res) => {
  try {
    const { name, description, price, currency, category, is_active, unit, notes } = req.body

    const service = await Service.findOne({
      where: {
        id: req.params.id,
        user_id: req.user.id,
      },
    })

    if (!service) {
      return res.status(404).json({ error: "Service not found" })
    }

    // Check if new name conflicts with existing service
    if (name && name.trim() !== service.name) {
      const existingService = await Service.findOne({
        where: {
          user_id: req.user.id,
          name: name.trim(),
          is_active: true,
          id: { [Op.ne]: req.params.id },
        },
      })

      if (existingService) {
        return res.status(400).json({ error: "Service with this name already exists" })
      }
    }

    // Update only provided fields
    const updateData = {}
    if (name !== undefined) updateData.name = name.trim()
    if (description !== undefined) updateData.description = description?.trim() || null
    if (unit !== undefined) updateData.unit = unit?.trim() || null
    if (notes !== undefined) updateData.notes = notes?.trim() || null
    if (price !== undefined) {
      if (price < 0) {
        return res.status(400).json({ error: "Price cannot be negative" })
      }
      updateData.price = Number.parseFloat(price)
    }
    if (currency !== undefined) updateData.currency = currency
    if (category !== undefined) updateData.category = category?.trim() || null
    if (is_active !== undefined) updateData.is_active = is_active

    await service.update(updateData)

    res.json({
      success: true,
      data: service,
      message: "Service updated successfully",
    })
  } catch (error) {
    console.error("Update service error:", error)
    res.status(500).json({ error: "Failed to update service" })
  }
})

// DELETE /services/:id (soft delete)
router.delete("/:id", async (req, res) => {
  try {
    const service = await Service.findOne({
      where: {
        id: req.params.id,
        user_id: req.user.id,
      },
    })

    if (!service) {
      return res.status(404).json({ error: "Service not found" })
    }

    // Check if service is used in any active documents
    const activeDocumentItems = await DocumentItem.findOne({
      where: { service_id: req.params.id },
      include: [
        {
          model: Document,
          as: "document",
          where: {
            status: { [Op.in]: ["draft", "sent", "pending"] },
          },
        },
      ],
    })

    if (activeDocumentItems) {
      return res.status(400).json({
        error:
          "Cannot delete service that is used in active documents. Please complete or cancel those documents first.",
      })
    }

    // Soft delete - mark as inactive
    await service.update({ is_active: false })

    res.json({
      success: true,
      message: "Service deleted successfully",
    })
  } catch (error) {
    console.error("Delete service error:", error)
    res.status(500).json({ error: "Failed to delete service" })
  }
})

module.exports = router
