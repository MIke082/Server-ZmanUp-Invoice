const express = require("express")
const { Document, DocumentItem, Client, Service, User } = require("../models")
const { Op } = require("sequelize")
const fs = require("fs")
const path = require("path")
const nodemailer = require("nodemailer")
const PDFMerger = require("pdf-merger-js").default
const { Parser } = require("json2csv");
const ExcelJS = require("exceljs");
const { getLastMonth } = require("../utils/dateUtils") // функция ниже
const { generateMonthlyReportPDF } = require("../services/generateMonthlyReportPDF")
const { sendMonthlyReports } = require("../services/sendMonthlyReports")

const router = express.Router()

// POST export/pdf создание pdf со выбраными файлами 
router.post("/export/pdf", async (req, res) => {

  try {
    const { documentIds } = req.body

    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ error: "לא נבחרו מסמכים לייצוא" })
    }

    // Получаем документы
    const documents = await Document.findAll({
      where: { id: documentIds },
    })

    const pdfPaths = documents
      .map((doc) =>
        path.join(__dirname, "..", "uploads", doc.pdf_path.replace(/^uploads\//, ""))
      )
      .filter((filePath) => fs.existsSync(filePath))

    if (pdfPaths.length === 0) {
      return res.status(404).json({ error: "לא נמצאו קבצים תקפים" })
    }

    const outputDir = path.join(__dirname, "..", "uploads", "exports")
    fs.mkdirSync(outputDir, { recursive: true })

    const mergedPdfFileName = `merged_${Date.now()}.pdf`
    const mergedPdfPath = path.join(outputDir, mergedPdfFileName)

    // Объединяем PDF
    const merger = new PDFMerger()
    for (const filePath of pdfPaths) {
      await merger.add(filePath)
    }
    await merger.save(mergedPdfPath)

    console.log("✅ PDF объединён:", mergedPdfPath)

    // Возвращаем путь клиенту
    const relativePath = `uploads/exports/${mergedPdfFileName}`
    res.json({ filePath: relativePath })

    // Удаляем файл через 1 минуту
    setTimeout(() => {
      fs.unlink(mergedPdfPath, (err) => {
        if (err) console.warn("⚠️ Не удалось удалить файл:", mergedPdfPath)
        else console.log("🧹 Удалён:", mergedPdfPath)
      })
    }, 60 * 1000)
  } catch (err) {
    console.error("❌ Ошибка экспорта PDF:", err)
    res.status(500).json({ error: "שגיאה ביצירת קובץ PDF" })
  }
})
// создание pdf с годовымы файлами 
router.post("/export/pdf/yearly", async (req, res) => {
  console.log("📥 Получен POST /export/pdf/yearly", req.body)

  try {
    const { year } = req.body

    if (!year || typeof year !== "number") {
      return res.status(400).json({ error: "שנה לא תקינה" })
    }

    const startDate = new Date(`${year}-01-01`)
    const endDate = new Date(`${year}-12-31T23:59:59`)

    const documents = await Document.findAll({
      where: {
        due_date: {
          [Op.between]: [startDate, endDate],
        },
      },
    })

    const pdfPaths = []
    const missingFiles = []
    const missingPathDocs = []

    for (const doc of documents) {
      if (!doc.pdf_path || typeof doc.pdf_path !== "string" || doc.pdf_path.trim() === "") {
        missingPathDocs.push(doc.id)
        continue
      }

      const fullPath = path.join(__dirname, "..", "uploads", doc.pdf_path.replace(/^uploads\//, ""))
      if (fs.existsSync(fullPath)) {
        pdfPaths.push(fullPath)
      } else {
        missingFiles.push({ id: doc.id, path: fullPath })
      }
    }

    // Логи
    if (missingPathDocs.length > 0) {
      console.warn(`⚠️ Документы без pdf_path:`, missingPathDocs)
    }

    if (missingFiles.length > 0) {
      console.warn(`⚠️ Не найдены PDF-файлы:`, missingFiles)
    }

    if (pdfPaths.length === 0) {
      return res.status(404).json({ error: "לא נמצאו קבצים תקפים לשנה זו" })
    }

    const outputDir = path.join(__dirname, "..", "uploads", "exports")
    fs.mkdirSync(outputDir, { recursive: true })

    const mergedPdfFileName = `yearly_${year}_${Date.now()}.pdf`
    const mergedPdfPath = path.join(outputDir, mergedPdfFileName)

    const merger = new PDFMerger()
    for (const filePath of pdfPaths) {
      await merger.add(filePath)
    }

    await merger.save(mergedPdfPath)

    console.log("✅ Годовой PDF объединён:", mergedPdfPath)

    const relativePath = `uploads/exports/${mergedPdfFileName}`
    res.json({ filePath: relativePath })

    // Удаление через минуту
    setTimeout(() => {
      fs.unlink(mergedPdfPath, (err) => {
        if (err) console.warn("⚠️ Не удалось удалить файл:", mergedPdfPath)
        else console.log("🧹 Удалён:", mergedPdfPath)
      })
    }, 60 * 1000)
  } catch (err) {
    console.error("❌ Ошибка создания годового отчёта:", err)
    res.status(500).json({ error: "שגיאה ביצירת דוח שנתי PDF" })
  }
})


router.post("/export/csv", async (req, res) => {
  try {
    const { documentIds } = req.body;
    const userId = req.body.userId || req.query.userId || req.user?.id;

    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ error: "Missing documentIds" });
    }

    const documents = await Document.findAll({
      where: {
        id: documentIds,
        user_id: userId,
        status: { [require("sequelize").Op.ne]: "cancelled" }
      },
      include: [
        {
          model: Client,
          as: "client",
          attributes: [
            "firstName", "lastName", "business_name", "phone",
            "email", "address", "city"
          ]
        },
        {
          model: DocumentItem,
          as: "items",
          include: [
            {
              model: Service,
              as: "service",
              attributes: ["name"]
            }
          ]
        }
      ],
      order: [["due_date", "DESC"]]
    });

    const csvData = documents.map((doc) => {
      const serviceNames = doc.items.map(item => item.service?.name || item.description).join(" | ");
      return {
        "מספר מסמך": doc.document_number,
        "סוג מסמך": doc.document_type,
        "תאריך הנפקה": doc.issue_date,
        "תאריך לתשלום": doc.due_date || "",
        "סכום ביניים": doc.subtotal,
        "מע״מ": doc.vat_amount,
        "סה״כ לתשלום": doc.total_amount,
        "מטבע": doc.currency,
        "שם פרטי": doc.client?.firstName || "",
        "שם משפחה": doc.client?.lastName || "",
        "שם עסק": doc.client?.business_name || "",
        "טלפון": doc.client?.phone || "",
        "אימייל": doc.client?.email || "",
        "כתובת": doc.client?.address || "",
        "עיר": doc.client?.city || "",
        "שירותים": serviceNames
      };
    });

    const fields = Object.keys(csvData[0]);
    const parser = new Parser({ fields });
    const csv = parser.parse(csvData);

    const timestamp = Date.now();
    const fileName = `documents_${timestamp}.csv`;
    const fileDir = path.join(__dirname, "..", "uploads", "exports");
    const filePath = path.join(fileDir, fileName);

    fs.mkdirSync(fileDir, { recursive: true });
    fs.writeFileSync(filePath, csv, "utf8");

    setTimeout(() => {
      fs.unlink(filePath, (err) => {
        if (err) console.error("❌ Error deleting CSV:", err);
        else console.log(`✅ Deleted CSV file: ${fileName}`);
      });
    }, 60 * 1000);

    return res.json({
      message: "CSV export successful",
      filePath: `/uploads/exports/${fileName}`
    });

  } catch (error) {
    console.error("❌ CSV export error:", error);
    return res.status(500).json({ error: "CSV export failed" });
  }
});

