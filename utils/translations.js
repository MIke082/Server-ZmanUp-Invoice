// Приглашения (email content)
const invitationTranslations = {
  he: {
    subject: (accountantName) => `הזמנה מרואה החשבון ${accountantName} ב-ZmanUp`,
    html: (password, link) => `
      <p>הוזמנת על ידי רואה החשבון שלך להצטרף למערכת ZmanUp.</p>
      <p>הסיסמה הזמנית שלך: <strong>${password}</strong></p>
      <p><a href="${link}">לחץ כאן כדי להפעיל את החשבון</a></p>
      <p>לאחר ההפעלה תוכל לשנות את הסיסמה שלך בהגדרות.</p>
    `
  },
  ru: {
    subject: (accountantName) => `Приглашение от бухгалтера ${accountantName} (ZmanUp)`,
    html: (password, link) => `
      <p>Вы были приглашены бухгалтером в ZmanUp.</p>
      <p>Ваш временный пароль: <strong>${password}</strong></p>
      <p><a href="${link}">Нажмите здесь, чтобы активировать доступ</a></p>
      <p>После активации вы сможете сменить пароль в настройках.</p>
    `
  },
  en: {
    subject: (accountantName) => `Invitation from your accountant ${accountantName} at ZmanUp`,
    html: (password, link) => `
      <p>You have been invited by your accountant to join ZmanUp.</p>
      <p>Your temporary password: <strong>${password}</strong></p>
      <p><a href="${link}">Click here to activate your access</a></p>
      <p>After activation, you can change your password in the settings.</p>
    `
  },
  fr: {
    subject: (accountantName) => `Invitation de votre comptable ${accountantName} sur ZmanUp`,
    html: (password, link) => `
      <p>Vous avez été invité par votre comptable à rejoindre ZmanUp.</p>
      <p>Votre mot de passe temporaire : <strong>${password}</strong></p>
      <p><a href="${link}">Cliquez ici pour activer votre accès</a></p>
      <p>Après activation, vous pourrez modifier votre mot de passe dans les paramètres.</p>
    `
  },
  uk: {
    subject: (accountantName) => `Запрошення від бухгалтера ${accountantName} до ZmanUp`,
    html: (password, link) => `
      <p>Вас запросив ваш бухгалтер до платформи ZmanUp.</p>
      <p>Ваш тимчасовий пароль: <strong>${password}</strong></p>
      <p><a href="${link}">Натисніть тут, щоб активувати доступ</a></p>
      <p>Після активації ви зможете змінити пароль у налаштуваннях.</p>
    `
  }
}

// Ошибки при регистрации
const registrationErrorTranslations = {
  he: {
    emailExists: "כתובת אימייל זו כבר בשימוש",
    phoneExists: "מספר טלפון זה כבר רשום במערכת",
    generic: "שגיאה בעת הזמנת לקוח. נסה שוב מאוחר יותר."
  },
  ru: {
    emailExists: "Этот адрес электронной почты уже используется",
    phoneExists: "Этот номер телефона уже зарегистрирован",
    generic: "Ошибка при приглашении клиента. Пожалуйста, попробуйте позже."
  },
  en: {
    emailExists: "This email address is already in use",
    phoneExists: "This phone number is already registered",
    generic: "An error occurred while inviting the client. Please try again later."
  },
  fr: {
    emailExists: "Cette adresse e-mail est déjà utilisée",
    phoneExists: "Ce numéro de téléphone est déjà enregistré",
    generic: "Une erreur s'est produite lors de l'invitation du client. Veuillez réessayer plus tard."
  },
  uk: {
    emailExists: "Ця електронна адреса вже використовується",
    phoneExists: "Цей номер телефону вже зареєстрований",
    generic: "Сталася помилка при запрошенні клієнта. Спробуйте пізніше."
  }
}

module.exports = {
  invitationTranslations,
  registrationErrorTranslations
}
