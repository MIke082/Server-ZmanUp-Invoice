const express = require("express")
const { Document, AllocationRequest, Client, sequelize } = require("../models")
const { requireBusinessType } = require("../middleware/auth")
const { requestAllocationNumber, checkAllocationStatus } = require("../services/allocationService")
const { logAudit } = require("../utils/auditLogger")

const router = express.Router()

// POST /allocation/request - запрос Allocation Number
router.post("/request", requireBusinessType(["morsheh", "baam"]), async (req, res) => {
  const transaction = await sequelize.transaction()

  try {
    const { document_id } = req.body

    if (!document_id) {
      return res.status(400).json({ error: "Document ID is required" })
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

    // Проверяем условия для Allocation Number
    if (document.document_type !== "חשבונית מס") {
      return res.status(400).json({
        error: "Allocation number is only required for tax invoices",
      })
    }

    if (document.total_amount < 20000) {
      return res.status(400).json({
        error: "Allocation number is only required for invoices over ₪20,000",
      })
    }

    if (!document.client || document.client.client_type !== "business") {
      return res.status(400).json({
        error: "Allocation number is only required for business clients",
      })
    }

    // Проверяем, нет ли уже запроса
    const existingRequest = await AllocationRequest.findOne({
      where: { document_id: document.id },
    })

    if (existingRequest) {
      return res.status(409).json({
        error: "Allocation request already exists for this document",
        allocation_request: existingRequest,
      })
    }

    // Создаем запрос
    const allocationRequest = await AllocationRequest.create(
      {
        document_id: document.id,
        status: "pending",
        request_data: {
          business_id: req.user.business_id,
          business_name: req.user.business_name,
          client_id: document.client.business_id,
          client_name: document.client.name,
          invoice_number: document.document_number,
          invoice_date: document.issue_date,
          amount: document.total_amount,
        },
      },
      { transaction },
    )

    // Отправляем запрос в налоговую
    const allocationResult = await requestAllocationNumber(allocationRequest.request_data)

    if (allocationResult.success) {
      await allocationRequest.update(
        {
          status: "success",
          allocation_number: allocationResult.allocation_number,
          response_data: allocationResult.response_data,
          completed_at: new Date(),
        },
        { transaction },
      )

      // Помечаем документ как неизменяемый
      await document.update({ is_immutable: true }, { transaction })
    } else {
      await allocationRequest.update(
        {
          status: "failed",
          error_message: allocationResult.error,
          response_data: allocationResult.response_data,
          completed_at: new Date(),
        },
        { transaction },
      )
    }

    await transaction.commit()

    await logAudit(
      req.user.id,
      "request_allocation",
      "allocation_request",
      allocationRequest.id,
      { document_id, status: allocationRequest.status },
      req,
    )

    res.status(201).json({
      success: true,
      data: allocationRequest,
      message: allocationResult.success ? "Allocation number received successfully" : "Allocation request failed",
    })
  } catch (error) {
    await transaction.rollback()
    console.error("Allocation request error:", error)
    res.status(500).json({ error: "Failed to request allocation number" })
  }
})

// GET /allocation/status/:id - проверка статуса запроса
router.get("/status/:id", async (req, res) => {
  try {
    const allocationRequest = await AllocationRequest.findOne({
      where: { id: req.params.id },
      include: [
        {
          model: Document,
          as: "document",
          where: { user_id: req.user.id },
        },
      ],
    })

    if (!allocationRequest) {
      return res.status(404).json({ error: "Allocation request not found" })
    }

    // Если статус pending, проверяем в налоговой
    if (allocationRequest.status === "pending") {
      const statusResult = await checkAllocationStatus(allocationRequest.id)

      if (statusResult.completed) {
        await allocationRequest.update({
          status: statusResult.success ? "success" : "failed",
          allocation_number: statusResult.allocation_number,
          error_message: statusResult.error,
          response_data: statusResult.response_data,
          completed_at: new Date(),
        })

        if (statusResult.success) {
          await allocationRequest.document.update({ is_immutable: true })
        }
      }
    }

    res.json({
      success: true,
      data: allocationRequest,
    })
  } catch (error) {
    console.error("Check allocation status error:", error)
    res.status(500).json({ error: "Failed to check allocation status" })
  }
})

// GET /allocation/history - история запросов
router.get("/history", async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query

    const where = {}
    if (status) where.status = status

    const allocationRequests = await AllocationRequest.findAndCountAll({
      where,
      include: [
        {
          model: Document,
          as: "document",
          where: { user_id: req.user.id },
          include: [
            {
              model: Client,
              as: "client",
              attributes: ["name"],
            },
          ],
        },
      ],
      order: [["created_at", "DESC"]],
      limit: Number.parseInt(limit),
      offset: (Number.parseInt(page) - 1) * Number.parseInt(limit),
    })

    res.json({
      success: true,
      data: allocationRequests.rows,
      pagination: {
        total: allocationRequests.count,
        page: Number.parseInt(page),
        limit: Number.parseInt(limit),
        pages: Math.ceil(allocationRequests.count / Number.parseInt(limit)),
      },
    })
  } catch (error) {
    console.error("Allocation history error:", error)
    res.status(500).json({ error: "Failed to fetch allocation history" })
  }
})

module.exports = router
