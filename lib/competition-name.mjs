export const IMEC_ID = "013f3c6e-4aa1-486f-a0f9-1d031265655e";

export function competitionLabel(name, id) {
  return id === IMEC_ID || name?.trim().toLowerCase() === "ijon memorial championship" ? "IMEC" : name;
}
