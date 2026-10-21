import { conn } from "@/lib/db";

export async function loadProvinceData() {
  try {
    const { rows } = await conn.query(
      `SELECT id, reg_code, reg_name, pro_code, pro_name
	     FROM core.prov_bndry
       order by reg_code
       `
    );

    return { success: true, status: 200, data: rows };
  } catch (err) {
    console.error("loadRegionData failed:", err);
    return { success: false, status: 500, message: "Failed to load regions" };
  }
}