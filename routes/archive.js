const express = require("express")
const { Document, Client, Service, User, DocumentItem, AllocationRequest, sequelize } = require("../models")
const { createBackup, restoreBackup, uploadToCloud } = require("../services/backupService")
const { logAudit } = require("../utils/auditLogger")
const { Op } = require("sequelize")

const router = express.Router()

// POST /archive/backup - создать резервную копию
router.post("/backup", async (req, res) => {
  try {
    const { include_documents = true, include_clients = true, include_services = true, year } = req.body

    const backupData = {
      user: req.user.toJSON(),
      created_at: new Date().toISOString(),
      version: "1.0",
      filters: { year },
    }

    const whereClause = { user_id: req.user.id }

    if (year) {
      whereClause.issue_date = {
        [Op.between]: [`${year}-01-01`, `${year}-12-31`],
      }
    }

    // Документы
    if (include_documents) {
      const documents = await Document.findAll({
        where: whereClause,
        include: [
          {
            model: DocumentItem,
            as: "items",
          },
          {
            model: AllocationRequest,
            as: "allocationRequest",
          },
        ],
      })
      backupData.documents = documents
    }

    // Клиенты
    if (include_clients) {
      const clients = await Client.findAll({
        where: { user_id: req.user.id, is_active: true },
      })
      backupData.clients = clients
    }

    // Услуги
    if (include_services) {
      const services = await Service.findAll({
        where: { user_id: req.user.id, is_active: true },
      })
      backupData.services = services
    }

    // Создаем файл резервной копии
    const backupResult = await createBackup(req.user.id, backupData)

    if (backupResult.success) {
      // Загружаем в облако если настроено
      const cloudSettings = req.user.settings?.backup
      if (cloudSettings?.enabled && cloudSettings.provider) {
        const cloudResult = await uploadToCloud(backupResult.file_path, cloudSettings)
        backupResult.cloud_backup = cloudResult
      }

      await logAudit(
        req.user.id,
        "create_backup",
        "backup",
        null,
        { year, includes: { include_documents, include_clients, include_services } },
        req,
      )

      res.json({
        success: true,
        data: backupResult,
        message: "Backup created successfully",
      })
    } else {
      res.status(500).json({
        error: "Failed to create backup",
        details: backupResult.error,
      })
    }
  } catch (error) {
    console.error("Create backup error:", error)
    res.status(500).json({ error: "Failed to create backup" })
  }
})

// GET /archive/backups - список резервных копий
router.get("/backups", async (req, res) => {
  try {
    const fs = require("fs")
    const path = require("path")

    const backupDir = path.join(process.cwd(), "backups", req.user.id.toString())

    if (!fs.existsSync(backupDir)) {
      return res.json({
        success: true,
        data: [],
      })
    }

    const files = fs.readdirSync(backupDir)
    const backups = []

    for (const file of files) {
      if (file.endsWith(".json")) {
        const filePath = path.join(backupDir, file)
        const stats = fs.statSync(filePath)

        try {
          const content = fs.readFileSync(filePath, "utf8")
          const backupData = JSON.parse(content)

          backups.push({
            filename: file,
            created_at: backupData.created_at,
            size: stats.size,
            version: backupData.version,
            filters: backupData.filters,
            includes: {
              documents: !!backupData.documents,
              clients: !!backupData.clients,
              services: !!backupData.services,
            },
          })
        } catch (parseError) {
          console.error(`Error parsing backup file ${file}:`, parseError)
        }
      }
    }

    backups.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    res.json({
      success: true,
      data: backups,
    })
  } catch (error) {
    console.error("Get backups error:", error)
    res.status(500).json({ error: "Failed to fetch backups" })
  }
})

// GET /archive/download/:filename - скачать резервную копию
router.get("/download/:filename", async (req, res) => {
  try {
    const fs = require("fs")
    const path = require("path")

    const filename = req.params.filename
    if (!filename.endsWith(".json")) {
      return res.status(400).json({ error: "Invalid backup file" })
    }

    const filePath = path.join(process.cwd(), "backups", req.user.id.toString(), filename)

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Backup file not found" })
    }

    await logAudit(req.user.id, "download_backup", "backup", null, { filename }, req)

    res.setHeader("Content-Type", "application/json")
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)

    const fileStream = fs.createReadStream(filePath)
    fileStream.pipe(res)
  } catch (error) {
    console.error("Download backup error:", error)
    res.status(500).json({ error: "Failed to download backup" })
  }
})

