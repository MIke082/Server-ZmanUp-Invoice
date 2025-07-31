const fs = require("fs")
const path = require("path")
const { Client, Service, Document, DocumentItem, AllocationRequest } = require("../models")

async function createBackup(userId, backupData) {
  try {
    // Create backup directory if it doesn't exist
    const backupDir = path.join(process.cwd(), "backups", userId.toString())
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const filename = `backup_${timestamp}.json`
    const filePath = path.join(backupDir, filename)

    // Write backup data to file
    fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), "utf8")

    return {
      success: true,
      filename,
      file_path: filePath,
      size: fs.statSync(filePath).size,
      created_at: new Date().toISOString(),
    }
  } catch (error) {
    console.error("Create backup error:", error)
    return {
      success: false,
      error: error.message,
    }
  }
}

async function restoreBackup(userId, backupData, options, transaction) {
  try {
    const results = {
      clients: { created: 0, updated: 0, errors: 0 },
      services: { created: 0, updated: 0, errors: 0 },
      documents: { created: 0, updated: 0, errors: 0 },
    }

    // Restore clients
    if (options.restore_clients && backupData.clients) {
      for (const clientData of backupData.clients) {
        try {
          const existingClient = await Client.findOne({
            where: { user_id: userId, name: clientData.name },
            transaction,
          })

          if (existingClient) {
            await existingClient.update(
              {
                business_id: clientData.business_id,
                phone: clientData.phone,
                email: clientData.email,
                address: clientData.address,
                client_type: clientData.client_type,
                notes: clientData.notes,
              },
              { transaction },
            )
            results.clients.updated++
          } else {
            await Client.create(
              {
                user_id: userId,
                name: clientData.name,
                business_id: clientData.business_id,
                phone: clientData.phone,
                email: clientData.email,
                address: clientData.address,
                client_type: clientData.client_type,
                notes: clientData.notes,
              },
              { transaction },
            )
            results.clients.created++
          }
        } catch (error) {
          console.error("Client restore error:", error)
          results.clients.errors++
        }
      }
    }

    // Restore services
    if (options.restore_services && backupData.services) {
      for (const serviceData of backupData.services) {
        try {
          const existingService = await Service.findOne({
            where: { user_id: userId, name: serviceData.name },
            transaction,
          })

          if (existingService) {
            await existingService.update(
              {
                description: serviceData.description,
                price: serviceData.price,
                category: serviceData.category,
              },
              { transaction },
            )
            results.services.updated++
          } else {
            await Service.create(
              {
                user_id: userId,
                name: serviceData.name,
                description: serviceData.description,
                price: serviceData.price,
                category: serviceData.category,
                currency: serviceData.currency || "NIS",
              },
              { transaction },
            )
            results.services.created++
          }
        } catch (error) {
          console.error("Service restore error:", error)
          results.services.errors++
        }
      }
    }

    // Restore documents (more complex due to relationships)
    if (options.restore_documents && backupData.documents) {
      for (const documentData of backupData.documents) {
        try {
          // Check if document already exists
          const existingDocument = await Document.findOne({
            where: { user_id: userId, document_number: documentData.document_number },
            transaction,
          })

          if (!existingDocument) {
            // Find or create client
            let clientId = null
            if (documentData.client) {
              const client = await Client.findOne({
                where: { user_id: userId, name: documentData.client.name },
                transaction,
              })
              clientId = client?.id
            }

            // Create document
            const newDocument = await Document.create(
              {
                user_id: userId,
                client_id: clientId,
                document_number: documentData.document_number,
                document_type: documentData.document_type,
                status: documentData.status,
                issue_date: documentData.issue_date,
                due_date: documentData.due_date,
                subtotal: documentData.subtotal,
                vat_rate: documentData.vat_rate,
                vat_amount: documentData.vat_amount,
                total_amount: documentData.total_amount,
                currency: documentData.currency,
                notes: documentData.notes,
              },
              { transaction },
            )

            // Create document items
            if (documentData.items) {
              for (const itemData of documentData.items) {
                await DocumentItem.create(
                  {
                    document_id: newDocument.id,
                    description: itemData.description,
                    quantity: itemData.quantity,
                    unit_price: itemData.unit_price,
                    total_price: itemData.total_price,
                    sort_order: itemData.sort_order,
                  },
                  { transaction },
                )
              }
            }

            results.documents.created++
          } else {
            results.documents.updated++
          }
        } catch (error) {
          console.error("Document restore error:", error)
          results.documents.errors++
        }
      }
    }

    return {
      success: true,
      results,
    }
  } catch (error) {
    console.error("Restore backup error:", error)
    return {
      success: false,
      error: error.message,
    }
  }
}

async function uploadToCloud(filePath, cloudSettings) {
  try {
    // Mock cloud upload - in real implementation this would integrate with
    // Google Drive, Dropbox, etc. based on cloudSettings.provider

    console.log(`Uploading backup to ${cloudSettings.provider}:`, filePath)

    // Simulate upload delay
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Mock successful upload
    return {
      success: true,
      provider: cloudSettings.provider,
      cloud_url: `https://${cloudSettings.provider}.com/backups/${path.basename(filePath)}`,
      uploaded_at: new Date().toISOString(),
    }
  } catch (error) {
    console.error("Cloud upload error:", error)
    return {
      success: false,
      error: error.message,
    }
  }
}

module.exports = {
  createBackup,
  restoreBackup,
  uploadToCloud,
}
