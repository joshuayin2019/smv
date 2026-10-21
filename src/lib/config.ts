export const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const poi_url = `${basePath}/api/pages/poi`;
export const smv_url = `${basePath}/api/pages/smv`;
export const user_management_url = `${basePath}/api/pages/users_management`;

//Validate
export const POI_TILES_URL = () => `${window.location.origin}/api/pages/poi/tiles/{z}/{x}/{y}`;


//Boundary
export const region_url = `${basePath}/api/pages/boundary/region`;
export const province_url = `${basePath}/api/pages/boundary/province`;
