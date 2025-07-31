const crypto = require("crypto")

const algorithm = "aes-256-cbc"
const key = crypto.createHash("sha256").update(String(process.env.ENCRYPTION_SECRET)).digest("base64").substr(0, 32)

// Encrypt: вернёт IV + encrypted string (в base64)
function encrypt(text) {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(algorithm, key, iv)
  let encrypted = cipher.update(text, "utf8", "base64")
  encrypted += cipher.final("base64")
  const ivBase64 = iv.toString("base64")
  return ivBase64 + ":" + encrypted
}

// Decrypt: разделяет IV и шифр
function decrypt(encryptedText) {
  const [ivBase64, encrypted] = encryptedText.split(":")
  if (!ivBase64 || !encrypted) throw new Error("Invalid encrypted text format")

  const iv = Buffer.from(ivBase64, "base64")
  const decipher = crypto.createDecipheriv(algorithm, key, iv)
  let decrypted = decipher.update(encrypted, "base64", "utf8")
  decrypted += decipher.final("utf8")
  return decrypted
}

module.exports = {
  encrypt,
  decrypt,
}
