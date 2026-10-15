// digits only, max 9; handles pasted "+639…" / "09…" numbers
export const cleanPhone = (raw: string) => {
  let d = raw.replace(/\D/g, "");
  if (d.length > 9) {
    if (d.startsWith("639")) d = d.slice(3);
    else if (d.startsWith("09")) d = d.slice(2);
  }
  return d.slice(0, 9);
};

// stored value (+639…, 639…, 09…) -> the 9 digits shown after the fixed +639
export const toLocalDigits = (stored: string | null | undefined) => {
  let d = (stored ?? "").replace(/\D/g, "");
  if (d.startsWith("639")) d = d.slice(3);
  else if (d.startsWith("09")) d = d.slice(2);
  return d.slice(0, 9);
};