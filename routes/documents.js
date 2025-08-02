const express = require("express")
const { Document, DocumentItem, Client, Service, sequelize, User } = require("../models")
const { Op } = require("sequelize")
const { generatePDF } = require("../services/pdfService")
const { sendEmail } = require("../services/notificationService")
const dayjs = require("dayjs")
const path = require("path")
const fs = require("fs")
const archiver = require("archiver")

const router = express.Router()

//получаем все документы
router.get("/stats", async (req, res) => {
  const thisMonthStart = dayjs().startOf("month").toISOString()
  const thisMonthEnd = dayjs().endOf("month").toISOString()

  try {
    const count = await Document.count({
      where: {
        user_id: req.user.id,
        due_date: {
          [Op.between]: [thisMonthStart, thisMonthEnd],
        },
      },
    })

    console.log("📊 Returning stats:", { count }) // <--- добавь это

    return res.json({ success: true, currentMonthTransactionsCount: count })
  } catch (error) {
    console.error("❌ Error in /stats", error)
    return res.status(500).json({ error: error.message })
  }
})

// GET /documents
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 1500, status, document_type, client_id, year, search, type } = req.query

    const where = { user_id: req.user.id }

    if (status) where.status = status
    if (document_type) where.document_type = document_type
    if (type) where.document_type = type // ← добавили поддержку type
    if (client_id) where.client_id = client_id
    if (year) {
      where.due_date = {
        [Op.between]: [`${year}-01-01`, `${year}-12-31`],
      }
    }
    if (search) {
      where[Op.or] = [{ document_number: { [Op.like]: `%${search}%` } }, { notes: { [Op.like]: `%${search}%` } }]
    }

    const documents = await Document.findAndCountAll({
      where,
      // include: [
      //   {
      //     model: Client,
      //     as: "client",
      //     attributes: ["id", "name", "client_type"],
      //   },
      // ],
      order: [["due_date", "DESC"]],
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
    console.error("Get documents error:", error)
    res.status(500).json({ error: "Failed to fetch documents" })
  }
})

// GET /documents/:id
router.get("/:id", async (req, res) => {
  try {
    const document = await Document.findOne({
      where: {
        id: req.params.id,
        user_id: req.user.id,
      },
      include: [
        {
          model: Client,
          as: "client",
        },
        {
          model: DocumentItem,
          as: "items",
          order: [["sort_order", "ASC"]],
        },
        {
          model: Document,
          as: "cancellations", // 👈 обязателен alias
          attributes: ["id", "total_amount", "document_type", "status", "original_document_id"],
        },
      ],
    })

    if (!document) {
      return res.status(404).json({ error: "Document not found" })
    }

    res.json({
      success: true,
      data: document,
    })
  } catch (error) {
    console.error("Get document error:", error)
    res.status(500).json({ error: "Failed to fetch document" })
  }
})

// POST /documents — создание документа или зикуя
// router.post("/", async (req, res) => {
//   const transaction = await sequelize.transaction()

//   try {
//     const {
//       client_id,
//       document_type,
//       due_date,
//       items = [],
//       notes,
//       currency = "NIS",
//       original_document_id,
//       reason,
//       total_amount, // ← получаем от клиента (частичный зикуй)
//       payment_method,

//     } = req.body

//     const typeMap = {
//       quote: "הצעת מחיר",
//       work_order: "הזמנת עבודה",
//       deal_invoice: "חשבונית עסקה",
//       receipt: "קבלה",
//       tax_invoice: "חשבונית מס",
//       credit: "זיכוי",
//       invoice: "חשבונית מס",
//       transaction: "עסקה"
//     }

//     const mappedType = typeMap[document_type] || document_type
//     const allowedTypes = Object.values(typeMap)

//     if (!mappedType || !allowedTypes.includes(mappedType)) {
//       return res.status(400).json({ error: "Invalid document type" })
//     }

//     let sourceItems = items
//     let subtotal = 0
//     let vatRate = req.user.business_type === "patur" ? 0 : 0.18
//     let vatAmount = 0
//     let computedTotal = 0
//     let origDocument = null

