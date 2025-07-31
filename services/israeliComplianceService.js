const { User, Document } = require("../models")

class IsraeliComplianceService {
  // Проверка возможности создания документа
  static async canCreateDocument(userId, documentType) {
    const user = await User.findByPk(userId)

    if (!user) {
      return { allowed: false, reason: "User not found" }
    }

    // עוסק פטור не может выдавать налоговые счета
    if (user.business_type === "patur" && documentType === "חשבונית מס") {
      return {
        allowed: false,
        reason: "עוסק פטור (освобожденный предприниматель) не может выдавать налоговые счета (חשבונית מס)",
      }
    }

    // Проверка заполненности обязательных полей
    const requiredFields = user.getRequiredFields()
    const missingFields = requiredFields.filter((field) => !user[field])

    if (missingFields.length > 0) {
      return {
        allowed: false,
        reason: `Необходимо заполнить обязательные поля: ${missingFields.join(", ")}`,
        missingFields,
      }
    }

    return { allowed: true }
  }

  // Получение доступных типов документов для пользователя
  static getAvailableDocumentTypes(businessType) {
    const allTypes = [
      { value: "הצעת מחיר", label: "הצעת מחיר", labelRu: "Коммерческое предложение" },
      { value: "הזמנת עבודה", label: "הזמנת עבודה", labelRu: "Заказ на работу" },
      { value: "חשבונית עסקה", label: "חשבונית עסקה", labelRu: "Деловой счет" },
      { value: "קבלה", label: "קבלה", labelRu: "Квитанция" },
      { value: "זיכוי", label: "זיכוי", labelRu: "Кредит-нота" },
    ]

    // עוסק מורשה и בע"מ могут создавать налоговые счета
    if (businessType === "morsheh" || businessType === "baam") {
      allTypes.push({
        value: "חשבונית מס",
        label: "חשבונית מס",
        labelRu: "Налоговый счет",
      })
    }

    return allTypes
  }

  // Проверка корректности НДС
  static validateVAT(businessType, vatRate, documentType) {
    if (businessType === "patur") {
      // עוסק פטור не взимает НДС
      return {
        valid: vatRate === 0,
        correctedRate: 0,
        message: "עוסק פטור освобожден от НДС",
      }
    }

    if (documentType === "חשבונית מס") {
      // Налоговый счет должен содержать НДС
      const standardRate = 0.17 // 17% в Израиле
      return {
        valid: Math.abs(vatRate - standardRate) < 0.001,
        correctedRate: standardRate,
        message: `Стандартная ставка НДС в Израиле: ${(standardRate * 100).toFixed(1)}%`,
      }
    }

    return { valid: true, correctedRate: vatRate }
  }

  // Генерация предупреждений для пользователя
  static generateWarnings(user, documentData) {
    const warnings = []

    // Предупреждения для עוסק פטור
    if (user.business_type === "patur") {
      warnings.push({
        type: "info",
        message: "Как עוסק פטור, вы освобождены от НДС. Максимальный годовой оборот: ₪310,000",
      })

      if (documentData.document_type === "חשבונית מס") {
        warnings.push({
          type: "error",
          message: "עוסק פטור не может выдавать налоговые счета (חשבונית מס)",
        })
      }
    }

    // Предупреждения для עוסק מורשה
    if (user.business_type === "morsheh") {
      if (!user.personal_id) {
        warnings.push({
          type: "warning",
          message: "Рекомендуется указать номер удостоверения личности (ת.ז) в настройках профиля",
        })
      }

      if (!user.vat_number) {
        warnings.push({
          type: "error",
          message: "Для עוסק מורשה обязательно указание номера НДС",
        })
      }
    }

    // Предупреждения для בע"מ
    if (user.business_type === "baam") {
      if (!user.company_registration) {
        warnings.push({
          type: "error",
          message: 'Для בע"מ обязательно указание номера регистрации компании (ח.פ)',
        })
      }
    }

    return warnings
  }
}

module.exports = IsraeliComplianceService
