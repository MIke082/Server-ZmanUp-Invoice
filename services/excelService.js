const ExcelJS = require("exceljs")
const { Document, DocumentItem, Client, Service, sequelize } = require("../models")
const { Op } = require("sequelize")

async function generateExcelReport(userId, reportType, year, filters = {}) {
  try {
    const workbook = new ExcelJS.Workbook()

    workbook.creator = "ZmanUp Invoice System"
    workbook.lastModifiedBy = "ZmanUp"
    workbook.created = new Date()
    workbook.modified = new Date()

    const startDate = `${year}-01-01`
    const endDate = `${year}-12-31`

    switch (reportType) {
      case "documents":
        await generateDocumentsReport(workbook, userId, startDate, endDate, filters)
        break
      case "clients":
        await generateClientsReport(workbook, userId, startDate, endDate, filters)
        break
      case "services":
        await generateServicesReport(workbook, userId, startDate, endDate, filters)
        break
      case "vat":
        await generateVATReport(workbook, userId, startDate, endDate, filters)
        break
      default:
        throw new Error("Invalid report type")
    }

    const buffer = await workbook.xlsx.writeBuffer()
    return buffer
  } catch (error) {
    console.error("Excel generation error:", error)
    throw new Error("Failed to generate Excel report")
  }
}

async function generateDocumentsReport(workbook, userId, startDate, endDate, filters) {
  const worksheet = workbook.addWorksheet("Documents Report")

  // Headers
  const headers = [
    "מספר מסמך",
    "סוג מסמך",
    "תאריך הנפקה",
    "שם לקוח",
    "סטטוס",
    'סכום ללא מע"מ',
    'מע"מ',
    'סה"כ',
    "תאריך פירעון",
    "הערות",
  ]

  worksheet.addRow(headers)

  // Style headers
  const headerRow = worksheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF26264F" },
  }
  headerRow.font = { color: { argb: "FFFFFFFF" }, bold: true }

  // Get data
  const documents = await Document.findAll({
    where: {
      user_id: userId,
      issue_date: {
        [Op.between]: [startDate, endDate],
      },
    },
    include: [
      {
        model: Client,
        as: "client",
        attributes: ["name"],
      },
    ],
    order: [["issue_date", "DESC"]],
  })

  // Add data rows
  documents.forEach((doc) => {
    worksheet.addRow([
      doc.document_number,
      doc.document_type,
      doc.issue_date,
      doc.client?.name || "לא מוגדר",
      doc.status,
      Number(doc.subtotal),
      Number(doc.vat_amount),
      Number(doc.total_amount),
      doc.due_date,
      doc.notes || "",
    ])
  })

  // Auto-fit columns
  worksheet.columns.forEach((column) => {
    column.width = 15
  })

  // Add totals row
  const totalRow = worksheet.addRow([
    "",
    "",
    "",
    "",
    'סה"כ:',
    { formula: `SUM(F2:F${documents.length + 1})` },
    { formula: `SUM(G2:G${documents.length + 1})` },
    { formula: `SUM(H2:H${documents.length + 1})` },
    "",
    "",
  ])

  totalRow.font = { bold: true }
  totalRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE99781" },
  }
}

async function generateClientsReport(workbook, userId, startDate, endDate, filters) {
  const worksheet = workbook.addWorksheet("Clients Report")

  const headers = ["שם לקוח", "סוג לקוח", "ת.ז/ח.פ", "טלפון", "אימייל", "מספר מסמכים", 'סה"כ מחזור']

  worksheet.addRow(headers)

  // Style headers
  const headerRow = worksheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF26264F" },
  }
  headerRow.font = { color: { argb: "FFFFFFFF" }, bold: true }

  // Get clients with statistics
  const clients = await Client.findAll({
    where: { user_id: userId },
    include: [
      {
        model: Document,
        as: "documents",
        where: {
          issue_date: {
            [Op.between]: [startDate, endDate],
          },
        },
        attributes: [],
        required: false,
      },
    ],
    attributes: [
      "name",
      "client_type",
      "business_id",
      "phone",
      "email",
      [sequelize.fn("COUNT", sequelize.col("documents.id")), "documents_count"],
      [sequelize.fn("SUM", sequelize.col("documents.total_amount")), "total_amount"],
    ],
    group: ["Client.id"],
    order: [[sequelize.fn("SUM", sequelize.col("documents.total_amount")), "DESC"]],
    raw: true,
  })

  // Add data rows
  clients.forEach((client) => {
    worksheet.addRow([
      client.name,
      client.client_type === "business" ? "עסק" : "פרטי",
      client.business_id || "",
      client.phone || "",
      client.email || "",
      Number(client.documents_count) || 0,
      Number(client.total_amount) || 0,
    ])
  })

  worksheet.columns.forEach((column) => {
    column.width = 15
  })
}

