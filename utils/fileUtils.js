const fs = require("fs")
const path = require("path")

async function createUploadsDir() {
  const uploadsDir = path.join(process.cwd(), "uploads")
  const subdirs = ["pdfs", "backups", "temp"]

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true })
  }

  for (const subdir of subdirs) {
    const subdirPath = path.join(uploadsDir, subdir)
    if (!fs.existsSync(subdirPath)) {
      fs.mkdirSync(subdirPath, { recursive: true })
    }
  }
}

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function deleteFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      return true
    }
    return false
  } catch (error) {
    console.error("Delete file error:", error)
    return false
  }
}

module.exports = {
  createUploadsDir,
  ensureDirectoryExists,
  deleteFile,
}