router.post("/export/csv/yearly", async (req, res) => {
  try {
    const { year } = req.body;
    const userId = req.body.userId || req.query.userId || req.user?.id;

    if (!year || !userId) {
      return res.status(400).json({ error: "Missing year or userId" });
    }

    const documents = await Document.findAll({
      where: {
        user_id: userId,
        status: { [Op.ne]: "cancelled" },
        due_date: {
          [Op.between]: [`${year}-01-01`, `${year}-12-31`]
        }
      },
      include: [
        {
          model: Client,
          as: "client",
          attributes: [
            "firstName", "lastName", "business_name", "phone",
            "email", "address", "city", "zipCode"
          ]
        },
        {
          model: DocumentItem,
          as: "items",
          include: [
            {
              model: Service,
              as: "service",
              attributes: ["name"]
            }
          ]
        }
      ],
      order: [["due_date", "DESC"]]
    });

    if (!documents || documents.length === 0) {
      return res.status(404).json({ error: "No documents found for this year" });
    }

    const csvData = documents.map((doc) => {
      const serviceNames = doc.items.map(item => item.service?.name || item.description).join(" | ");
      return {
        document_number: doc.document_number,
        document_type: doc.document_type,
        issue_date: doc.issue_date,
        due_date: doc.due_date,
        client_first_name: doc.client?.firstName || "",
        client_last_name: doc.client?.lastName || "",
        business_name: doc.client?.business_name || "",
        phone: doc.client?.phone || "",
        email: doc.client?.email || "",
        address: doc.client?.address || "",
        city: doc.client?.city || "",
        zipCode: doc.client?.zipCode || "",
        service_names: serviceNames,
        currency: doc.currency,
        subtotal: doc.subtotal,
        vat_amount: doc.vat_amount,
        total_amount: doc.total_amount,
        document_id: doc.id
      };
    });

    const fields = [
      { label: "מס׳ חשבונית", value: "document_number" },
      { label: "סוג מסמך", value: "document_type" },
      { label: "תאריך", value: "issue_date" },
      { label: "תאריך פירעון", value: "due_date" },
      { label: "שם פרטי של לקוח", value: "client_first_name" },
      { label: "שם משפחה של לקוח", value: "client_last_name" },
      { label: "שם עסק", value: "business_name" },
      { label: "טלפון", value: "phone" },
      { label: "אימייל", value: "email" },
      { label: "כתובת", value: "address" },
      { label: "עיר", value: "city" },
      { label: "מיקוד", value: "zipCode" },
      { label: "שירותים", value: "service_names" },
      { label: "מטבע", value: "currency" },
      { label: "סכום לפני מע״מ", value: "subtotal" },
      { label: "סכום מע״מ", value: "vat_amount" },
      { label: "סכום כולל", value: "total_amount" },
      { label: "ID מסמך", value: "document_id" }
    ];

    const parser = new Parser({ fields });
    const csv = parser.parse(csvData);

    const fileName = `yearly_report_${year}_${Date.now()}.csv`;
    const fileDir = path.join(__dirname, "..", "uploads", "exports");
    const filePath = path.join(fileDir, fileName);

    fs.mkdirSync(fileDir, { recursive: true });
    fs.writeFileSync(filePath, csv, "utf8");

    // Удаление через 1 минуту
    setTimeout(() => {
      fs.unlink(filePath, (err) => {
        if (err) console.error("❌ Error deleting CSV:", err);
      });
    }, 60 * 1000);

    return res.json({
      message: "CSV export successful",
      filePath: `/uploads/exports/${fileName}`
    });

  } catch (error) {
    console.error("❌ /export/csv/yearly error:", error);
    return res.status(500).json({ error: "CSV export failed" });
  }
});

