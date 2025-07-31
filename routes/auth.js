const express = require("express")
const jwt = require("jsonwebtoken")
const { User, Accountant, DeletedUser } = require("../models")
const { authenticateToken, authMiddleware } = require("../middleware/auth")
const { logAudit } = require("../utils/auditLogger")
const nodemailer = require("nodemailer")
const { ResetCode } = require("../models")
const { OAuth2Client } = require("google-auth-library")

const router = express.Router()

// POST /auth/login - вход
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" })
    }

    // Пробуем найти обычного пользователя
    let user = await User.findOne({ where: { email, is_active: true } })

    if (user && (await user.validatePassword(password))) {
      await user.update({ last_login: new Date() })

      const token = jwt.sign(
        {
          userId: user.id,
          businessType: user.business_type,
          role: "user",
        },
        process.env.JWT_SECRET || "your-secret-key",
        { expiresIn: "7d" }
      )

      return res.json({
        success: true,
        token,
        user: user.toJSON(),
      })
    }

    // Если не найден — пробуем найти бухгалтера
    const accountant = await Accountant.findOne({ where: { email, is_active: true } })

    if (accountant && (await accountant.validatePassword(password))) {
      await accountant.update({ last_login: new Date() })

      const token = jwt.sign(
        {
          userId: accountant.id,
          role: "accountant",
        },
        process.env.JWT_SECRET || "your-secret-key",
        { expiresIn: "7d" }
      )

      return res.json({
        success: true,
        token,
        user: accountant.toJSON(),
      })
    }

    // Если никого не нашли
    return res.status(401).json({ error: "Invalid credentials" })

  } catch (error) {
    console.error("Login error:", error)
    res.status(500).json({ error: "Login failed" })
  }
})

// POST /auth/logout - выход
router.post("/logout", authenticateToken, async (req, res) => {
  try {
    await logAudit(req.user.id, "logout", "user", req.user.id, {}, req)
    res.json({ success: true, message: "Logged out successfully" })
  } catch (error) {
    console.error("Logout error:", error)
    res.status(500).json({ error: "Logout failed" })
  }
})

// GET /auth/me - получение текущего пользователя по токену
router.get("/me", authenticateToken, async (req, res) => {
  try {
    res.json({
      success: true,
      user: req.user.toJSON(),
    })
  } catch (error) {
    console.error("Get user error:", error)
    res.status(500).json({ error: "Failed to get user info" })
  }
})

// POST /auth/register - регистрация
router.post("/register", async (req, res) => {
  try {
    const {
      phone,
      password,
      first_name,
      last_name,
      business_name,
      business_id,
      business_type,
      email,
      address,
      city,
      zip_code,
      start_receipt_number,
      website
    } = req.body

    if (!phone || !password || !first_name || !last_name || !business_name || !business_id || !business_type) {
      return res.status(400).json({
        error: "Missing required fields: phone, password, first name, last name, business name, business ID, or business type",
      })
    }

    const existingUser = await User.findOne({ where: { phone } })
    if (existingUser) {
      return res.status(409).json({ error: "User with this phone already exists" })
    }

    const user = await User.create({
      phone,
      password,
      first_name,
      last_name,
      business_name,
      business_id,
      business_type,
      email,
      address,
      city,
      zip_code,
      start_receipt_number,
      website
    })

    const token = jwt.sign(
      {
        userId: user.id,
        businessType: user.business_type,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "7d",
      },
    )

    // PUT /auth/update - обновление данных пользователя
    router.put("/update", authenticateToken, async (req, res) => {
      try {
        const user = await User.findByPk(req.user.id)
        if (!user) {
          return res.status(404).json({ error: "User not found" })
        }

        const allowedFields = [
          "first_name",
          "last_name",
          "business_name",
          "business_id",
          "business_type",
          "email",
          "address",
          "city",
          "zip_code",
          "start_receipt_number"
        ]

        const updates = {}
        allowedFields.forEach(field => {
          if (req.body[field] !== undefined) {
            updates[field] = req.body[field]
          }
        })

        await user.update(updates)

        await logAudit(user.id, "update_user", "user", user.id, updates, req)

        res.json({ success: true, user: user.toJSON() })
      } catch (error) {
        console.error("Update user error:", error)
        res.status(500).json({ error: "Failed to update user info" })
      }
    })


    await logAudit(user.id, "register", "user", user.id, {}, req)

    res.status(201).json({
      success: true,
      token,
      user: user.toJSON(),
    })
  } catch (error) {
    console.error("Registration error:", error)
    res.status(500).json({ error: "Registration failed" })
  }
})