// POST /archive/restore - восстановить из резервной копии
router.post("/restore", async (req, res) => {
  const transaction = await sequelize.transaction()

  try {
    const { filename, restore_documents = true, restore_clients = true, restore_services = true } = req.body

    if (!filename) {
      return res.status(400).json({ error: "Backup filename is required" })
    }

    const fs = require("fs")
    const path = require("path")

    const filePath = path.join(process.cwd(), "backups", req.user.id.toString(), filename)

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Backup file not found" })
    }

    const backupContent = fs.readFileSync(filePath, "utf8")
    const backupData = JSON.parse(backupContent)

    const restoreResult = await restoreBackup(
      req.user.id,
      backupData,
      {
        restore_documents,
        restore_clients,
        restore_services,
      },
      transaction,
    )

    if (restoreResult.success) {
      await transaction.commit()

      await logAudit(
        req.user.id,
        "restore_backup",
        "backup",
        null,
        { filename, options: { restore_documents, restore_clients, restore_services } },
        req,
      )

      res.json({
        success: true,
        data: restoreResult,
        message: "Data restored successfully from backup",
      })
    } else {
      await transaction.rollback()
      res.status(500).json({
        error: "Failed to restore backup",
        details: restoreResult.error,
      })
    }
  } catch (error) {
    await transaction.rollback()
    console.error("Restore backup error:", error)
    res.status(500).json({ error: "Failed to restore backup" })
  }
})

// DELETE /archive/backup/:filename - удалить резервную копию
router.delete("/backup/:filename", async (req, res) => {
  try {
    const fs = require("fs")
    const path = require("path")

    const filename = req.params.filename
    if (!filename.endsWith(".json")) {
      return res.status(400).json({ error: "Invalid backup file" })
    }

    const filePath = path.join(process.cwd(), "backups", req.user.id.toString(), filename)

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Backup file not found" })
    }

    fs.unlinkSync(filePath)

    await logAudit(req.user.id, "delete_backup", "backup", null, { filename }, req)

    res.json({
      success: true,
      message: "Backup deleted successfully",
    })
  } catch (error) {
    console.error("Delete backup error:", error)
    res.status(500).json({ error: "Failed to delete backup" })
  }
})

// GET /archive/settings - настройки архивирования
router.get("/settings", async (req, res) => {
  try {
    const settings = req.user.settings?.backup || {
      enabled: true,
      provider: "google_drive",
      auto_backup: false,
      backup_frequency: "monthly",
    }

    res.json({
      success: true,
      data: settings,
    })
  } catch (error) {
    console.error("Get archive settings error:", error)
    res.status(500).json({ error: "Failed to fetch archive settings" })
  }
})

// PUT /archive/settings - обновить настройки архивирования
router.put("/settings", async (req, res) => {
  try {
    const { enabled, provider, auto_backup, backup_frequency } = req.body

    const currentSettings = req.user.settings || {}
    const newBackupSettings = {
      ...currentSettings.backup,
      enabled: enabled !== undefined ? enabled : currentSettings.backup?.enabled,
      provider: provider || currentSettings.backup?.provider,
      auto_backup: auto_backup !== undefined ? auto_backup : currentSettings.backup?.auto_backup,
      backup_frequency: backup_frequency || currentSettings.backup?.backup_frequency,
    }

    await req.user.update({
      settings: {
        ...currentSettings,
        backup: newBackupSettings,
      },
    })

    await logAudit(req.user.id, "update_backup_settings", "user", req.user.id, newBackupSettings, req)

    res.json({
      success: true,
      data: newBackupSettings,
      message: "Backup settings updated successfully",
    })
  } catch (error) {
    console.error("Update archive settings error:", error)
    res.status(500).json({ error: "Failed to update archive settings" })
  }
})

module.exports = router