router.post("/export/excel/yearly", async (req, res) => {
  try {
    const { year } = req.body;
    const userId = req.body.userId || req.query.userId || req.user?.id;

    if (!year || !userId) {
      return res.status(400).json({ error: "Missing year or userId" });
    }

    const documents = await Document.findAll({
      where: {
        user_id: userId,
        status: { [Op.ne]: "cancelled" },
        due_date: {
          [Op.between]: [`${year}-01-01`, `${year}-12-31`],
        },
      },
      include: [
        {
          model: Client,
          as: "client",
          attributes: [
            "firstName",
            "lastName",
            "business_name",
            "phone",
            "email",
            "address",
            "city",
            "zipCode",
          ],
        },
        {
          model: DocumentItem,
          as: "items",
          include: [
            {
              model: Service,
              as: "service",
              attributes: ["name"],
            },
          ],
        },
      ],
      order: [["due_date", "DESC"]],
    });

    if (!documents || documents.length === 0) {
      return res.status(404).json({ error: "No documents found for this year" });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`דו"ח ${year}`);

    worksheet.columns = [
      { header: "מס׳ חשבונית", key: "document_number", width: 15 },
      { header: "סוג מסמך", key: "document_type", width: 15 },
      { header: "תאריך", key: "issue_date", width: 15 },
      { header: "תאריך פירעון", key: "due_date", width: 15 },
      { header: "שם פרטי", key: "firstName", width: 15 },
      { header: "שם משפחה", key: "lastName", width: 15 },
      { header: "שם עסק", key: "business_name", width: 20 },
      { header: "טלפון", key: "phone", width: 15 },
      { header: "אימייל", key: "email", width: 25 },
      { header: "כתובת", key: "address", width: 20 },
      { header: "עיר", key: "city", width: 15 },
      { header: "מיקוד", key: "zipCode", width: 10 },
      { header: "שירותים", key: "service_names", width: 30 },
      { header: "מטבע", key: "currency", width: 10 },
      { header: "לפני מע״מ", key: "subtotal", width: 15 },
      { header: "סכום מע״מ", key: "vat_amount", width: 15 },
      { header: "סך הכול", key: "total_amount", width: 15 },
    ];

    documents.forEach((doc) => {
      const serviceNames = doc.items.map(item => item.service?.name || item.description).join(" | ");
      worksheet.addRow({
        document_number: doc.document_number,
        document_type: doc.document_type,
        issue_date: doc.issue_date,
        due_date: doc.due_date,
        firstName: doc.client?.firstName || "",
        lastName: doc.client?.lastName || "",
        business_name: doc.client?.business_name || "",
        phone: doc.client?.phone || "",
        email: doc.client?.email || "",
        address: doc.client?.address || "",
        city: doc.client?.city || "",
        zipCode: doc.client?.zipCode || "",
        service_names: serviceNames,
        currency: doc.currency,
        subtotal: doc.subtotal,
        vat_amount: doc.vat_amount,
        total_amount: doc.total_amount,
      });
    });

    const fileName = `yearly_report_${year}_${Date.now()}.xlsx`;
    const fileDir = path.join(__dirname, "..", "uploads", "exports");
    const filePath = path.join(fileDir, fileName);

    fs.mkdirSync(fileDir, { recursive: true });
    await workbook.xlsx.writeFile(filePath);

    // Удаление через минуту
    setTimeout(() => {
      fs.unlink(filePath, (err) => {
        if (err) console.error("❌ Excel delete error:", err);
      });
    }, 60 * 1000);

    return res.status(200).json({
      message: "Excel export successful",
      filePath: `/uploads/exports/${fileName}`,
    });

  } catch (error) {
    console.error("❌ /export/excel/yearly error:", error);
    return res.status(500).json({ error: "Excel export failed" });
  }
});

