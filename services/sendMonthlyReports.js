const path = require("path")
const fs = require("fs")
const nodemailer = require("nodemailer")
const { Op } = require("sequelize")
const { User, Document } = require("../models")
const { generateMonthlyReportPDF } = require("../services/generateMonthlyReportPDF")

require("dotenv").config()

async function sendMonthlyReports({ year, month }) {
    const users = await User.findAll({
        where: {
            is_active: true,
            email: { [Op.ne]: null },
        },
    })

    const usersToSend = users.filter(
        (u) => u.settings?.notifications?.email === true
    )

    let sent = 0

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL

    for (const user of usersToSend) {
        const pdfPath = await generateMonthlyReportPDF(user.id, year, month)
        console.log("PDF path for email:", pdfPath)
        console.log("File exists:", fs.existsSync(pdfPath))
        if (!pdfPath) continue

        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: process.env.SMTP_SECURE === "true",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        })

        const subject = `דו"ח חודשי - ${month}/${year}`
        const html = `
  <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.6; color: #333">
    <h2 style="color: #26264F;">ZmanUp-Invoices</h2>
    <p>שלום ${user.business_name || user.firstName},</p>
    <p>מצורף הדו"ח החודשי שלך עבור חודש ${month}/${year}.</p>
    <p>הדו"ח כולל את כל המסמכים שהופקו במהלך חודש ${month}/${year} במערכת.</p>
    <p>תודה שבחרת ב־<strong>ZmanUp</strong> לניהול העסק שלך 💙</p>
    <hr />
    <p style="font-size: 12px; color: #999;">ההודעה נשלחה אוטומטית ממערכת ZmanUp-Invoices. אין צורך להשיב.</p>
  </div>
`

        const attachment = {
            filename: path.basename(pdfPath),
            path: pdfPath,
        }

        // 1. Отправка пользователю
        await transporter.sendMail({
            from: process.env.EMAIL_SUPPORT,
            to: user.email,
            subject,
            html,
            attachments: [attachment],
        })
        console.log(`📤 דו"ח נשלח ל־${user.email}`)
        await sleep(3000)

        // 2. Отправка на адрес администратора (без пометки COPY)
        await transporter.sendMail({
            from: process.env.EMAIL_SUPPORT,
            to: ADMIN_EMAIL,
            subject,
            html,
            attachments: [attachment],
        })
        console.log(`📤 דו"ח также отправлен на ${ADMIN_EMAIL}`)
        await sleep(3000)

        // 3. Удалить PDF через 5 минут
        setTimeout(() => {
            if (fs.existsSync(pdfPath)) {
                fs.unlinkSync(pdfPath)
                console.log(`🗑️ Удалён файл: ${pdfPath}`)
            }
        }, 5 * 60 * 1000)

        sent++
    }

    return { success: true, sent }
}

module.exports = { sendMonthlyReports }
