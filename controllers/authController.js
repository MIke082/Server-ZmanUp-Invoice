const bcrypt = require("bcrypt")
const { User } = require("../models") // или путь, по которому у тебя находится модель User
const { logAudit } = require("../utils/auditLogger") // или актуальный путь

exports.updateProfile = async (req, res) => {
    try {
        const allowedFields = [
            "firstName",
            "lastName",
            "email",
            "phone",
            "address",
            "city",
            "zip_code",
            "businessName",
            "businessId",
            "businessType",
            "startReceiptNumber",
            "website"
        ]

        const updateData = {}

        for (const key of allowedFields) {
            if (req.body[key] !== undefined) {
                const dbKey = key.replace(/([A-Z])/g, "_$1").toLowerCase()
                updateData[dbKey] = req.body[key]
            }
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ error: "אין שדות לעדכן" })
        }

        const user = await User.findByPk(req.user.id)
        if (!user) {
            return res.status(404).json({ error: "User not found" })
        }

        await user.update(updateData)
        await logAudit(user.id, "update_user", "user", user.id, updateData, req)

        res.json({ success: true, user: user.toJSON() })
    } catch (err) {
        console.error("❌ updateProfile error:", err)
        res.status(500).json({ error: "שגיאה בעדכון המשתמש" })
    }
}
exports.changePassword = async (req, res) => {
    try {
        const userId = req.user.id
        const { currentPassword, newPassword } = req.body

        const user = await User.findByPk(userId)
        if (!user) return res.status(404).json({ error: "משתמש לא נמצא" })

        const isMatch = await bcrypt.compare(currentPassword, user.password)
        if (!isMatch) return res.status(400).json({ error: "הסיסמה הנוכחית שגויה" })

        const hashedPassword = await bcrypt.hash(newPassword, 12)
        await user.update({ password: hashedPassword })

        return res.json({ message: "הסיסמה עודכנה בהצלחה" })
    } catch (error) {
        console.error("❌ Change password failed:", error)
        return res.status(500).json({ error: "שגיאה בשרת" })
    }
}

// module.exports = {
//     updateProfile,
//     changePassword
// }
