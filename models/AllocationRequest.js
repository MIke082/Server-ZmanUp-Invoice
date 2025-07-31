module.exports = (sequelize, DataTypes) => {
  const AllocationRequest = sequelize.define(
    "AllocationRequest",
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
      allocation_number: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("pending", "success", "failed"),
        allowNull: false,
        defaultValue: "pending",
      },
      request_data: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      response_data: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      error_message: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      requested_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      completed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "allocation_requests",
      indexes: [
        {
          fields: ["document_id"],
        },
        {
          fields: ["allocation_number"],
        },
        {
          fields: ["status"],
        },
      ],
    },
  )

  return AllocationRequest
}
