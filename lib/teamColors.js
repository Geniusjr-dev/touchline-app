export const TEAM_COLOURS = [
  { name: "Green", value: "#18A558" },
  { name: "Blue", value: "#2563EB" },
  { name: "Red", value: "#DC2626" },
  { name: "Purple", value: "#7C3AED" },
  { name: "Orange", value: "#EA580C" },
  { name: "Cyan", value: "#0891B2" },
  { name: "Pink", value: "#DB2777" },
  { name: "Gold", value: "#CA8A04" },
  { name: "White", value: "#FFFFFF" },
  { name: "Yellow", value: "#FACC15" },
  { name: "Black", value: "#111111" },
  { name: "Grey", value: "#6B7280" },
  { name: "Navy", value: "#172554" },
  { name: "Maroon", value: "#7F1D1D" },
  { name: "Brown", value: "#78350F" },
  { name: "Lime", value: "#65A30D" },
  { name: "Sky blue", value: "#0EA5E9" },
  { name: "Teal", value: "#0F766E" },
];

export function readableTextColor(color) {
  const hex = String(color || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "#FFFFFF";
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 > 155 ? "#07130B" : "#FFFFFF";
}