router.post("/send/monthly-from-cron", async (req, res) => {
  try {
    const { year, month } = getLastMonth()
    const result = await sendMonthlyReports({ year, month })
    res.json(result)
  } catch (err) {
    console.error("❌ Ошибка при отправке отчётов:", err)
    res.status(500).json({ error: "שליחה נכשלה" })
  }
})



// Helper function to format currency
// const formatCurrency = (amount) => {
//   return new Intl.NumberFormat("he-IL", {
//     style: "currency",
//     currency: "ILS",
//   }).format(amount || 0)
// }

// Helper function to get month name in Hebrew
// const getMonthName = (month) => {
//   const months = [
//     "ינואר",
//     "פברואר",
//     "מרץ",
//     "אפריל",
//     "מאי",
//     "יוני",
//     "יולי",
//     "אוגוסט",
//     "ספטמבר",
//     "אוקטובר",
//     "נובמבר",
//     "דצמבר",
//   ]
//   return months[month - 1]
// }

// // GET /reports/dashboard
// router.get("/dashboard", async (req, res) => {
//   try {
//     const { year = new Date().getFullYear() } = req.query

//     const startDate = `${year}-01-01`
//     const endDate = `${year}-12-31`

//     const yearlyStats = await Document.findAll({
//       where: {
//         user_id: req.user.id,
//         issue_date: {
//           [Op.between]: [startDate, endDate],
//         },
//       },
//       attributes: [
//         [sequelize.fn("COUNT", sequelize.col("id")), "total_documents"],
//         [sequelize.fn("SUM", sequelize.col("subtotal")), "total_revenue"],
//         [sequelize.fn("SUM", sequelize.col("vat_amount")), "total_vat"],
//         [sequelize.fn("SUM", sequelize.col("total_amount")), "total_with_vat"],
//       ],
//       raw: true,
//     })

