const PDFMerger = require("pdf-merger-js").default
const path = require("path")
const fs = require("fs")
const { Document } = require("../models")
const { Op } = require("sequelize")

const generateMonthlyReportPDF = async (userId, year, month) => {
  try {
    const startDate = new Date(`${year}-${month}-01`)
    const endDate = new Date(year, month, 0, 23, 59, 59)

    const documents = await Document.findAll({
      where: {
        user_id: userId,
        issue_date: {
          [Op.between]: [startDate, endDate],
        },
        pdf_path: { [Op.ne]: null },
      },
    })

    console.log(`🔍 Найдено документов: ${documents.length}`)

    const pdfPaths = []

    for (const doc of documents) {
      const rawPath = doc.pdf_path
      const fullPath = path.join(__dirname, "..", rawPath)

      const exists = fs.existsSync(fullPath)

      if (exists) pdfPaths.push(fullPath)
    }

    if (pdfPaths.length === 0) {
      return null
    }

    const outputDir = path.join(__dirname, "..", "uploads", "reports")
    fs.mkdirSync(outputDir, { recursive: true })

    const mergedPdfFileName = `monthly_${userId}_${year}_${month}_${Date.now()}.pdf`
    const mergedPdfPath = path.join(outputDir, mergedPdfFileName)

    const merger = new PDFMerger()
    for (const filePath of pdfPaths) {
      await merger.add(filePath)
    }

    await merger.save(mergedPdfPath)

    return mergedPdfPath
  } catch (err) {
    console.error("❌ Ошибка при создании PDF-отчёта:", err)
    return null
  }
}

module.exports = { generateMonthlyReportPDF }
