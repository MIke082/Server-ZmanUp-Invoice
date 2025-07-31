const { Sequelize } = require("sequelize")
const config = require("../config/database")

const env = process.env.NODE_ENV || "development"
const dbConfig = config[env]

const sequelize = new Sequelize(dbConfig.database, dbConfig.username, dbConfig.password, dbConfig)

// Import models
const User = require("./User")(sequelize, Sequelize.DataTypes)
const Client = require("./Client")(sequelize, Sequelize.DataTypes)
const Service = require("./Service")(sequelize, Sequelize.DataTypes)
const Document = require("./Document")(sequelize, Sequelize.DataTypes)
const DocumentItem = require("./DocumentItem")(sequelize, Sequelize.DataTypes)
const AllocationRequest = require("./AllocationRequest")(sequelize, Sequelize.DataTypes)
const Accountant = require("./Accountant")(sequelize, Sequelize.DataTypes)
const AuditLog = require("./AuditLog")(sequelize, Sequelize.DataTypes)
const Expense = require("./Expense")(sequelize, Sequelize.DataTypes)
const ResetCode = require("./ResetCode")(sequelize, Sequelize.DataTypes)
const DeletedUser = require("./DeletedUser")(sequelize, Sequelize.DataTypes)

// Define associations
User.hasMany(Client, { foreignKey: "user_id", as: "clients" })
Client.belongsTo(User, { foreignKey: "user_id", as: "user" })

User.hasMany(Service, { foreignKey: "user_id", as: "services" })
Service.belongsTo(User, { foreignKey: "user_id", as: "user" })

User.hasMany(Document, { foreignKey: "user_id", as: "documents" })
Document.belongsTo(User, { foreignKey: "user_id", as: "user" })

Client.hasMany(Document, { foreignKey: "client_id", as: "documents" })
Document.belongsTo(Client, { foreignKey: "client_id", as: "client" })

Document.hasMany(DocumentItem, { foreignKey: "document_id", as: "items" })
DocumentItem.belongsTo(Document, { foreignKey: "document_id", as: "document" })

Service.hasMany(DocumentItem, { foreignKey: "service_id", as: "documentItems" })
DocumentItem.belongsTo(Service, { foreignKey: "service_id", as: "service" })

Document.hasOne(AllocationRequest, { foreignKey: "document_id", as: "allocationRequest" })
AllocationRequest.belongsTo(Document, { foreignKey: "document_id", as: "document" })

User.hasMany(Accountant, { foreignKey: "client_user_id", as: "Accountantes" })
Accountant.belongsTo(User, { foreignKey: "client_user_id", as: "client" })

User.hasMany(Accountant, { foreignKey: "accountant_user_id", as: "clientAccesses" })
Accountant.belongsTo(User, { foreignKey: "accountant_user_id", as: "accountant" })

// Self-referencing for document cancellations
Document.hasMany(Document, { foreignKey: "original_document_id", as: "cancellations" })
Document.belongsTo(Document, { foreignKey: "original_document_id", as: "originalDocument" })

// Expense associations
User.hasMany(Expense, { foreignKey: "user_id", as: "expenses" })
Expense.belongsTo(User, { foreignKey: "user_id", as: "user" })

Client.hasMany(Expense, { foreignKey: "client_id", as: "expenses" })
Expense.belongsTo(Client, { foreignKey: "client_id", as: "client" })

User.hasOne(DeletedUser, { foreignKey: "user_id", as: "deletionInfo", })
DeletedUser.belongsTo(User, { foreignKey: "user_id", as: "user", })

module.exports = {
  sequelize,
  Sequelize,
  User,
  Client,
  Service,
  Document,
  DocumentItem,
  AllocationRequest,
  Accountant,
  AuditLog,
  Expense,
  ResetCode,
  DeletedUser
}