// PUT /auth/update - обновление данных пользователя
router.put("/update", authenticateToken, async (req, res) => {
  console.log(req.user, "req.user")

  try {
    const user = await User.findByPk(req.user.id)
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    const allowedFields = [
      "firstName",
      "lastName",
      "phone",
      "businessName",
      "businessId",
      "businessType",
      "email",
      "address",
      "city",
      "zip_code",
      "startReceiptNumber",
      "website",
      "settings",
    ]

    const updates = {}

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        const snakeCaseField = field.replace(/([A-Z])/g, "_$1").toLowerCase()
        updates[snakeCaseField] = req.body[field]
      }
    })

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "אין שדות לעדכן" })
    }

    await user.update(updates)

    await logAudit(user.id, "update_user", "user", user.id, updates, req)

    res.json({ success: true, user: user.toJSON() })
  } catch (error) {
    console.error("Update user error:", error)
    res.status(500).json({ error: "Failed to update user info" })
  }
})

router.post("/change-password", authenticateToken, async (req, res) => {
  try {
    const userId = req.body.userId || req.query.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" })
    }

    const { currentPassword, newPassword } = req.body
    const user = await User.findByPk(userId)

    const isValid = await user.validatePassword(currentPassword)
    if (!isValid) {
      return res.status(400).json({ error: "Current password is incorrect" })
    }

    await user.update({ password: newPassword }) // если используешь hash в beforeUpdate

    await logAudit(user.id, "change_password", "user", user.id, {}, req)

    res.json({ success: true })
  } catch (err) {
    console.error("Password update error:", err)
    res.status(500).json({ error: "Failed to update password" })
  }
})

// POST /auth/social-login
router.post("/social-login", async (req, res) => {
  try {
    const { provider, socialData } = req.body

    if (!provider || !socialData) {
      return res.status(400).json({ error: "Provider and social data are required" })
    }

    const { email, name, firstName, lastName, id: socialId, picture } = socialData

    if (!email) {
      return res.status(400).json({ error: "Email is required from social provider" })
    }

    // Check if user already exists
    let user = await User.findOne({ where: { email } })

    if (user) {
      // Update social login info
      await user.update({
        last_login: new Date(),
        [`${provider}_id`]: socialId,
        profile_picture: picture || user.profile_picture,
      })
    } else {
      // Create new user from social data
      user = await User.create({
        email,
        business_name: name || `${firstName} ${lastName}` || "חברה חדשה",
        business_id: "000000000", // Will need to be updated by user
        business_type: "patur",
        phone: null,
        password: Math.random().toString(36).slice(-8), // Random password for social users
        [`${provider}_id`]: socialId,
        profile_picture: picture,
        is_social_user: true,
        social_provider: provider,
        last_login: new Date(),
      })
    }

    const token = jwt.sign(
      {
        userId: user.id,
        businessType: user.business_type,
        role: user.role,
      },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "7d" },
    )

    res.json({
      success: true,
      token,
      user: user.toJSON(),
      isNewUser: !user.business_id || user.business_id === "000000000",
    })
  } catch (error) {
    console.error("Social login error:", error)
    res.status(500).json({ error: "Social login failed" })
  }
})

const resetCodes = new Map()

