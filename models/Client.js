const { encrypt, decrypt } = require("../utils/cryptoUtils")

module.exports = (sequelize, DataTypes) => {
  const Client = sequelize.define(
    "Client",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
      },
      firstName: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: {
          notEmpty: true,
        },
      },
      lastName: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      business_id: {
        type: DataTypes.STRING(255), // ✅ увеличено до 255
        allowNull: true,
        set(value) {
          if (value) {
            this.setDataValue("business_id", encrypt(value))
          }
        },
        get() {
          const encrypted = this.getDataValue("business_id")
          if (!encrypted) return null
          try {
            return decrypt(encrypted)
          } catch (err) {
            console.error("Failed to decrypt business_id:", err)
            return null
          }
        }
      },
      business_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
        unique: true, // 👈 это достаточно

      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: true,
        validate: {
          isEmail: true,
        },
        set(value) {
          this.setDataValue("email", value === "" ? null : value)
        },
      },

      address: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      city: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      zipCode: {
        type: DataTypes.STRING(20),
        allowNull: true,
        field: "zipCode", // чтобы избежать попытки маппить на zip_code
      },

      client_type: {
        type: DataTypes.ENUM("individual", "business"),
        allowNull: false,
        defaultValue: "individual",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      total_invoices: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      total_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
    },
    {
      tableName: "clients",
    },
  )

  Client.associate = (models) => {
    Client.hasMany(models.Document, {
      foreignKey: "client_id",
      as: "documents",
    })
  }
  return Client
}