//     const statusStats = await Document.findAll({
//       where: {
//         user_id: req.user.id,
//         issue_date: {
//           [Op.between]: [startDate, endDate],
//         },
//       },
//       attributes: [
//         "status",
//         [sequelize.fn("COUNT", sequelize.col("id")), "count"],
//         [sequelize.fn("SUM", sequelize.col("total_amount")), "amount"],
//       ],
//       group: ["status"],
//       raw: true,
//     })

//     res.json({
//       success: true,
//       data: {
//         yearly: yearlyStats[0] || {},
//         by_status: statusStats,
//       },
//     })
//   } catch (error) {
//     console.error("Dashboard reports error:", error)
//     res.status(500).json({ error: "Failed to fetch dashboard data" })
//   }
// })

// // GET /reports/yearly/:year - Get yearly report
// router.get("/yearly/:year", async (req, res) => {
//   try {
//     const { year } = req.params
//     const userId = req.user.id

//     const startDate = `${year}-01-01`
//     const endDate = `${year}-12-31`

//     // Get yearly totals
//     const yearlyTotals = await Document.findOne({
//       where: {
//         user_id: userId,
//         issue_date: {
//           [Op.between]: [startDate, endDate],
//         },
//         status: { [Op.ne]: "cancelled" },
//       },
//       attributes: [
//         [sequelize.fn("COUNT", sequelize.col("id")), "totalDocuments"],
//         [sequelize.fn("SUM", sequelize.col("subtotal")), "totalRevenue"],
//         [sequelize.fn("SUM", sequelize.col("vat_amount")), "totalVat"],
//         [sequelize.fn("SUM", sequelize.col("total_amount")), "totalWithVat"],
//       ],
//       raw: true,
//     })

//     // Get monthly breakdown
//     const monthlyData = await Document.findAll({
//       where: {
//         user_id: userId,
//         issue_date: {
//           [Op.between]: [startDate, endDate],
//         },
//         status: { [Op.ne]: "cancelled" },
//       },
//       attributes: [
//         [sequelize.fn("MONTH", sequelize.col("issue_date")), "month"],
//         [sequelize.fn("COUNT", sequelize.col("id")), "documentsCount"],
//         [sequelize.fn("SUM", sequelize.col("total_amount")), "revenue"],
//       ],
//       group: [sequelize.fn("MONTH", sequelize.col("issue_date"))],
//       order: [[sequelize.fn("MONTH", sequelize.col("issue_date")), "ASC"]],
//       raw: true,
//     })

//     // Get document types breakdown
//     const documentTypes = await Document.findAll({
//       where: {
//         user_id: userId,
//         issue_date: {
//           [Op.between]: [startDate, endDate],
//         },
//         status: { [Op.ne]: "cancelled" },
//       },
//       attributes: [
//         "type",
//         [sequelize.fn("COUNT", sequelize.col("id")), "count"],
//         [sequelize.fn("SUM", sequelize.col("total_amount")), "amount"],
//       ],
//       group: ["type"],
//       raw: true,
//     })

//     // Get top clients
//     const topClients = await Document.findAll({
//       where: {
//         user_id: userId,
//         issue_date: {
//           [Op.between]: [startDate, endDate],
//         },
//         status: { [Op.ne]: "cancelled" },
//       },
//       attributes: [
//         "client_id",
//         [sequelize.fn("COUNT", sequelize.col("Document.id")), "documentsCount"],
//         [sequelize.fn("SUM", sequelize.col("total_amount")), "totalRevenue"],
//       ],
//       include: [
//         {
//           model: Client,
//           attributes: ["firstName", "lastName", "company_name"],
//           required: true,
//         },
//       ],
//       group: ["client_id", "Client.id"],
//       order: [[sequelize.fn("SUM", sequelize.col("total_amount")), "DESC"]],
//       limit: 10,
//       raw: false,
//     })

//     // Calculate trends (compare with previous year)
//     const prevYear = Number.parseInt(year) - 1
//     const prevYearData = await Document.findOne({
//       where: {
//         user_id: userId,
//         issue_date: {
//           [Op.between]: [`${prevYear}-01-01`, `${prevYear}-12-31`],
//         },
//         status: { [Op.ne]: "cancelled" },
//       },
//       attributes: [
//         [sequelize.fn("COUNT", sequelize.col("id")), "totalDocuments"],
//         [sequelize.fn("SUM", sequelize.col("total_amount")), "totalRevenue"],
//       ],
//       raw: true,
//     })