// ✅ Отправка кода на email
router.post("/send-reset-code", async (req, res) => {
  try {
    const { email } = req.body
    if (!email) return res.status(400).json({ error: "Email is required" })

    const code = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 минут

    // Удалить предыдущие коды
    await ResetCode.destroy({ where: { email } })

    // Сохранить новый код
    await ResetCode.create({ email, code, expiresAt })

    // Отправить email
    // const transporter = nodemailer.createTransport({
    //   host: process.env.SMTP_HOST,
    //   port: process.env.SMTP_PORT,
    //   secure: process.env.SMTP_SECURE === "true",
    //   auth: {
    //     user: process.env.EMAIL_USER,
    //     pass: process.env.EMAIL_PASS,
    //   },
    // })

    // const html = `
    //   <div dir="rtl" style="font-family: Arial; color: #333;">
    //     <h2 style="color: #26264F;">ZmanUp - קוד לאיפוס סיסמה</h2>
    //     <p>הקוד שלך:</p>
    //     <h1 style="letter-spacing: 4px;">${code}</h1>
    //     <p>הקוד בתוקף ל־10 דקות.</p>
    //   </div>
    // `

    // await transporter.sendMail({
    //   from: process.env.EMAIL_SUPPORT,
    //   to: email,
    //   subject: "ZmanUp - קוד לאיפוס סיסמה",
    //   html,
    // })

    console.log(`📨 קוד נשלח ל־${email}: ${code}`)
    res.json({ success: true })
  } catch (err) {
    console.error("❌ send-reset-code error:", err)
    res.status(500).json({ error: "שגיאה בשליחת קוד" })
  }
})

// ✅ Проверка кода и выдача токена с логами
router.post("/verify-reset-code", async (req, res) => {
  try {
    const { email, code } = req.body

    console.log("📥 Получен запрос на /verify-reset-code")
    console.log("🔹 Email:", email)
    console.log("🔹 Code:", code)

    if (!email || !code) {
      console.warn("⚠️ Email или код отсутствует")
      return res.status(400).json({ error: "Email and code are required" })
    }

    const record = await ResetCode.findOne({ where: { email } })
    console.log("🔍 Найденная запись в ResetCode:", record)

    if (!record) {
      console.warn("⚠️ Код не найден для email:", email)
      return res.status(400).json({ error: "לא נמצא קוד עבור אימייל זה" })
    }

    const now = new Date()
    console.log("🕒 Текущее время:", now)
    console.log("📅 Время истечения кода:", record.expiresAt)

    if (now > record.expiresAt) {
      console.warn("⚠️ Код истёк для email:", email)
      await record.destroy()
      console.log("🗑️ Просроченный код удалён")
      return res.status(400).json({ error: "הקוד פג תוקף" })
    }

    console.log("🔐 Сравнение кодов: полученный =", code, ", сохранённый =", record.code)

    if (record.code !== code) {
      console.warn("❌ Введён неправильный код")
      return res.status(400).json({ error: "קוד שגוי" })
    }

    const token = jwt.sign(
      {
        email,
        type: "reset-password",
      },
      process.env.JWT_SECRET || "defaultsecret",
      { expiresIn: "15m" }
    )

    await record.destroy()
    console.log("✅ Код подтверждён, запись удалена")
    console.log("🔑 Выдан токен:", token)

    res.json({ token })
  } catch (err) {
    console.error("❌ Ошибка в /verify-reset-code:", err)
    res.status(500).json({ error: "שגיאה באימות קוד" })
  }
})

router.post("/auth/social-login", async (req, res) => {
  try {
    const { provider, socialData } = req.body

    if (provider !== "google") {
      return res.status(400).json({ error: "Unsupported provider" })
    }

    const client = new OAuth2Client() // без clientId, т.к. мы просто проверяем
    const ticket = await client.verifyIdToken({
      idToken: socialData.idToken,
      audience: process.env.GOOGLE_CLIENT_ID, // или просто без проверки, если доверяешь frontend
    })

    const payload = ticket.getPayload()
    const email = payload.email

    let user = await User.findOne({ where: { email } })

    if (!user) {
      user = await User.create({
        email,
        first_name: payload.given_name,
        last_name: payload.family_name,
        profile_picture: payload.picture,
        provider: "google",
      })
    }

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "7d" })

    return res.json({ token, user })
  } catch (error) {
    console.error("Social login error:", error)
    return res.status(500).json({ error: "Google login failed" })
  }
})

router.delete("/delete", authenticateToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id)

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    // 1. Деактивируем пользователя
    await user.update({ is_active: false })

    // 2. Сохраняем удалённого пользователя
    await DeletedUser.create({
      user_id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      phone: user.phone,
      business_name: user.business_name,
      last_login: user.last_login,
      reason: "User requested deletion",
      snapshot: user.toJSON(),
    })

    return res.json({ success: true })
  } catch (error) {
    console.error("❌ Delete user error:", error)
    res.status(500).json({ error: "Failed to deactivate user" })
  }
})

module.exports = router
