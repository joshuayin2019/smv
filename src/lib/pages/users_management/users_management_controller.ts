import { conn } from "@/lib/db";

export async function loadUsers(){
    try {
        const sql =`
            SELECT a.id, a.user_id, a.username, a.email, a.full_name, a.phone_number, a.status, a.address,
                json_agg(
                json_build_object(
                    'scope_level', b.scope_level,
                    'code', 
                    CASE b.scope_level
                        WHEN 1 THEN NULL
                        WHEN 2 THEN b.reg_code
                        WHEN 3 THEN b.pro_code
                        WHEN 4 THEN b.mun_code
                        ELSE NULL
                    END
                )
                ) FILTER (WHERE b.poi = true) AS scope_poi,
                json_agg(
                json_build_object(
                    'scope_level', b.scope_level,
                    'code', 
                    CASE b.scope_level
                        WHEN 1 THEN NULL
                        WHEN 2 THEN b.reg_code
                        WHEN 3 THEN b.pro_code
                        WHEN 4 THEN b.mun_code
                        ELSE NULL
                    END
                )
                ) FILTER (WHERE b.psa = true) AS scope_psa,
                json_agg(
                json_build_object(
                    'scope_level', b.scope_level,
                    'code', 
                    CASE b.scope_level
                        WHEN 1 THEN NULL
                        WHEN 2 THEN b.reg_code
                        WHEN 3 THEN b.pro_code
                        WHEN 4 THEN b.mun_code
                        ELSE NULL
                    END
                )
                ) FILTER (WHERE b.smv = true) AS scope_smv

                FROM data.users a
                INNER JOIN data.scope b on a.user_id = b.user_id
                GROUP BY a.id;
        `;

        const res = await conn.query(sql);
        return { success: true, data: res.rows };
    } catch (error) {
        console.error("users_management_controller:", error);
        return { success: false, message: "Internal server error", status: 500 };
    }

}