//     if (mappedType === "זיכוי" && original_document_id) {
//       origDocument = await Document.findOne({
//         where: { id: original_document_id },
//         include: [
//           { model: DocumentItem, as: "items" },
//           { model: Client, as: "client" },
//           { model: Document, as: "cancellations" },
//           { model: Document, as: "originalDocument" },
//         ],
//       })

//       if (!origDocument) return res.status(404).json({ error: "Original document not found" })

//       const isPartial = total_amount !== undefined

//       if (isPartial) {
//         const parsedAmount = parseFloat(total_amount)

//         sourceItems = [{
//           description: `זיכוי: ${reason || "סכום חלקי"}`,
//           quantity: -1,
//           unit_price: parsedAmount,
//         }]
//         subtotal = -parsedAmount
//         vatAmount = 0
//         computedTotal = subtotal
//       } else {
//         sourceItems = origDocument.items.map((item) => ({
//           description: `זיכוי: ${item.description}`,
//           quantity: -item.quantity,
//           unit_price: item.unit_price,
//         }))
//         subtotal = sourceItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
//         vatAmount = subtotal * vatRate
//         computedTotal = subtotal + vatAmount
//       }

//     } else {
//       if (items.length === 0) return res.status(400).json({ error: "Document must have at least one item" })

//       subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
//       vatAmount = subtotal * vatRate
//       computedTotal = subtotal + vatAmount
//     }

//     const lastDoc = await Document.findOne({
//       where: { user_id: req.user.id },
//       order: [["created_at", "DESC"]],
//       transaction,
//     })

//     let nextNumber = "10001"

//     if (lastDoc?.document_number) {
//       nextNumber = String(parseInt(lastDoc.document_number) + 1).padStart(5, "0")
//     } else if (req.user.start_receipt_number) {
//       nextNumber = String(parseInt(req.user.start_receipt_number)).padStart(5, "0")
//     }

//     const initialStatus = mappedType === "קבלה" || mappedType === "זיכוי" ? "paid" : "draft"

//     const document = await Document.create(
//       {
//         user_id: req.user.id,
//         client_id: client_id || origDocument?.client_id || null,
//         document_number: nextNumber,
//         document_type: mappedType,
//         due_date: due_date ? new Date(due_date) : new Date(),
//         issue_date: new Date(),
//         subtotal,
//         vat_rate: vatRate,
//         vat_amount: vatAmount,
//         total_amount: computedTotal,
//         currency,
//         notes: reason || notes || null,
//         payment_method,
//         is_immutable: false,
//         metadata: {},
//         status: initialStatus,
//         original_document_id: mappedType === "זיכוי" ? original_document_id : null,
//       },
//       { transaction }
//     )

//     for (let i = 0; i < sourceItems.length; i++) {
//       const item = sourceItems[i]

//       await DocumentItem.create(
//         {
//           document_id: document.id,
//           service_id: item.service_id || null, // добавим поле service_id
//           description: item.description,
//           quantity: parseFloat(item.quantity),
//           unit_price: parseFloat(item.unit_price),
//           total_price: parseFloat(item.quantity) * parseFloat(item.unit_price),
//           sort_order: i + 1,
//         },
//         { transaction }
//       )
//     }

//     // Обновим start_receipt_number у пользователя, если текущий номер больше
//     const docNumberAsInt = parseInt(nextNumber)

//     if (!req.user.start_receipt_number || docNumberAsInt > req.user.start_receipt_number) {
//       await User.update(
//         { start_receipt_number: docNumberAsInt },
//         { where: { id: req.user.id }, transaction }
//       )
//     }

//     if (mappedType === "זיכוי" && origDocument) {
//       const isPartial = total_amount !== undefined

//       if (!isPartial) {
//         origDocument.setDataValue("status", "cancelled")
//         await origDocument.save({ transaction })
//       }
//     }

