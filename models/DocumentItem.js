module.exports = (sequelize, DataTypes) => {
  const DocumentItem = sequelize.define(
    "DocumentItem",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      document_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "documents",
          key: "id",
        },
      },
      service_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "services",
          key: "id",
        },
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: false,
        validate: {
          notEmpty: true,
        },
      },
      // quantity: {
      //   type: DataTypes.DECIMAL(10, 2),
      //   allowNull: false,
      //   defaultValue: 1.0,
      //   validate: {
      //     min: 0.01,
      //   },
      // },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          isInt: true,
        },
      },
      unit_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
        validate: {
          min: 0,
        },
      },
      total_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.0,
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      tableName: "document_items",
      indexes: [
        {
          fields: ["document_id"],
        },
        {
          fields: ["service_id"],
        },
      ],
      hooks: {
        beforeSave: (item) => {
          item.total_price = Number.parseFloat((item.quantity * item.unit_price).toFixed(2))
        },
      },
    },
  )
  DocumentItem.associate = (models) => {
    DocumentItem.belongsTo(models.Document, {
      foreignKey: "document_id",
      as: "document",
    })

    DocumentItem.belongsTo(models.Service, {
      foreignKey: "service_id",
      as: "service", // обязательно совпадает с alias в include
    })
  }
  return DocumentItem
}
