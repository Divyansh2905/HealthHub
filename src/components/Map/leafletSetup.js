// src/components/Map/leafletSetup.js
import L from "leaflet";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

// Create and set a default icon so every <Marker /> works in Vite
export const defaultIcon = new L.Icon({
  iconRetinaUrl: new URL(iconRetinaUrl, import.meta.url).href,
  iconUrl: new URL(iconUrl, import.meta.url).href,
  shadowUrl: new URL(shadowUrl, import.meta.url).href,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Apply globally
L.Marker.prototype.options.icon = defaultIcon;

// Small helpers
export function toLatLngArray(pos) {
  if (!pos) return null;
  const lat = typeof pos.lat === "string" ? parseFloat(pos.lat) : pos.lat;
  const lng = typeof pos.lng === "string" ? parseFloat(pos.lng) : pos.lng;
  if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
  return null;
}
