export const PARCEL_CLASSES = [
  { name: 'Agricultural', color: '#22a06b' },
  { name: 'Residential', color: '#2458bd' },
  { name: 'Commercial', color: '#f59e0b' },
  { name: 'Industrial', color: '#9a63da' },
];
export interface ParcelRow {
  bounds?: [number,number,number,number];
  id: string; parcel_id: string; parcel_name: string | null; classification: string | null;
  reg_name: string | null; pro_name: string | null; mun_name: string | null; bgy_name: string | null;
  address: string | null; source: string | null; as_of: string | null; remarks: string | null;
  created_at: string; updated_at: string;
}
export interface ParcelResult {
  rows: ParcelRow[]; total: number; capped: boolean; page: number; pageSize: number;
  classifications: { name: string; value: number }[];
  bounds: [number, number, number, number] | null;
}
