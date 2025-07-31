module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("services", "unit", {
      type: Sequelize.STRING(50),
      allowNull: true,
    })
    await queryInterface.addColumn("services", "notes", {
      type: Sequelize.TEXT,
      allowNull: true,
    })
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn("services", "unit")
    await queryInterface.removeColumn("services", "notes")
  },
}
