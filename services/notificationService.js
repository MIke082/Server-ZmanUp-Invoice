const nodemailer = require('nodemailer');
const axios = require("axios")

// Email configuration
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

async function sendEmail(to, template, data) {
  try {
    const emailContent = generateEmailContent(template, data)

    const mailOptions = {
      from: process.env.SMTP_FROM || "noreply@zmanup.com",
      to,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    }

    const result = await emailTransporter.sendMail(mailOptions)

    return {
      success: true,
      messageId: result.messageId,
      response: result.response,
    }
  } catch (error) {
    console.error("Email send error:", error)
    return {
      success: false,
      error: error.message,
    }
  }
}

async function sendWhatsAppMessage(phone, template, data) {
  try {
    // This would integrate with WhatsApp Business API
    // For now, we simulate the request

    const message = generateWhatsAppMessage(template, data)

    // Mock WhatsApp API call
    console.log(`Sending WhatsApp to ${phone}:`, message)

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Mock successful response (95% success rate)
    const isSuccess = Math.random() > 0.05

    if (isSuccess) {
      return {
        success: true,
        messageId: `WA${Date.now()}`,
        status: "sent",
      }
    } else {
      return {
        success: false,
        error: "WhatsApp delivery failed",
      }
    }
  } catch (error) {
    console.error("WhatsApp send error:", error)
    return {
      success: false,
      error: error.message,
    }
  }
}

function generateEmailContent(template, data) {
  switch (template) {
    case "payment_reminder":
      return {
        subject: `תזכורת תשלום - ${data.document_type} ${data.document_number}`,
        html: `
          <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: #26264F; color: white; padding: 20px; text-align: center;">
              <h1>תזכורת תשלום</h1>
              <p>מאת: ${data.business_name}</p>
            </div>
            
            <div style="padding: 20px; background-color: #f9f9f9;">
              <h2>שלום ${data.client_name},</h2>
              
              <p>אנו מזכירים לך כי ${data.document_type} מספר <strong>${data.document_number}</strong> 
              בסכום של <strong>₪${Number(data.amount).toLocaleString()}</strong> 
              ${data.due_date ? `עם תאריך פירעון ${new Date(data.due_date).toLocaleDateString("he-IL")}` : ""} 
              ממתין לתשלום.</p>
              
              ${data.custom_message ? `<p><strong>הודעה נוספת:</strong><br>${data.custom_message}</p>` : ""}
              
              <div style="background-color: #E99781; color: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin: 0;">פרטי התשלום:</h3>
                <p style="margin: 5px 0;">סכום לתשלום: ₪${Number(data.amount).toLocaleString()}</p>
                <p style="margin: 5px 0;">מספר מסמך: ${data.document_number}</p>
              </div>
              
              <p>לתשלום או לשאלות נוספות, אנא צור איתנו קשר.</p>
              
              <p>תודה,<br>${data.business_name}</p>
            </div>
            
            <div style="background-color: #26264F; color: white; padding: 10px; text-align: center; font-size: 12px;">
              <p>הודעה זו נשלחה באמצעות מערכת ZmanUp</p>
            </div>
          </div>
        `,
        text: `
תזכורת תשלום מאת ${data.business_name}

שלום ${data.client_name},

אנו מזכירים לך כי ${data.document_type} מספר ${data.document_number} 
בסכום של ₪${Number(data.amount).toLocaleString()} ממתין לתשלום.

${data.custom_message ? `הודעה נוספת: ${data.custom_message}` : ""}

לתשלום או לשאלות נוספות, אנא צור איתנו קשר.

תודה,
${data.business_name}
        `,
      }

    default:
      throw new Error("Unknown email template")
  }
}

function generateWhatsAppMessage(template, data) {
  switch (template) {
    case "payment_reminder":
      return `
🔔 *תזכורת תשלום*

שלום ${data.client_name},

${data.document_type} מספר *${data.document_number}*
סכום: *₪${Number(data.amount).toLocaleString()}*
${data.due_date ? `תאריך פירעון: ${new Date(data.due_date).toLocaleDateString("he-IL")}` : ""}

${data.custom_message ? `📝 ${data.custom_message}` : ""}

לתשלום או לשאלות נוספות, אנא צור איתנו קשר.

תודה,
${data.business_name}

_הודעה זו נשלחה באמצעות מערכת ZmanUp_
      `.trim()

    default:
      throw new Error("Unknown WhatsApp template")
  }
}

module.exports = {
  sendEmail,
  sendWhatsAppMessage,
}
