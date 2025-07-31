module.exports = (sequelize, DataTypes) => {
  const Document = sequelize.define(
    "Document",
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
      client_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      document_number: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      document_type: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },

      status: {
        type: DataTypes.ENUM(
          "draft",
          "sent",
          "pending",
          "paid",
          "overdue",
          "cancelled"
        ),
        allowNull: false,
        defaultValue: "draft",
      },
      issue_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      due_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      subtotal: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      vat_rate: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: false,
        defaultValue: 0.18,
      },
      vat_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      total_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      currency: {
        type: DataTypes.STRING(3),
        allowNull: false,
        defaultValue: "NIS",
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      pdf_path: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      is_immutable: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      original_document_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
      },
      payment_method: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'cash',
        validate: {
          isIn: [['cash', 'card', 'bit', 'paybox', 'bank', 'other']],
        },
      },

    },
    {
      tableName: "documents",
      indexes: [
        { fields: ["user_id"] },
        { fields: ["client_id"] },
        { fields: ["document_number"] },
        { fields: ["status"] },
        { fields: ["issue_date"] },
        { unique: true, fields: ["user_id", "document_number"] },
      ],
      hooks: {
        beforeCreate: async (document) => {
          if (!document.document_number) {
            const year = new Date().getFullYear();
            const count = await Document.count({
              where: {
                user_id: document.user_id,
                document_number: {
                  [sequelize.Sequelize.Op.like]: `${year}-%`,
                },
              },
            });
            document.document_number = `${year}-${String(count + 1).padStart(3, "0")}`;
          }
        },
      },
    }
  );

  Document.associate = (models) => {
    Document.belongsTo(models.User, {
      foreignKey: "user_id",
      as: "user",
    })

    Document.belongsTo(models.Client, {
      foreignKey: "client_id",
      as: "client",
    })

    Document.hasMany(models.DocumentItem, {
      foreignKey: "document_id",
      as: "items",
      onDelete: "CASCADE",
    })

    Document.hasOne(models.AllocationRequest, {
      foreignKey: "document_id",
      as: "allocationRequest",
    })

    Document.hasMany(models.Document, {
      foreignKey: "original_document_id",
      as: "cancellations",
    })

    Document.belongsTo(models.Document, {
      foreignKey: "original_document_id",
      as: "originalDocument",
    })

    // 🔥 client не связан через ассоциацию — как просили
  };

  return Document;
};