//     // Calculate trends
//     const revenueTrend = prevYearData?.totalRevenue
//       ? (((yearlyTotals.totalRevenue - prevYearData.totalRevenue) / prevYearData.totalRevenue) * 100).toFixed(1)
//       : 0

//     const documentsTrend = prevYearData?.totalDocuments
//       ? (((yearlyTotals.totalDocuments - prevYearData.totalDocuments) / prevYearData.totalDocuments) * 100).toFixed(1)
//       : 0

//     // Format monthly chart data
//     const monthlyRevenueChart = Array.from({ length: 12 }, (_, i) => {
//       const monthData = monthlyData.find((m) => m.month === i + 1)
//       return {
//         label: getMonthName(i + 1),
//         value: monthData ? Number.parseFloat(monthData.revenue) : 0,
//       }
//     })

//     const monthlyDocumentsChart = Array.from({ length: 12 }, (_, i) => {
//       const monthData = monthlyData.find((m) => m.month === i + 1)
//       return {
//         label: getMonthName(i + 1),
//         value: monthData ? Number.parseInt(monthData.documentsCount) : 0,
//       }
//     })

//     // Format document types chart
//     const documentTypesChart = documentTypes.map((type) => ({
//       label: type.type,
//       value: Number.parseInt(type.count),
//       amount: Number.parseFloat(type.amount),
//     }))

//     // Format top clients
//     const formattedTopClients = topClients.map((client) => ({
//       id: client.client_id,
//       name: client.Client.company_name || `${client.Client.firstName} ${client.Client.lastName || ""}`.trim(),
//       totalRevenue: Number.parseFloat(client.dataValues.totalRevenue),
//       documentsCount: Number.parseInt(client.dataValues.documentsCount),
//     }))

//     const report = {
//       year: Number.parseInt(year),
//       totalRevenue: Number.parseFloat(yearlyTotals.totalRevenue) || 0,
//       totalDocuments: Number.parseInt(yearlyTotals.totalDocuments) || 0,
//       totalVat: Number.parseFloat(yearlyTotals.totalVat) || 0,
//       totalWithVat: Number.parseFloat(yearlyTotals.totalWithVat) || 0,
//       monthlyAverage: (Number.parseFloat(yearlyTotals.totalRevenue) || 0) / 12,
//       totalClients: topClients.length,
//       revenueTrend: Number.parseFloat(revenueTrend),
//       documentsTrend: Number.parseFloat(documentsTrend),
//       clientsTrend: 0, // Can be calculated if needed
//       monthlyRevenueChart,
//       monthlyDocumentsChart,
//       documentTypesChart,
//       topClients: formattedTopClients,
//     }

//     res.json({
//       success: true,
//       data: report,
//     })
//   } catch (error) {
//     console.error("Yearly report error:", error)
//     res.status(500).json({ error: "שגיאה בטעינת דוח שנתי" })
//   }
// })

// // GET /reports/monthly/:year/:month - Get monthly report
// router.get("/monthly/:year/:month", async (req, res) => {
//   try {
//     const { year, month } = req.params
//     const userId = req.user.id

//     const startDate = `${year}-${month.padStart(2, "0")}-01`
//     const endDate = new Date(year, month, 0).toISOString().split("T")[0] // Last day of month

//     // Get monthly totals
//     const monthlyTotals = await Document.findOne({
//       where: {
//         user_id: userId,
//         issue_date: {
//           [Op.between]: [startDate, endDate],
//         },
//         status: { [Op.ne]: "cancelled" },
//       },
//       attributes: [
//         [sequelize.fn("COUNT", sequelize.col("id")), "totalDocuments"],
//         [sequelize.fn("SUM", sequelize.col("total_amount")), "totalRevenue"],
//         [sequelize.fn("AVG", sequelize.col("total_amount")), "averagePerDocument"],
//       ],
//       raw: true,
//     })

//     // Get daily breakdown for the month
//     const dailyData = await Document.findAll({
//       where: {
//         user_id: userId,
//         issue_date: {
//           [Op.between]: [startDate, endDate],
//         },
//         status: { [Op.ne]: "cancelled" },
//       },
//       attributes: [
//         [sequelize.fn("DAY", sequelize.col("issue_date")), "day"],
//         [sequelize.fn("SUM", sequelize.col("total_amount")), "revenue"],
//       ],
//       group: [sequelize.fn("DAY", sequelize.col("issue_date"))],
//       order: [[sequelize.fn("DAY", sequelize.col("issue_date")), "ASC"]],
//       raw: true,
//     })

