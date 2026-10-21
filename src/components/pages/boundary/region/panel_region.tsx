import { useRef, useState } from 'react';
import { Box, Group, Text, ActionIcon, Splitter, Tooltip } from '@mantine/core';
import {
  IconMaximize,
  IconMinimize,
  IconBrowserMinus
} from '@tabler/icons-react';
import type { UseSplitterReturnValue } from '@mantine/hooks';

import { ACCENT, BORDER, NAVY, NAVY_DEEP, PANEL_BG } from '@/lib/theme_colors';
import DataTableRegion from './data_table_region';


type RegionPanelProps = {
  onNormal: () => void;
  onFull: () => void;
  onHide: () => void;
};

export default function RegionPanel({ onNormal, onFull, onHide }: RegionPanelProps) {
  const splitterRef = useRef<UseSplitterReturnValue>(null);

  return (
    <Box
      h="100%"
      bg="white"
      style={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderTop: `3px solid ${ACCENT}`, // same green accent as the active navbar item
      }}
    >
      {/* Header bar */}
      <Group
        justify="space-between"
        wrap="nowrap"
        px="xs"
        h={34}
        style={{ flexShrink: 0, background: NAVY_DEEP }}
      >
        <Text fz={14} fw={700} c="#fff">
          Region
        </Text>

        <Group gap={4} wrap="nowrap">
          {/* 40% */}
          <Tooltip label="Resize to 40%">
            <ActionIcon variant="transparent" color="#fff" onClick={onNormal}>
              <IconMinimize size={19} />
            </ActionIcon>
          </Tooltip>

          {/* 100% */}
          <Tooltip label="Resize to 100%">
            <ActionIcon variant="transparent" color="#fff" onClick={onFull}>
              <IconMaximize size={19} />
            </ActionIcon>
          </Tooltip>

          {/* Hide */}
          <Tooltip label="Hide Tab">
            <ActionIcon variant="transparent" color="#fff" onClick={onHide}>
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
          handleColor={BORDER}
        >
          <Splitter.Pane defaultSize={100} min={100} bd={`1px solid ${BORDER}`}>
            <DataTableRegion />
          </Splitter.Pane>
        </Splitter>
      </Box>
    </Box>
  );
}

type RegionHideTabProps = {
  onShow: () => void;
};

export function RegionHideTab({ onShow }: RegionHideTabProps) {
  return (
    <Group
      justify="space-between"
      wrap="nowrap"
      px="xs"
      h={36}
      w={260}
      onClick={onShow}
      style={{
        background: NAVY,
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)', // centers the tab horizontally
        bottom: 0,
        zIndex: 900,
        cursor: 'pointer',
        borderTop: `3px solid ${ACCENT}`,
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
        boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.15)',
      }}
    >
      <Text fz={12} fw={700} c="#fff" truncate>
        Region
      </Text>

      <ActionIcon
        variant="subtle"
        color="#fff"
        aria-label="Show region panel"
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