async function generateServicesReport(workbook, userId, startDate, endDate, filters) {
  const worksheet = workbook.addWorksheet("Services Report")

  const headers = ["שם שירות", "קטגוריה", "מחיר בסיס", "פעמים בשימוש", 'סה"כ הכנסות', "מחיר ממוצע"]

  worksheet.addRow(headers)

  // Style headers
  const headerRow = worksheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF26264F" },
  }
  headerRow.font = { color: { argb: "FFFFFFFF" }, bold: true }

  // Get services with statistics
  const services = await Service.findAll({
    where: { user_id: userId },
    include: [
      {
        model: DocumentItem,
        as: "documentItems",
        include: [
          {
            model: Document,
            as: "document",
            where: {
              issue_date: {
                [Op.between]: [startDate, endDate],
              },
            },
            attributes: [],
          },
        ],
        attributes: [],
        required: false,
      },
    ],
    attributes: [
      "name",
      "category",
      "price",
      [sequelize.fn("COUNT", sequelize.col("documentItems.id")), "usage_count"],
      [sequelize.fn("SUM", sequelize.col("documentItems.total_price")), "total_revenue"],
      [sequelize.fn("AVG", sequelize.col("documentItems.unit_price")), "avg_price"],
    ],
    group: ["Service.id"],
    order: [[sequelize.fn("SUM", sequelize.col("documentItems.total_price")), "DESC"]],
    raw: true,
  })

  // Add data rows
  services.forEach((service) => {
    worksheet.addRow([
      service.name,
      service.category || "",
      Number(service.price),
      Number(service.usage_count) || 0,
      Number(service.total_revenue) || 0,
      Number(service.avg_price) || 0,
    ])
  })

  worksheet.columns.forEach((column) => {
    column.width = 15
  })
}

async function generateVATReport(workbook, userId, startDate, endDate, filters) {
  const worksheet = workbook.addWorksheet("VAT Report")

  const headers = ["חודש", "מספר מסמכים", 'מחזור ללא מע"מ', 'מע"מ', 'סה"כ כולל מע"מ']

  worksheet.addRow(headers)

  // Style headers
  const headerRow = worksheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF26264F" },
  }
  headerRow.font = { color: { argb: "FFFFFFFF" }, bold: true }

  // Get monthly VAT data
  const vatData = await Document.findAll({
    where: {
      user_id: userId,
      issue_date: {
        [Op.between]: [startDate, endDate],
      },
      document_type: {
        [Op.in]: ["חשבונית מס", "קבלה"],
      },
    },
    attributes: [
      [sequelize.fn("MONTH", sequelize.col("issue_date")), "month"],
      [sequelize.fn("COUNT", sequelize.col("id")), "documents_count"],
      [sequelize.fn("SUM", sequelize.col("subtotal")), "subtotal"],
      [sequelize.fn("SUM", sequelize.col("vat_amount")), "vat_amount"],
      [sequelize.fn("SUM", sequelize.col("total_amount")), "total_amount"],
    ],
    group: [sequelize.fn("MONTH", sequelize.col("issue_date"))],
    order: [[sequelize.fn("MONTH", sequelize.col("issue_date")), "ASC"]],
    raw: true,
  })

  const monthNames = [
    "ינואר",
    "פברואר",
    "מרץ",
    "אפריל",
    "מאי",
    "יוני",
    "יולי",
    "אוגוסט",
    "ספטמבר",
    "אוקטובר",
    "נובמבר",
    "דצמבר",
  ]

  // Add data rows
  vatData.forEach((data) => {
    worksheet.addRow([
      monthNames[data.month - 1],
      Number(data.documents_count),
      Number(data.subtotal),
      Number(data.vat_amount),
      Number(data.total_amount),
    ])
  })

  worksheet.columns.forEach((column) => {
    column.width = 15
  })

  // Add totals row
  const totalRow = worksheet.addRow([
    'סה"כ:',
    { formula: `SUM(B2:B${vatData.length + 1})` },
    { formula: `SUM(C2:C${vatData.length + 1})` },
    { formula: `SUM(D2:D${vatData.length + 1})` },
    { formula: `SUM(E2:E${vatData.length + 1})` },
  ])

  totalRow.font = { bold: true }
  totalRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE99781" },
  }
}

module.exports = {
  generateExcelReport,
}