//     // Get document types for this month
//     const documentTypes = await Document.findAll({
//       where: {
//         user_id: userId,
//         issue_date: {
//           [Op.between]: [startDate, endDate],
//         },
//         status: { [Op.ne]: "cancelled" },
//       },
//       attributes: ["type", [sequelize.fn("COUNT", sequelize.col("id")), "count"]],
//       group: ["type"],
//       raw: true,
//     })

//     // Get active clients count
//     const activeClients = await Document.findAll({
//       where: {
//         user_id: userId,
//         issue_date: {
//           [Op.between]: [startDate, endDate],
//         },
//         status: { [Op.ne]: "cancelled" },
//       },
//       attributes: [[sequelize.fn("COUNT", sequelize.fn("DISTINCT", sequelize.col("client_id"))), "count"]],
//       raw: true,
//     })

//     // Calculate trends (compare with previous month)
//     const prevMonth = month == 1 ? 12 : month - 1
//     const prevYear = month == 1 ? year - 1 : year
//     const prevStartDate = `${prevYear}-${prevMonth.toString().padStart(2, "0")}-01`
//     const prevEndDate = new Date(prevYear, prevMonth, 0).toISOString().split("T")[0]

//     const prevMonthData = await Document.findOne({
//       where: {
//         user_id: userId,
//         issue_date: {
//           [Op.between]: [prevStartDate, prevEndDate],
//         },
//         status: { [Op.ne]: "cancelled" },
//       },
//       attributes: [
//         [sequelize.fn("COUNT", sequelize.col("id")), "totalDocuments"],
//         [sequelize.fn("SUM", sequelize.col("total_amount")), "totalRevenue"],
//       ],
//       raw: true,
//     })

//     // Calculate trends
//     const revenueTrend = prevMonthData?.totalRevenue
//       ? (((monthlyTotals.totalRevenue - prevMonthData.totalRevenue) / prevMonthData.totalRevenue) * 100).toFixed(1)
//       : 0

//     const documentsTrend = prevMonthData?.totalDocuments
//       ? (((monthlyTotals.totalDocuments - prevMonthData.totalDocuments) / prevMonthData.totalDocuments) * 100).toFixed(
//         1,
//       )
//       : 0

//     // Format daily chart data
//     const daysInMonth = new Date(year, month, 0).getDate()
//     const revenueChart = Array.from({ length: daysInMonth }, (_, i) => {
//       const dayData = dailyData.find((d) => d.day === i + 1)
//       return {
//         label: (i + 1).toString(),
//         value: dayData ? Number.parseFloat(dayData.revenue) : 0,
//       }
//     })

//     // Format document types chart
//     const documentsChart = documentTypes.map((type) => ({
//       label: type.type,
//       value: Number.parseInt(type.count),
//     }))

//     const report = {
//       year: Number.parseInt(year),
//       month: Number.parseInt(month),
//       monthName: getMonthName(Number.parseInt(month)),
//       totalRevenue: Number.parseFloat(monthlyTotals.totalRevenue) || 0,
//       totalDocuments: Number.parseInt(monthlyTotals.totalDocuments) || 0,
//       averagePerDocument: Number.parseFloat(monthlyTotals.averagePerDocument) || 0,
//       activeClients: Number.parseInt(activeClients[0]?.count) || 0,
//       revenueTrend: Number.parseFloat(revenueTrend),
//       documentsTrend: Number.parseFloat(documentsTrend),
//       clientsTrend: 0, // Can be calculated if needed
//       revenueChart,
//       documentsChart,
//     }

//     res.json({
//       success: true,
//       data: report,
//     })
//   } catch (error) {
//     console.error("Monthly report error:", error)
//     res.status(500).json({ error: "שגיאה בטעינת דוח חודשי" })
//   }
// })




// POST /reports/export/csv - Export report as CSV
// router.post("/export/csv", async (req, res) => {
//   try {
//     const { year, month, type } = req.body
//     const userId = req.user.id

