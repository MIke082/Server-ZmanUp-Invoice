exports.getLastMonth = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1 // чтобы 0 → январь, 6 → июль
  return { year, month }
}
