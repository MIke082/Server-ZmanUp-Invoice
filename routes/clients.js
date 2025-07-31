const express = require("express")
const { Client, Document, sequelize } = require("../models")
const { Op } = require("sequelize")

const router = express.Router()

// GET /clients
//Здесь есть пагинация и показывает по 20 клиентов 
// router.get("/", async (req, res) => {
//   try {
//     console.log("🔍 Получаем клиентов для user_id:", req.user.id)

//     const { page = 1, limit = 20 } = req.query

//     const clients = await Client.findAndCountAll({
//       where: {
//         user_id: req.user.id,
//       },
//       order: [["first_name", "ASC"], ["last_name", "ASC"]],
//       limit: Number.parseInt(limit),
//       offset: (Number.parseInt(page) - 1) * Number.parseInt(limit),
//     })

//     res.json({
//       success: true,
//       data: clients.rows,
//       pagination: {
//         total: clients.count,
//         page: Number.parseInt(page),
//         limit: Number.parseInt(limit),
//         pages: Math.ceil(clients.count / Number.parseInt(limit)),
//       },
//     })
//   } catch (error) {
//     console.error("❌ Get clients error:", error)
//     res.status(500).json({ error: "Failed to fetch clients" })
//   }
// })

router.get("/", async (req, res) => {
  try {
    console.log("🔍 Получаем клиентов для user_id:", req.user.id)

    const clients = await Client.findAll({
      where: {
        user_id: req.user.id,
      },
      order: [["first_name", "ASC"], ["last_name", "ASC"]],
    })

    res.json({
      success: true,
      data: clients,
    })
  } catch (error) {
    console.error("❌ Get clients error:", error)
    res.status(500).json({ error: "Failed to fetch clients" })
  }
})

// POST /clients
router.post("/", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      business_id,
      business_name, // ✅ добавлено
      phone,
      email,
      address,
      client_type = "individual",
      notes,
      city,
      zipCode,
    } = req.body

    if (!firstName) {
      return res.status(400).json({ error: "First name is required" })
    }

    if (!["individual", "business"].includes(client_type)) {
      return res.status(400).json({ error: "Invalid client type" })
    }

    const client = await Client.create({
      user_id: req.user.id,
      firstName,
      lastName: lastName || null,
      business_id: business_id || null,
      business_name: business_name || null, // ✅ добавлено
      phone: phone || null,
      email: email || null,
      address: address || null,
      city: city || null,
      zipCode: zipCode || null,
      client_type,
      notes: notes || null,
    })

    res.status(201).json({
      success: true,
      data: client,
      message: "Client created successfully",
    })
  } catch (error) {
    console.error("Create client error:", error)
    res.status(500).json({ error: "Failed to create client" })
  }
})


// PUT /clients/:id - обновить клиента
router.put("/:id", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      business_id,
      business_name, // ✅ добавлено
      phone,
      email,
      address,
      city,
      zipCode,
      client_type,
      notes,
      is_active,
    } = req.body

    const client = await Client.findOne({
      where: {
        id: req.params.id,
        user_id: req.user.id,
      },
    })

    if (!client) {
      return res.status(404).json({ error: "Client not found" })
    }

    // Проверка уникальности business_id
    if (business_id && business_id !== client.business_id) {
      const existingClient = await Client.findOne({
        where: {
          business_id,
          user_id: req.user.id,
          id: { [Op.ne]: req.params.id },
          is_active: true,
        },
      })

      if (existingClient) {
        return res.status(400).json({ error: "Client with this business ID already exists" })
      }
    }

    // Обновление переданных полей
    const updateData = {}
    if (firstName !== undefined) updateData.firstName = firstName
    if (lastName !== undefined) updateData.lastName = lastName
    if (business_id !== undefined) updateData.business_id = business_id
    if (business_name !== undefined) updateData.business_name = business_name // ✅ добавлено
    if (phone !== undefined) updateData.phone = phone
    if (email !== undefined) updateData.email = email
    if (address !== undefined) updateData.address = address
    if (city !== undefined) updateData.city = city
    if (zipCode !== undefined) updateData.zipCode = zipCode
    if (client_type !== undefined) updateData.client_type = client_type
    if (notes !== undefined) updateData.notes = notes
    if (is_active !== undefined) updateData.is_active = is_active

    await client.update(updateData)

    res.json({
      success: true,
      data: client,
      message: "Client updated successfully",
    })
  } catch (error) {
    console.error("Update client error:", error)
    res.status(500).json({ error: "Failed to update client" })
  }
})

// DELETE /clients/:id - удалить клиента (мягкое удаление)
router.delete("/:id", async (req, res) => {

  try {
    const client = await Client.findOne({
      where: {
        id: req.params.id,
        user_id: req.user.id,
      },
    })

    if (!client) {
      return res.status(404).json({ error: "Client not found" })
    }

    // Проверяем есть ли активные документы у клиента
    const activeDocuments = await Document.count({
      where: {
        client_id: req.params.id,
        status: { [Op.in]: ["draft", "sent", "pending"] },
      },
    })

    if (activeDocuments > 0) {
      return res.status(400).json({
        error: "Cannot delete client with active documents. Please complete or cancel all documents first.",
      })
    }

    // Мягкое удаление - помечаем как неактивный
    await client.destroy()

    res.json({
      success: true,
      message: "Client deleted successfully",
    })
  } catch (error) {
    console.error("Delete client error:", error)
    res.status(500).json({ error: "Failed to delete client" })
  }
})

// GET /clients/:id/documents - получить все документы клиента
router.get("/:id/documents", async (req, res) => {
  try {
    const { page = 1, limit = 20, status, type } = req.query

    // Проверяем что клиент принадлежит пользователю
    const client = await Client.findOne({
      where: {
        id: req.params.id,
        user_id: req.user.id,
      },
    })

    if (!client) {
      return res.status(404).json({ error: "Client not found" })
    }

    const where = { client_id: req.params.id }
    if (status) where.status = status
    if (type) where.type = type

    const documents = await Document.findAndCountAll({
      where,
      order: [["created_at", "DESC"]],
      limit: Number.parseInt(limit),
      offset: (Number.parseInt(page) - 1) * Number.parseInt(limit),
      attributes: ["id", "document_number", "type", "status", "total_amount", "created_at", "due_date"],
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
module.exports = router

