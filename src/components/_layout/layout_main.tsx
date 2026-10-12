import dynamic from "next/dynamic";
import { useEffect } from 'react';
import { Box, Tabs, Loader } from '@mantine/core';
import { useGlobalStore, DEFAULT_PAGE } from '@/stores/global_stores';
import PoiLayer from "../map/poi_layer";

const Map = dynamic(() => import('@/components/map/map'), { ssr: false });

const UserManagementMain = dynamic(
  () => import('@/components/pages/user_management/user_management_main'),
  { ssr: false, loading: () => <Loader size="sm" /> }
);

// Pages where the map is visible
const HIDE_MAP_PAGES = [DEFAULT_PAGE, 'User Management'];

//Pages
//import UserManagementMain from '@/components/pages/user_management/user_management_main';


export default function LayoutMain() {
  const { activePage, setActivePage, auth } = useGlobalStore();
  const showMap = !HIDE_MAP_PAGES.includes(activePage);
  const isAdmin = auth?.role === 'admin';



  return(
    <Box pos="relative" h="calc(100dvh - 50px)">
        {/* Map stays mounted; only hidden on other pages */}
          <Box
            pos="absolute"
            inset={0}
            style={{ display: showMap ? 'block' : 'none' }}
          >
            <Map active={showMap} />
            <PoiLayer /> 
          </Box>

          {/* Content for pages that don't show the map */}
          {!showMap && (
            <Box pos="absolute" inset={0} p="xs">
                <Tabs value={activePage} onChange={(value) => value && setActivePage(value)}>
                <Tabs.Panel value="Dashboard">First panel</Tabs.Panel>

                {isAdmin && (
                  <Tabs.Panel value="User Management">
                    <UserManagementMain />
                  </Tabs.Panel>
                )}

                </Tabs>               
              {/* {activePage} */}
            </Box>
          )}   
    </Box>
  );
}