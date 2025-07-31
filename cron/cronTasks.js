const cron = require("node-cron")
const { getLastMonth } = require("../utils/dateUtils")
const { sendMonthlyReports } = require("../services/sendMonthlyReports")

function startMonthlyReportCron() {
    cron.schedule("0 8 1 * *", async () => {
        try {
            const { year, month } = getLastMonth()
            const result = await sendMonthlyReports({ year, month })
            console.log("📩 Monthly reports sent:", result)
        } catch (err) {
            console.error("❌ Failed to send monthly reports:", err)
        }
    })

    console.log("🕒 Cron job for monthly reports scheduled")
}

module.exports = startMonthlyReportCron