//     const fullDoc = await Document.findByPk(document.id, {
//       include: [
//         { model: DocumentItem, as: "items", order: [["sort_order", "ASC"]] },
//         { model: Client, as: "client" },
//       ],
//       transaction, // это важно, чтобы PDF генерировался с теми же данными
//     })

//     let pdfPath = null
//     try {
//       pdfPath = await generatePDF(fullDoc, req.user)
//       await Document.update({ pdf_path: pdfPath }, {
//         where: { id: document.id },
//         transaction,
//       })
//     } catch (error) {
//       if (!transaction.finished) await transaction.rollback()
//       console.error("❌ Create document error:", error)
//       res.status(500).json({ error: error.message || "Failed to create document" }) // ← обязательно error.message!
//     }


//     await transaction.commit()

//     // await transaction.commit()

//     // const fullDoc = await Document.findByPk(document.id, {
//     //   include: [
//     //     { model: DocumentItem, as: "items", order: [["sort_order", "ASC"]] },
//     //     { model: Client, as: "client" },
//     //   ],
//     // })

//     // let pdfPath = null
//     // try {
//     //   pdfPath = await generatePDF(fullDoc, req.user)
//     //   await Document.update({ pdf_path: pdfPath }, { where: { id: document.id } })
//     // } catch (pdfError) {
//     //   console.error("❌ PDF generation failed:", pdfError)
//     // }

//     res.status(201).json({
//       success: true,
//       data: { ...fullDoc.toJSON(), pdf_path: pdfPath },
//       message: "Document created and PDF generated successfully",
//     })
//   } catch (error) {
//     if (!transaction.finished) await transaction.rollback()
//     console.error("❌ Create document error:", error)
//     res.status(500).json({ error: "Failed to create document" })
//   }
// })

