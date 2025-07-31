const express = require("express")
const { User } = require("../models")
const { sendEmail } = require("../services/notificationService")
const { Op } = require("sequelize")
const nodemailer = require("nodemailer")
const crypto = require("crypto")
const { sequelize } = require("../models") // убедись, что у тебя доступен sequelize
const { invitationTranslations, registrationErrorTranslations } = require("../utils/translations")
const { Accountant } = require("../models")

const router = express.Router()

// ✅ POST /accountant/invite-client
router.post("/invite-client", async (req, res) => {
    const t = await sequelize.transaction()

    try {
        const accountantId = req.user?.id
        const accountant = await Accountant.findByPk(accountantId)

        const accountantName = accountant
            ? `${accountant.firstName || ""} ${accountant.lastName || ""}`.trim()
            : "ZmanUp"

        const {
            email,
            firstName,
            lastName,
            businessName,
            businessId,
            businessType,
            language = "he",
            phone
        } = req.body

        const lang = registrationErrorTranslations[language] ? language : "en"
        const tErrors = registrationErrorTranslations[lang]
        const tInvitation = invitationTranslations[lang]

        if (!email || !firstName || !lastName || !businessId || !businessType || !phone) {
            return res.status(400).json({ error: "Missing required fields" })
        }

        const existingEmail = await User.findOne({ where: { email } })
        if (existingEmail) {
            return res.status(409).json({ error: tErrors.emailExists })
        }

        const existingPhone = await User.findOne({ where: { phone } })
        if (existingPhone) {
            return res.status(409).json({ error: tErrors.phoneExists })
        }

        const activationToken = crypto.randomUUID()
        const tempPassword = Math.floor(100000 + Math.random() * 900000).toString()

        const newUser = await User.create({
            email,
            first_name: firstName,
            last_name: lastName,
            business_name: businessName,
            business_id: businessId,
            business_type: businessType,
            phone,
            password: tempPassword,
            role: "user",
            is_active: false,
            accountant_id: accountantId,
            activation_token: activationToken,
            settings: {
                language,
                notifications: {
                    email: true,
                    pushNotification: true,
                    whatsapp: false,
                },
                backup: {
                    enabled: true,
                    provider: "google_drive",
                },
            },
        }, { transaction: t })

        const link = `https://app.zmanup.com/invite/accept?token=${activationToken}`

        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: process.env.SMTP_SECURE === "true",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        })

        const subject = tInvitation.subject(accountantName)
        const html = tInvitation.html(tempPassword, link)

        await transporter.sendMail({
            from: process.env.EMAIL_SUPPORT,
            to: email,
            subject,
            html,
        })

        await t.commit()
        console.log("✅ Новый пользователь создан и письмо отправлено:", newUser.toJSON())

        return res.status(200).json({ success: true, message: "Invitation sent" })

    } catch (error) {
        await t.rollback()

        const lang = req.body.language || "en"
        const tErrors = registrationErrorTranslations[lang] || registrationErrorTranslations["en"]

        if (error.name === "SequelizeUniqueConstraintError") {
            const field = error.errors?.[0]?.path
            let message = tErrors.generic

            if (field === "email") message = tErrors.emailExists
            if (field === "phone") message = tErrors.phoneExists

            return res.status(409).json({ error: message })
        }

        console.error("❌ Ошибка при создании пользователя или отправке письма:", error)
        return res.status(500).json({ error: tErrors.generic })
    }
})


// POST /invitations/activate - Activate invitation and set password
router.post("/activate", async (req, res) => {
    try {
        const { token, password, business_id, phone, address } = req.body

        if (!token || !password) {
            return res.status(400).json({ error: "Token and password are required" })
        }

        if (password.length < 6) {
            return res.status(400).json({ error: "Password must be at least 6 characters long" })
        }

        // Find user with valid invitation token
        const user = await User.findOne({
            where: {
                activation_token: token,
                invitation_expires: {
                    [Op.gt]: new Date(),
                },
                password: null, // Only non-activated users
            },
            include: [
                {
                    model: User,
                    as: "accountant",
                    attributes: ["id", "firstName", "lastName", "business_name", "email"],
                },
            ],
        })

        if (!user) {
            return res.status(400).json({ error: "Invalid or expired invitation token" })
        }

        // Update user with password and optional details
        const updateData = {
            password,
            is_active: true,
            invitation_token: null,
            invitation_expires: null,
            last_login: new Date(),
        }

        if (business_id) updateData.business_id = business_id
        if (phone) updateData.phone = phone
        if (address) updateData.address = address

        await user.update(updateData)

        // Notify accountant that client has activated
        if (user.accountant) {
            await sendEmail(user.accountant.email, "client_activated", {
                accountant_name: user.accountant.getFullName(),
                client_name: user.firstName || user.business_name,
                client_email: user.email,
                client_business: user.business_name,
            })
        }

        res.json({
            success: true,
            message: "Account activated successfully",
            user: user.toJSON(),
        })
    } catch (error) {
        console.error("Activate invitation error:", error)
        res.status(500).json({ error: "Failed to activate invitation" })
    }
})

// GET /invitations/verify/:token - Verify invitation token
router.get("/verify/:token", async (req, res) => {
    try {
        const user = await User.findOne({
            where: {
                invitation_token: req.params.token,
                invitation_expires: {
                    [Op.gt]: new Date(),
                },
                password: null,
            },
            attributes: ["id", "email", "firstName", "lastName", "business_name", "business_type", "preferred_language"],
            include: [
                {
                    model: User,
                    as: "accountant",
                    attributes: ["firstName", "lastName", "business_name"],
                },
            ],
        })

        if (!user) {
            return res.status(400).json({ error: "Invalid or expired invitation token" })
        }

        res.json({
            success: true,
            data: {
                user: user.toJSON(),
                accountant: user.accountant,
            },
        })
    } catch (error) {
        console.error("Verify invitation error:", error)
        res.status(500).json({ error: "Failed to verify invitation" })
    }
})

module.exports = router
