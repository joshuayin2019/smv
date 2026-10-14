import { useEffect, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Box, Splitter, Title, type SplitterProps } from '@mantine/core';
import { useGlobalStore } from '@/stores/global_stores';
import { useMapStore } from '@/stores/map_stores';

import PoiLayer from '../pages/poi/map_poi';
import PoiPanel from '../pages/poi/panel_poi';
import { PoiHideTab } from '../pages/poi/panel_poi';
import PoiRadius from '../pages/poi/radius_poi';

// SMV
import SmvLayer from '../pages/smv/map_smv';
import SmvPanel from '../pages/smv/panel_smv';
import { SmvHideTab } from '../pages/smv/panel_smv';

const Map = dynamic(() => import('@/components/map/map'), { ssr: false });

type Sizes = NonNullable<SplitterProps['sizes']>;

// [map, bottom panel]
const SIZES_HIDDEN: Sizes = [100, 0];
const SIZES_NORMAL: Sizes = [60, 40];
const SIZES_FULL: Sizes = [0, 100];

const TRANSITION = 'all 300ms ease'; // keep PANEL_SETTLE_MS in the PoiLayer file longer than this

type PanelBottomManagementProps = {
  showMap: boolean;
};

export default function PanelBottomManagement(props: PanelBottomManagementProps) {
  const { showMap } = props;
  const { activePage } = useGlobalStore();

  // layer control state (toggled from the LayerControl panel inside the map)
  const smv = useMapStore((s) => s.smv);
  const poiVisible = useMapStore((s) => s.poiVisible);

  const [sizes, setSizes] = useState<Sizes>(SIZES_HIDDEN);
  const [dragging, setDragging] = useState(false);

  // the visible map area (top pane); PoiLayer measures it to know how much of the map is cut off
  const mapPaneRef = useRef<HTMLDivElement>(null);

  // sizes[1] can be a number or a '40%' string, so parse it before comparing
  const bottomSize = Number.parseFloat(String(sizes[1])) || 0; // % of the splitter taken by the bottom pane
  const isOpen = bottomSize > 0;

  const showNormal = () => setSizes(SIZES_NORMAL);
  const showFull = () => setSizes(SIZES_FULL);
  const hidePanel = () => setSizes(SIZES_HIDDEN);

  // Animate button-driven changes, but not while the handle is being dragged
  const paneStyle = {
    overflow: 'hidden',
    transition: dragging ? 'none' : TRANSITION,
  } as const;

  // Bottom panel content depends on the active page
  const renderPanelContent = (): ReactNode => {
    switch (activePage) {
      case 'Point of Interest':
        return (
          <PoiPanel
            onNormal={showNormal}
            onFull={showFull}
            onHide={hidePanel}
          />
        );
      
      case 'Schedule of Market Value':
        return (
          <SmvPanel
            onNormal={showNormal}
            onFull={showFull}
            onHide={hidePanel}
          />
        );

      case 'User Management':
        return <Title order={4}>User Management</Title>;
      default:
        return <Title order={4}>Unknown Page</Title>;
    }
  };

  useEffect(() => {
    if (activePage === 'Point of Interest') {
      setSizes(SIZES_NORMAL);
    } else if(activePage === 'Schedule of Market Value'){
      setSizes(SIZES_NORMAL);
    }
  }, [activePage]);

  return (
    <Box
      pos="absolute"
      inset={0}
      style={{ display: showMap ? 'block' : 'none', overflow: 'hidden' }}
    >
      <Splitter
        orientation="vertical"
        h="100%"
        sizes={sizes}
        onSizeChange={setSizes}
        onResizeStart={() => setDragging(true)}
        onResizeEnd={() => setDragging(false)}
        // hide the drag handle while the panel is closed
        styles={{ handle: { display: isOpen ? undefined : 'none' } }}
      >
        {/* Top pane: map (clipped so it can never scroll) */}
        <Splitter.Pane defaultSize={100} min={0} style={paneStyle}>
          <Box ref={mapPaneRef} pos="relative" h="100%" w="100%" style={{ overflow: 'hidden' }}>
            <Map active={showMap} />

            {/* POI */}
            <PoiLayer mapPaneRef={mapPaneRef} visible={poiVisible} />
            <PoiRadius />

            {/* SMV */}
            <SmvLayer {...smv} />
          </Box>
        </Splitter.Pane>

        {/* Bottom pane: content switches by active page (size 0 = hidden) */}
        <Splitter.Pane defaultSize={0} min={0} style={paneStyle}>
          {renderPanelContent()}
        </Splitter.Pane>
      </Splitter>

      {/* Show the tab only on Point of Interest, and only while the panel is hidden */}
      {!isOpen && (
        <>
          {activePage === 'Point of Interest' && <PoiHideTab onShow={showNormal} />}
          {activePage === 'Schedule of Market Value' && <SmvHideTab onShow={showNormal} />}
        </>
      )}
    </Box>
  );
}