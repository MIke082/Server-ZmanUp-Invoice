const puppeteer = require("puppeteer")
const path = require("path")
const fs = require("fs")

async function generatePDF(document, user) {
    const date = new Date().toISOString().split("T")[0]; // Например: "2025-07-08"
    const pdfDir = path.join(process.cwd(), "uploads", "pdfs", user.id.toString(), date);

    try {
        // Создаем директорию, если не существует
        if (!fs.existsSync(pdfDir)) {
            fs.mkdirSync(pdfDir, { recursive: true });
        }

        const filename = `document_${document.id}_${Date.now()}.pdf`;
        const filePath = path.join(pdfDir, filename);

        // Генерация HTML-шаблона
        const htmlContent = generateDocumentHTML(document, user);

        const browser = await puppeteer.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });

        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: "networkidle0" });

        await page.pdf({
            path: filePath,
            format: "A4",
            printBackground: true,
            margin: {
                top: "20mm",
                right: "15mm",
                bottom: "20mm",
                left: "15mm",
            },
        });

        await browser.close();

        // Возвращаем относительный путь
        return `uploads/pdfs/${user.id}/${date}/${filename}`;
    } catch (error) {
        console.error("❌ PDF generation error:", error);
        throw new Error("Failed to generate PDF");
    }
}

function generateDocumentHTML(document, user, logoUrl = "") {
  const items = document.items || []
  const client = document.client || {}
  const payment = document.payment_method || "אחר"
  const vatRate = (document.vat_rate || 0) * 100

  const safeNumber = (val) => isNaN(Number(val)) ? 0 : Number(val)

  const subtotal = safeNumber(document.subtotal)
  const vatAmount = safeNumber(document.vat_amount)
  const totalWithVat = safeNumber(document.total_amount)

  const mainColor = "#E99781"

  return `
  <html lang="he" dir="rtl">
    <head>
      <meta charset="UTF-8" />
      <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;700&display=swap" rel="stylesheet" />
    </head>
    <body style="font-family: 'Heebo', sans-serif; padding: 40px; direction: rtl; background: white; font-size: 14px; color: #26264F;">
      <div style="border: 2px solid ${mainColor}; border-radius: 12px; padding: 30px;">

        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          ${logoUrl ? `<img src="${logoUrl}" alt="Logo" style="max-height: 60px;" />` : ''}
          <div style="font-size: 20px; font-weight: bold; color: ${mainColor};">${document.document_type} ${document.document_number}</div>
        </div>

        <!-- Business + Client (One Line) -->
        <div style="display: flex; justify-content: space-between; background-color: #fff3f0; border: 1px solid ${mainColor}; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <!-- Business Info (Right) -->
          <div style="text-align: right; width: 48%;">
            ${
              user.business_type === "patur" || user.business_type === "morsheh"
                ? `
                <div style="font-size: 22px; font-weight: bold;">
                  ${user.first_name || ""} ${user.last_name || ""}
                </div>
                <div>עוסק ${user.business_type === "patur" ? "פטור" : "מורשה"} ח.פ ${user.business_id}</div>
              `
                : `
                <div style="font-size: 22px; font-weight: bold; text-transform: uppercase;">
                  ${user.business_name || ""}
                </div>
                <div>ח.פ ${user.business_id}</div>
              `
            }
            ${user.address ? `<div><strong>כתובת:</strong> ${user.address}</div>` : ""}
            ${user.phone ? `<div><strong>טלפון:</strong> ${user.phone}</div>` : ""}
            ${user.email ? `<div><strong>אימייל:</strong> ${user.email}</div>` : ""}
          </div>

          <!-- Client Info (Left) -->
          <div style="text-align: left; width: 48%;">
            <div><strong>לקוח:</strong> ${client.firstName || ""} ${client.lastName || ""}</div>
            ${client.business_id ? `<div><strong>ת.ז / ח.פ:</strong> ${client.business_id}</div>` : ""}
            ${client.phone ? `<div><strong>טלפון:</strong> ${client.phone}</div>` : ""}
            ${client.address ? `<div><strong>כתובת:</strong> ${client.address}</div>` : ""}
            <div><strong>תאריך הוצאה:</strong> ${new Date(document.due_date).toLocaleDateString("he-IL")}</div>
          </div>
        </div>

        <!-- Receipt Number -->
        <div style="font-size: 16px; font-weight: bold; color: ${mainColor}; margin-bottom: 10px;">
          מספר קבלה: ${document.document_number}
        </div>

        <!-- Items Table -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background-color: ${mainColor}; color: white;">
              <th style="padding: 12px; border: 1px solid ${mainColor};">מק"ט</th>
              <th style="padding: 12px; border: 1px solid ${mainColor};">פירוט</th>
              <th style="padding: 12px; border: 1px solid ${mainColor};">מחיר ליח'</th>
              <th style="padding: 12px; border: 1px solid ${mainColor};">כמות</th>
              <th style="padding: 12px; border: 1px solid ${mainColor};">סה"כ</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item, i) => `
              <tr style="background-color: ${i % 2 === 0 ? '#fff' : '#fff6f3'};">
                <td style="padding: 10px; border: 1px solid #ccc; text-align: center;">${item.service_id || 1000 + i}</td>
                <td style="padding: 10px; border: 1px solid #ccc; text-align: center;">${item.description || ""}</td>
                <td style="padding: 10px; border: 1px solid #ccc; text-align: center;">₪${safeNumber(item.unit_price).toFixed(2)}</td>
                <td style="padding: 10px; border: 1px solid #ccc; text-align: center;">${safeNumber(item.quantity)}</td>
                <td style="padding: 10px; border: 1px solid #ccc; text-align: center;">₪${safeNumber(item.total_price).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <!-- Totals -->
        <div style="margin-top: 30px; border-top: 1px dashed ${mainColor}; padding-top: 20px;">
          <table style="width: 100%;">
            <tr>
              <td style="text-align: right;">סה"כ ביניים:</td>
              <td style="text-align: left;">₪${subtotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td style="text-align: right;">מע"מ (${vatRate}%):</td>
              <td style="text-align: left;">₪${vatAmount.toFixed(2)}</td>
            </tr>
            <tr style="background-color: ${mainColor}33; font-size: 18px; font-weight: bold;">
              <td style="text-align: right;">סה"כ לתשלום:</td>
              <td style="text-align: left;">₪${totalWithVat.toFixed(2)}</td>
            </tr>
            <tr>
              <td style="text-align: right;">אמצעי תשלום:</td>
              <td style="text-align: left;">${payment === 'card' ? 'כרטיס אשראי' : payment === 'cash' ? 'מזומן' : 'אחר'}</td>
            </tr>
          </table>
        </div>

        <!-- Footer -->
        <div style="margin-top: 220px; display: flex; justify-content: space-between; align-items: flex-start; font-size: 12px; color: #666; border-top: 1px solid #ccc; padding-top: 15px;">
          <div style="text-align: right;">
            <div>חתימה דיגיטלית מאובטחת</div>
            <div>מסמך ממוחשב</div>
            <div>הופק על ידי זמןאפ</div>
          </div>
          <div style="text-align: left;">
            <div>קבלה ${document.document_number}</div>
            <div>עמוד 1 מתוך 1</div>
          </div>
        </div>

      </div>
    </body>
  </html>
  `
}

module.exports = {
    generatePDF,
}
