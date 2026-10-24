import { useEffect } from 'react';
import { notifications } from '@mantine/notifications';
import { useParcelStore } from '@/stores/parcel_stores';
import { useMapStore } from '@/stores/map_stores';
import { useGlobalStore } from '@/stores/global_stores';
import { basePath } from '@/lib/config';

export default function ParcelSelection({ onShow }: { onShow: () => void }) {
  const selected = useParcelStore(s => s.selected);
  const map = useMapStore(s => s.map);
  const active = useGlobalStore(s => s.activePage === 'Parcels');
  const id = selected?.id;
  const bounds = JSON.stringify(selected?.bounds || null);
  useEffect(() => {
    if (!active || !map || !id) return;
    const ctrl = new AbortController();
    const zoom = (b: number[]) => {
      if (ctrl.signal.aborted || !Array.isArray(b) || b.length !== 4 || !b.every(Number.isFinite)) return;
      onShow();
      map.fitBounds([[b[0],b[1]],[b[2],b[3]]],{ padding: 60,maxZoom: 18,duration: 700 });
    };
    const saved = JSON.parse(bounds);
    if (saved) zoom(saved);
    else fetch(`${basePath}/api/pages/parcel?id=${encodeURIComponent(id)}`,{ signal: ctrl.signal })
      .then(async r => { if (!r.ok) throw new Error('Unable to zoom to the selected parcel.'); return r.json(); })
      .then(row => zoom(row.bounds))
      .catch(e => { if (!ctrl.signal.aborted) notifications.show({ color: 'red',message: e.message }); });
    return () => ctrl.abort();
    // Panel callbacks are recreated while resizing; only selections trigger zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[map,active,id,bounds]);
  return null;
}
