# ZmanUp Invoice System - Backend

מערכת ניהול חשבוניות מתקדמת לעסקים בישראל

## תכונות עיקריות

### 🧾 ניהול מסמכים
- יצירת חשבוניות מס, קבלות, הצעות מחיר
- תמיכה בסוגי עסקים שונים (פטור, מורשה, בע"מ)
- חישוב מע"מ אוטומטי
- יצירת PDF מעוצב
- זיכויים ותיקונים

### 👥 ניהול לקוחות ושירותים
- קטלוג לקוחות מפורט
- קטלוג שירותים וקטגוריות
- סטטיסטיקות ומעקב

### 📊 דוחות ואנליטיקה
- דוחות חודשיים ושנתיים
- דוח מע"מ לרשות המיסים
- ייצוא לאקסל
- גרפים ותרשימים

### 🔗 אינטגרציות
- רשות המיסים (Allocation Numbers)
- גיבוי לענן (Google Drive, Dropbox)
- התראות אימייל ו-WhatsApp
- גישה לרואי חשבון

### 🔒 אבטחה ובקרה
- אימות JWT
- הצפנת סיסמאות
- לוגים מפורטים
- גיבויים אוטומטיים

## דרישות מערכת

- Node.js 16+
- MySQL 8.0+
- Redis (אופציונלי)

## התקנה

1. **שכפול הפרויקט**
\`\`\`bash
git clone https://github.com/your-org/zmanup-backend.git
cd zmanup-backend
\`\`\`

2. **התקנת תלויות**
\`\`\`bash
npm install
\`\`\`

3. **הגדרת משתני סביבה**
\`\`\`bash
cp .env.example .env
# ערוך את קובץ .env עם הפרטים שלך
\`\`\`

4. **הגדרת בסיס נתונים**
\`\`\`bash
# צור בסיס נתונים ב-MySQL
mysql -u root -p
CREATE DATABASE zmanup_invoices CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# הרץ מיגרציות
npm run migrate
\`\`\`

5. **הפעלת השרת**
\`\`\`bash
# פיתוח
npm run dev

# ייצור
npm start
\`\`\`

## API Endpoints

### Authentication
- `POST /api/auth/register` - רישום משתמש חדש
- `POST /api/auth/login` - התחברות
- `GET /api/auth/me` - פרטי משתמש נוכחי
- `POST /api/auth/logout` - התנתקות

### Documents
- `GET /api/documents` - רשימת מסמכים
- `POST /api/documents` - יצירת מסמך חדש
- `GET /api/documents/:id` - פרטי מסמך
- `PUT /api/documents/:id` - עדכון מסמך
- `DELETE /api/documents/:id` - מחיקת מסמך
- `POST /api/documents/:id/generate-pdf` - יצירת PDF
- `GET /api/documents/:id/download` - הורדת PDF
- `POST /api/documents/:id/duplicate` - שכפול מסמך
- `POST /api/documents/:id/cancel` - יצירת זיכוי

### Clients
- `GET /api/clients` - רשימת לקוחות
- `POST /api/clients` - הוספת לקוח
- `GET /api/clients/:id` - פרטי לקוח
- `PUT /api/clients/:id` - עדכון לקוח
- `DELETE /api/clients/:id` - מחיקת לקוח

### Services
- `GET /api/services` - רשימת שירותים
- `POST /api/services` - הוספת שירות
- `GET /api/services/:id` - פרטי שירות
- `PUT /api/services/:id` - עדכון שירות
- `DELETE /api/services/:id` - מחיקת שירות
- `GET /api/services/categories` - רשימת קטגוריות

### Reports
- `GET /api/reports/dashboard` - נתוני דשבורד
- `GET /api/reports/clients` - דוח לקוחות
- `GET /api/reports/services` - דוח שירותים
- `GET /api/reports/vat` - דוח מע"מ
- `POST /api/reports/export/excel` - ייצוא לאקסל
- `GET /api/reports/tax-authority` - דוח לרשות המיסים

### Allocation Numbers
- `POST /api/allocation/request` - בקשת מספר הקצאה
- `GET /api/allocation/status/:id` - בדיקת סטטוס
- `GET /api/allocation/history` - היסטוריית בקשות

### Accountant Access
- `POST /api/accountant/grant-access` - מתן גישה לרואה חשבון
- `PUT /api/accountant/access/:id` - עדכון הרשאות
- `DELETE /api/accountant/access/:id` - ביטול גישה
- `GET /api/accountant/my-accesses` - הגישות שלי (רואה חשבון)
- `GET /api/accountant/client/:id/documents` - מסמכי לקוח
- `GET /api/accountant/client/:id/reports` - דוחות לקוח

### Notifications
- `GET /api/notifications/overdue` - מסמכים באיחור
- `GET /api/notifications/upcoming` - מסמכים קרובים לפירעון
- `POST /api/notifications/send-reminder` - שליחת תזכורת
- `POST /api/notifications/bulk-reminders` - תזכורות מרובות
- `GET /api/notifications/settings` - הגדרות התראות
- `PUT /api/notifications/settings` - עדכון הגדרות

### Archive & Backup
- `POST /api/archive/backup` - יצירת גיבוי
- `GET /api/archive/backups` - רשימת גיבויים
- `GET /api/archive/download/:filename` - הורדת גיבוי
- `POST /api/archive/restore` - שחזור מגיבוי
- `DELETE /api/archive/backup/:filename` - מחיקת גיבוי
- `GET /api/archive/settings` - הגדרות גיבוי
- `PUT /api/archive/settings` - עדכון הגדרות

## מבנה הפרויקט

\`\`\`
├── config/
│   └── database.js          # הגדרות בסיס נתונים
├── models/                  # מודלים של Sequelize
│   ├── index.js
│   ├── User.js
│   ├── Client.js
│   ├── Service.js
│   ├── Document.js
│   ├── DocumentItem.js
│   ├── AllocationRequest.js
│   ├── AccountantAccess.js
│   └── AuditLog.js
├── routes/                  # נתיבי API
│   ├── auth.js
│   ├── documents.js
│   ├── clients.js
│   ├── services.js
│   ├── reports.js
│   ├── allocation.js
│   ├── accountant.js
│   ├── notifications.js
│   └── archive.js
├── services/                # שירותים עסקיים
│   ├── pdfService.js
│   ├── allocationService.js
│   ├── excelService.js
│   ├── notificationService.js
│   ├── backupService.js
│   └── cronService.js
├── middleware/              # Middleware
│   └── auth.js
├── utils/                   # כלי עזר
│   ├── auditLogger.js
│   └── fileUtils.js
├── migrations/              # מיגרציות בסיס נתונים
├── uploads/                 # קבצים שהועלו
├── backups/                 # גיבויים
├── server.js               # שרת ראשי
└── package.json
\`\`\`

## סוגי עסקים נתמכים

### עוסק פטור (patur)
- ללא מע"מ
- מסמכים: קבלה, חשבונית עסקה

### עוסק מורשה (morsheh)
- מע"מ 18%
- מסמכים: הצעת מחיר, הזמנת עבודה, חשבונית עסקה, קבלה, חשבונית מס

### חברה בע"מ (baam)
- מע"מ 18%
- מסמכים: הצעת מחיר, הזמנת עבודה, חשבונית עסקה, קבלה, חשבונית מס
- Allocation Numbers לחשבוניות מעל ₪20,000

## אבטחה

- הצפנת סיסמאות עם bcrypt
- JWT tokens עם תפוגה
- Rate limiting
- Helmet.js לאבטחת headers
- CORS מוגדר
- Audit logs מפורטים

## גיבויים

- גיבויים אוטומטיים שבועיים
- העלאה לענן (Google Drive, Dropbox)
- שחזור מלא או חלקי
- שמירת היסטוריה

## פיתוח

\`\`\`bash
# הפעלת שרת פיתוח
npm run dev

# הרצת בדיקות
npm test

# בדיקת קוד
npm run lint

# מיגרציות
npm run migrate

# זריעת נתונים
npm run seed
\`\`\`

## ייצור

\`\`\`bash
# בניית הפרויקט
npm run build

# הפעלה בייצור
npm start

# עם PM2
pm2 start ecosystem.config.js
\`\`\`

## תמיכה

לתמיכה טכנית או שאלות:
- אימייל: support@zmanup.com
- טלפון: 03-1234567
- תיעוד: https://docs.zmanup.com

## רישיון

MIT License - ראה קובץ LICENSE לפרטים נוספים.
\`\`\`