//     let startDate, endDate
//     if (type === "yearly") {
//       startDate = `${year}-01-01`
//       endDate = `${year}-12-31`
//     } else {
//       startDate = `${year}-${String(month).padStart(2, "0")}-01`
//       endDate = new Date(year, month, 0).toISOString().split("T")[0]
//     }

//     const documents = await Document.findAll({
//       where: {
//         user_id: userId,
//         issue_date: {
//           [Op.between]: [startDate, endDate],
//         },
//         status: { [Op.ne]: "cancelled" },
//       },
//       include: [
//         {
//           model: Client,
//           attributes: ["firstName", "lastName", "company_name"],
//         },
//       ],
//       order: [["issue_date", "DESC"]],
//     })

//     const csvHeader = 'תאריך,מספר מסמך,סוג,לקוח,סכום,מע"מ,סה"כ,סטטוס\n'
//     const csvRows = documents
//       .map((doc) => {
//         const clientName =
//           doc.Client?.company_name || `${doc.Client?.firstName || ""} ${doc.Client?.lastName || ""}`.trim()
//         return [
//           new Date(doc.issue_date).toLocaleDateString("he-IL"),
//           doc.document_number || "",
//           doc.document_type,
//           clientName,
//           doc.subtotal || 0,
//           doc.vat_amount || 0,
//           doc.total_amount || 0,
//           doc.status,
//         ].join(",")
//       })
//       .join("\n")

//     const csvContent = csvHeader + csvRows
//     const fileName = `report_${type}_${year}${month ? `_${month}` : ""}_${Date.now()}.csv`
//     const filePath = path.join(__dirname, "..", "uploads", "reports", fileName)

//     fs.mkdirSync(path.dirname(filePath), { recursive: true })
//     fs.writeFileSync(filePath, "\uFEFF" + csvContent, "utf8")

//     console.log("✅ CSV файл создан:", fileName)

//     res.json({
//       success: true,
//       data: {
//         fileName,
//         uri: `/uploads/reports/${fileName}`,
//         message: "CSV נוצר בהצלחה",
//       },
//     })

//     // Удаляем CSV через 1 минуту
//     setTimeout(() => {
//       fs.unlink(filePath, (err) => {
//         if (err) console.warn("⚠️ Не удалось удалить CSV:", filePath)
//         else console.log("🧹 CSV удалён:", fileName)
//       })
//     }, 60 * 1000)
//   } catch (error) {
//     console.error("❌ CSV export error:", error)
//     res.status(500).json({ error: "שגיאה ביצירת CSV" })
//   }
// })



// POST /reports/send - Send report by email
router.post("/send", async (req, res) => {
  try {
    const { year, month, type, recipients } = req.body
    const userId = req.user.id

    // Get user info
    const user = await User.findByPk(userId)
    if (!user) {
      return res.status(404).json({ error: "משתמש לא נמצא" })
    }

    // Generate PDF report first
    const pdfResponse = await fetch(`${req.protocol}://${req.get("host")}/api/reports/export/pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: req.headers.authorization,
      },
      body: JSON.stringify({ year, month, type }),
    })

    const pdfResult = await pdfResponse.json()
    if (!pdfResult.success) {
      throw new Error("Failed to generate PDF")
    }

    // Setup email transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })

    const pdfPath = path.join(__dirname, "../uploads/reports", pdfResult.data.fileName)

    // Send email
    const mailOptions = {
      from: process.env.SMTP_FROM,
      to: recipients.join(","),
      subject: `דוח ${type === "yearly" ? "שנתי" : "חודשי"} - ${year}${month ? `/${month}` : ""}`,
      html: `
        <div dir="rtl">
          <h2>דוח ${type === "yearly" ? "שנתי" : "חודשי"}</h2>
          <p>שלום,</p>
          <p>מצורף דוח ${type === "yearly" ? "שנתי" : "חודשי"} עבור ${year}${month ? `/${month}` : ""}.</p>
          <p>בברכה,<br>${user.firstName} ${user.lastName || ""}</p>
        </div>
      `,
      attachments: [
        {
          filename: pdfResult.data.fileName,
          path: pdfPath,
        },
      ],
    }

    await transporter.sendMail(mailOptions)

    res.json({
      success: true,
      message: "הדוח נשלח בהצלחה",
    })
  } catch (error) {
    console.error("Send report error:", error)
    res.status(500).json({ error: "שגיאה בשליחת הדוח" })
  }
})

module.exports = router
