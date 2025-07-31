// models/ResetCode.js

module.exports = (sequelize, DataTypes) => {
  const ResetCode = sequelize.define("ResetCode", {
    email: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    code: {
      type: DataTypes.STRING(6),
      allowNull: false,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "expires_at", // 👈 сопоставление с колонкой в базе данных
    },
  })

  return ResetCode
}
