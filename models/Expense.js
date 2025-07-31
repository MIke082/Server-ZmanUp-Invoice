module.exports = (sequelize, DataTypes) => {
  const Expense = sequelize.define(
    "Expense",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      client_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        validate: {
          min: 0,
        },
      },
      category: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      expense_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      image_path: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      receipt_number: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      vendor_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      is_business_expense: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      tax_deductible: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      tableName: "expenses",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        // разумные индексы, не перегружаем таблицу
        { fields: ["user_id"] },
        { fields: ["expense_date"] },
      ],
      hooks: {
        beforeCreate: (expense) => {
          if (!expense.expense_date) {
            expense.expense_date = new Date().toISOString().split("T")[0];
          }
        },
      },
    }
  );

  // Associations
  Expense.associate = (models) => {
    Expense.belongsTo(models.User, {
      foreignKey: "user_id",
      as: "user",
    });

    Expense.belongsTo(models.Client, {
      foreignKey: "client_id",
      as: "client",
    });
  };
  

  return Expense;
};
