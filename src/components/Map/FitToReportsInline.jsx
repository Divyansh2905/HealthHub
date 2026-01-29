import { useEffect } from "react";
import L from "leaflet";

export default function FitToReportsInline({ coords, mapRef }) {
  useEffect(() => {
    if (!mapRef?.current) return;
    const map = mapRef.current;

    if (!coords || coords.length === 0) {
      // No results → zoom out to India level
      map.flyTo([22.51, 78.96], 5, { duration: 1.2 });
      return;
    }

    if (coords.length === 1) {
      // Single point → zoom in
      map.flyTo(coords[0], 14, { duration: 1.2 });
    } else {
      // Multiple points → always fly to bounds, even if already visible
      const bounds = L.latLngBounds(coords);

      // Force animation by slightly altering padding each time
      const padding = [50 + Math.random() * 0.01, 50 + Math.random() * 0.01];

      map.flyToBounds(bounds, {
        padding,
        duration: 1.2,
      });
    }
  }, [JSON.stringify(coords), mapRef]); // trigger on every coords change

  return null;
}