// новый код
router.post("/", async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const {
      client_id,
      document_type,
      due_date,
      items = [],
      notes,
      currency = "NIS",
      original_document_id,
      reason,
      total_amount,
      payment_method,
    } = req.body;

    const typeMap = {
      quote: "הצעת מחיר",
      work_order: "הזמנת עבודה",
      deal_invoice: "חשבונית עסקה",
      receipt: "קבלה",
      tax_invoice: "חשבונית מס",
      credit: "זיכוי",
      invoice: "חשבונית מס",
      transaction: "עסקה",
    };

    const mappedType = typeMap[document_type] || document_type;
    const allowedTypes = Object.values(typeMap);

    if (!mappedType || !allowedTypes.includes(mappedType)) {
      await transaction.rollback();
      return res.status(400).json({ error: "סוג מסמך לא חוקי" });
    }

    let sourceItems = items;
    let subtotal = 0;
    let vatRate = req.user.business_type === "patur" ? 0 : 0.18;
    let vatAmount = 0;
    let computedTotal = 0;
    let origDocument = null;

    if (mappedType === "זיכוי" && original_document_id) {
      origDocument = await Document.findOne({
        where: { id: original_document_id },
        include: [
          { model: DocumentItem, as: "items" },
          { model: Client, as: "client" },
          { model: Document, as: "cancellations" },
          { model: Document, as: "originalDocument" },
        ],
        transaction,
      });

      if (!origDocument) {
        await transaction.rollback();
        return res.status(404).json({ error: "מסמך מקורי לא נמצא" });
      }

      const isPartial = total_amount !== undefined;

      if (isPartial) {
        const parsedAmount = parseFloat(total_amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
          await transaction.rollback();
          return res.status(400).json({ error: "סכום לא חוקי לזיכוי חלקי" });
        }

        sourceItems = [{
          description: `זיכוי: ${reason || "סכום חלקי"}`,
          quantity: -1,
          unit_price: parsedAmount,
        }];
        subtotal = -parsedAmount;
        vatAmount = 0;
        computedTotal = subtotal;
      } else {
        sourceItems = origDocument.items.map((item) => ({
          description: `זיכוי: ${item.description}`,
          quantity: -item.quantity,
          unit_price: item.unit_price,
        }));
        subtotal = sourceItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
        vatAmount = subtotal * vatRate;
        computedTotal = subtotal + vatAmount;
      }
    } else {
      if (!Array.isArray(items) || items.length === 0) {
        await transaction.rollback();
        return res.status(400).json({ error: "חייב להיות לפחות פריט אחד במסמך" });
      }

      subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
      vatAmount = subtotal * vatRate;
      computedTotal = subtotal + vatAmount;
    }

    const lastDoc = await Document.findOne({
      where: { user_id: req.user.id },
      order: [["created_at", "DESC"]],
      transaction,
    });

    let nextNumber = "10001";
    if (lastDoc?.document_number) {
      nextNumber = String(parseInt(lastDoc.document_number) + 1).padStart(5, "0");
    } else if (req.user.start_receipt_number) {
      nextNumber = String(parseInt(req.user.start_receipt_number)).padStart(5, "0");
    }

    const initialStatus = mappedType === "קבלה" || mappedType === "זיכוי" ? "paid" : "draft";

    const document = await Document.create({
      user_id: req.user.id,
      client_id: client_id || origDocument?.client_id || null,
      document_number: nextNumber,
      document_type: mappedType,
      due_date: due_date ? new Date(due_date) : new Date(),
      issue_date: new Date(),
      subtotal,
      vat_rate: vatRate,
      vat_amount: vatAmount,
      total_amount: computedTotal,
      currency,
      notes: reason || notes || null,
      payment_method,
      is_immutable: false,
      metadata: {},
      status: initialStatus,
      original_document_id: mappedType === "זיכוי" ? original_document_id : null,
    }, { transaction });

    const { Service } = require("../models"); // Убедись, что Service импортирован

    for (let i = 0; i < sourceItems.length; i++) {
      const item = sourceItems[i];

      // Проверка количества и цены
      if (
        item.quantity === undefined || item.unit_price === undefined ||
        isNaN(item.quantity) || isNaN(item.unit_price)
      ) {
        await transaction.rollback();
        return res.status(400).json({ error: `פריט #${i + 1} מכיל כמות או מחיר לא חוקיים` });
      }

      // ✅ Проверка существующего service_id, если он указан
      if (item.service_id) {
        const serviceExists = await Service.findByPk(item.service_id, { transaction });
        if (!serviceExists) {
          await transaction.rollback();
          return res.status(400).json({
            error: `השירות עם מזהה ${item.service_id} לא קיים במערכת (פריט #${i + 1})`,
          });
        }
      }

      if (req.body.test_fail_stage === "before_create") {
        await transaction.rollback()
        return res.status(500).json({ error: "Ошибка ДО создания документа (тест)" })
      }

      // ✅ Создание позиции
      await DocumentItem.create({
        document_id: document.id,
        service_id: item.service_id || null,
        description: item.description,
        quantity: parseFloat(item.quantity),
        unit_price: parseFloat(item.unit_price),
        total_price: parseFloat(item.quantity) * parseFloat(item.unit_price),
        sort_order: i + 1,
      }, { transaction });
    }

    const docNumberAsInt = parseInt(nextNumber);
    if (!req.user.start_receipt_number || docNumberAsInt > req.user.start_receipt_number) {
      await User.update(
        { start_receipt_number: docNumberAsInt },
        { where: { id: req.user.id }, transaction }
      );
    }

    // Получаем все данные для PDF
    const fullDoc = await Document.findByPk(document.id, {
      include: [
        { model: DocumentItem, as: "items", order: [["sort_order", "ASC"]] },
        { model: Client, as: "client" },
      ],
      transaction,
    });

    const pdfPath = await generatePDF(fullDoc, req.user);

    await Document.update({ pdf_path: pdfPath }, {
      where: { id: document.id },
      transaction,
    });

    await transaction.commit();

    res.status(201).json({
      success: true,
      data: { ...fullDoc.toJSON(), pdf_path: pdfPath },
      message: "המסמך נוצר בהצלחה עם PDF",
    });

  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error("❌ שגיאה ביצירת מסמך:", error);
    res.status(500).json({ error: error.message || "שגיאה כללית ביצירת מסמך" });
  }
});

