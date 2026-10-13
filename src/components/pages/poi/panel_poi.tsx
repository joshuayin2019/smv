import { useRef, useState } from 'react';
import { Box, Group, Text, ActionIcon, Splitter, Tooltip } from '@mantine/core';
import {
  IconMaximize,
  IconMinimize,
  IconBrowserMinus,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
} from '@tabler/icons-react';
import type { UseSplitterReturnValue } from '@mantine/hooks';
import DataTablePOI from './datatable_poi';


type PoiPanelProps = {
  onNormal: () => void;
  onFull: () => void;
  onHide: () => void;
};

export default function PoiPanel({ onNormal, onFull, onHide }: PoiPanelProps) {
  const splitterRef = useRef<UseSplitterReturnValue>(null);

  // true when the left (summary) pane is collapsed
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);

  return (
    <Box
      h="100%"
      bg="white"
      style={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderTop: '0.5px solid var(--mantine-color-gray-3)',
      }}
    >
      {/* Header bar */}
      <Group
        justify="space-between"
        wrap="nowrap"
        px="xs"
        h={32}
        bg="gray.0"
        style={{
          flexShrink: 0,
          borderBottom: '0.5px solid var(--mantine-color-gray-3)',
        }}
      >
        <Text fz={16} fw={700} c="dark">
          Point of Interest
        </Text>

        <Group gap={4} wrap="nowrap">
          {/* Summary tab: label and icon follow the splitter state */}
          <Tooltip label={summaryCollapsed ? 'Show summary tab' : 'Hide summary tab'}>
            <ActionIcon
              variant="transparent"
              color="gray"
              onClick={() => splitterRef.current?.toggleCollapse(0)}
              aria-label={summaryCollapsed ? 'Show summary tab' : 'Hide summary tab'}
            >
              {summaryCollapsed ? (
                <IconLayoutSidebarLeftExpand size={19} />
              ) : (
                <IconLayoutSidebarLeftCollapse size={19} />
              )}
            </ActionIcon>
          </Tooltip>

          {/* 40% */}
          <Tooltip label="Resize to 40%">
            <ActionIcon variant="transparent" color="gray" onClick={onNormal}>
              <IconMinimize size={19} />
            </ActionIcon>
          </Tooltip>

          {/* 100% */}
          <Tooltip label="Resize to 100%">
            <ActionIcon variant="transparent" color="gray" onClick={onFull}>
              <IconMaximize size={19} />
            </ActionIcon>
          </Tooltip>

          {/* Hide */}
          <Tooltip label="Hide Tab">
            <ActionIcon variant="transparent" color="gray" onClick={onHide}>
              <IconBrowserMinus size={19} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {/* Body: takes the remaining height under the header */}
      <Box style={{ flex: 1, minHeight: 0 }}>
        <Splitter
          splitterRef={splitterRef}
          h="100%"
          onCollapseChange={(panelIndex, collapsed) => {
            if (panelIndex === 0) setSummaryCollapsed(collapsed);
          }}
        >
          <Splitter.Pane defaultSize={30} min={20} collapsible >
            Collapsible sidebar
          </Splitter.Pane>
          <Splitter.Pane defaultSize={70} min={30} bd="1px solid gray.4">
            <DataTablePOI />
          </Splitter.Pane>
        </Splitter>
      </Box>
    </Box>
  );
}

type PoiHideTabProps = {
  onShow: () => void;
};

export function PoiHideTab({ onShow }: PoiHideTabProps) {
  return (
    <Group
      justify="space-between"
      wrap="nowrap"
      px="xs"
      h={36}
      w={260}
      bg="#0a1f6b"
      onClick={onShow}
      style={{
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)', // centers the tab horizontally
        bottom: 0,
        zIndex: 900,
        cursor: 'pointer',
        border: '0.5px solid var(--mantine-color-gray-4)',
        borderBottom: 'none',
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
        boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.15)',
      }}
    >
      <Text fz={12} fw={700} c="#fff" truncate>
        Point of Interest
      </Text>

      <ActionIcon
        variant="subtle"
        color="#fff"
        aria-label="Show Point of Interest panel"
        onClick={(e) => {
          e.stopPropagation();
          onShow();
        }}
      >
        <IconMaximize size={18} />
      </ActionIcon>
    </Group>
  );
}