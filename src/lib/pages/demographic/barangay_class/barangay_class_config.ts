export const BARANGAY_CLASSES = [
  { value: 'U', label: 'Urban', color: '#c000db' },
  { value: 'R', label: 'Rural', color: '#00c98b' },
  { value: 'Unknown', label: 'Unknown', color: '#94a3b8' },
] as const;
export type BarangayClassRow = {
  code: string; name: string; reg_name: string; pro_name: string; mun_name: string;
  urban_rural: string;
};
export const classLabel = (value: string) => BARANGAY_CLASSES.find(c => c.value === value)?.label ?? 'Unknown';
// Strictly recognize the two supplied codes; null, blank and all other values are Unknown.
export const CLASS_SQL = "CASE WHEN p.urban_rural = 'U' THEN 'U' WHEN p.urban_rural = 'R' THEN 'R' ELSE 'Unknown' END";