router.put("/:id/status", async (req, res) => {
  try {
    const { status } = req.body;

    const validStatuses = ["draft", "sent", "pending", "paid", "overdue", "cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const document = await Document.findOne({
      where: { id: req.params.id, user_id: req.user.id }
    });

    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    document.status = status;
    await document.save();

    res.json({
      success: true,
      data: document,
      message: `Document status updated to ${status}`
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to update status" });
  }
});

// POST /documents/:id/send-email - отправка документа по email
router.post("/:id/send-email", async (req, res) => {
  try {
    const { email, message } = req.body
    if (!email) return res.status(400).json({ error: "Email is required" })

    const document = await Document.findOne({
      where: { id: req.params.id, user_id: req.user.id },
      include: [
        { model: Client, as: "client" },
        { model: DocumentItem, as: "items", order: [["sort_order", "ASC"]] },
      ],
    })

    if (!document) return res.status(404).json({ error: "Document not found" })

    // PDF
    const pdfPath = await generatePDF(document, req.user)

    // Отправка email
    const result = await sendEmail(
      email,
      "payment_reminder", // шаблон, можно создать новый типа "document_with_attachment"
      {
        document_type: document.document_type,
        document_number: document.document_number,
        amount: document.total_amount,
        client_name: document.client?.full_name || "",
        business_name: req.user.business_name || "",
        custom_message: message,
        due_date: document.due_date,
      },
      [
        {
          filename: `${document.document_type}_${document.document_number}.pdf`,
          path: pdfPath,
        },
      ]
    )

    if (result.success) {
      document.status = "sent"
      await document.save()
      return res.json({ success: true })
    } else {
      return res.status(500).json({ success: false, error: result.error })
    }
  } catch (error) {
    console.error("Send email error:", error)
    res.status(500).json({ error: "Failed to send document" })
  }
})

// GET /documents/:id/pdf - генерация и скачивание PDF
router.get("/:id/pdf", async (req, res) => {
  try {
    const document = await Document.findOne({
      where: { id: req.params.id, user_id: req.user.id },
      include: [
        { model: Client, as: "client" },
        { model: DocumentItem, as: "items", order: [["sort_order", "ASC"]] },
      ],
    })

    if (!document) {
      return res.status(404).json({ error: "Document not found" })
    }

    // Генерируем PDF
    const pdfPath = await generatePDF(document, req.user)

    // Отправляем PDF файл
    res.download(pdfPath, `${document.document_type}_${document.document_number}.pdf`)
  } catch (error) {
    console.error("Generate PDF error:", error)
    res.status(500).json({ error: "Failed to generate PDF" })
  }
})

// POST /documents/:id/cancel - создание кредит-ноты (זיכוי)
router.post("/:id/cancel", async (req, res) => {
  const transaction = await sequelize.transaction()

  try {
    const { reason, partial_amount } = req.body

    // Получаем оригинальный документ
    const originalDocument = await Document.findOne({
      where: { id: req.params.id, user_id: req.user.id },
      include: [
        { model: Client, as: "client" },
        { model: DocumentItem, as: "items", order: [["sort_order", "ASC"]] },
      ],
    })

    if (!originalDocument) {
      return res.status(404).json({ error: "Document not found" })
    }

    // Проверяем, можно ли отменить документ
    if (originalDocument.document_type === "זיכוי") {
      return res.status(400).json({ error: "Cannot cancel a credit note" })
    }

    if (originalDocument.status === "cancelled") {
      return res.status(400).json({ error: "Document is already cancelled" })
    }

    // Получаем пользователя для генерации номера документа
    const user = await User.findByPk(req.user.id)

    // Создаем кредит-ноту
    const creditNote = await Document.create(
      {
        user_id: req.user.id,
        client_id: originalDocument.client_id,
        document_type: "זיכוי",
        document_number: await user.getNextDocumentNumber(),
        original_document_id: originalDocument.id,
        subtotal: -(partial_amount || originalDocument.subtotal),
        vat_rate: originalDocument.vat_rate,
        vat_amount: -((partial_amount || originalDocument.subtotal) * originalDocument.vat_rate),
        total_amount: -((partial_amount || originalDocument.subtotal) * (1 + originalDocument.vat_rate)),
        currency: originalDocument.currency,
        notes: reason || `זיכוי עבור ${originalDocument.document_type} מספר ${originalDocument.document_number}`,
        status: "draft",
      },
      { transaction },
    )

    // Копируем элементы документа (с отрицательными значениями)
    for (const item of originalDocument.items) {
      await DocumentItem.create(
        {
          document_id: creditNote.id,
          description: `זיכוי: ${item.description}`,
          quantity: -item.quantity,
          unit_price: item.unit_price,
          total_price: -(item.quantity * item.unit_price),
          sort_order: item.sort_order,
        },
        { transaction },
      )
    }

    // Обновляем статус оригинального документа
    if (!partial_amount || partial_amount >= originalDocument.total_amount) {
      originalDocument.status = "cancelled"
      await originalDocument.save({ transaction })
    }

    await transaction.commit()

    // Получаем полную кредит-ноту с отношениями
    const completeCreditNote = await Document.findByPk(creditNote.id, {
      include: [
        { model: Client, as: "client" },
        { model: DocumentItem, as: "items", order: [["sort_order", "ASC"]] },
      ],
    })

    res.json({
      success: true,
      data: {
        creditNote: completeCreditNote,
        originalDocument,
      },
      message: "Credit note created successfully",
    })
  } catch (error) {
    await transaction.rollback()
    console.error("Cancel document error:", error)
    res.status(500).json({ error: "Failed to cancel document" })
  }
})

router.post("/share-multiple", async (req, res) => {
  try {
    const { documentIds } = req.body

    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ error: "לא נבחרו מסמכים" })
    }

    const documents = await Document.findAll({ where: { id: documentIds } })

    const validPaths = documents
      .map((doc) => {
        const relPath = doc.pdf_path.replace(/^uploads\//, "")
        const fullPath = path.join("uploads", relPath)
        return fs.existsSync(fullPath) ? { relPath, fullPath } : null
      })
      .filter(Boolean)

    if (validPaths.length === 0) {
      return res.status(404).json({ error: "לא נמצאו קבצי PDF תקפים" })
    }

    const zipDir = path.join("uploads", "zips")
    fs.mkdirSync(zipDir, { recursive: true })
    const zipFileName = `documents_${Date.now()}.zip`
    const zipPath = path.join(zipDir, zipFileName)

    const output = fs.createWriteStream(zipPath)
    const archive = archiver("zip", { zlib: { level: 9 } })

    output.on("close", () => {
      // console.log(`✅ ZIP создан: ${zipPath} (${archive.pointer()} bytes)`)

      // ✅ Отдаём только после завершения архивации
      res.json({ zipPath: `zips/${zipFileName}` })

      // ⏳ Удалим через 5 минут
      console.log("🕒 Планируем удаление ZIP через 5 минут:", zipPath)

      setTimeout(() => {
        fs.unlink(zipPath, (err) => {
          if (err) console.warn("❌ Ошибка при удалении:", err.message)
          else console.log("✅ ZIP успешно удалён:", zipPath)
        })
      }, 10 * 1000)

    })

    archive.on("error", (err) => {
      console.error("❌ Ошибка архивации:", err)
      res.status(500).json({ error: "שגיאה בארכוב הקבצים" })
    })

    archive.pipe(output)

    validPaths.forEach(({ relPath, fullPath }) => {
      archive.file(fullPath, { name: path.basename(relPath) })
    })

    await archive.finalize()
  } catch (err) {
    console.error("❌ Ошибка сервера:", err)
    res.status(500).json({ error: "שגיאה בשיתוף מסמכים" })
  }
})

module.exports = router
