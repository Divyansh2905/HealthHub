// src/components/Map/MapWrapper.jsx
import React, { useMemo, useRef, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "./leafletSetup";

function ClickHandler({ onSelect }) {
  useMapEvents({
    click(e) {
      onSelect?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    }
  });
  return null;
}

export default function MapWrapper({ center, selected, events = [], onSelect, height = "320px", zoomOnSelect = true }) {
  const mapRef = useRef(null);

  const centerArr = useMemo(() => {
    if (!center) return [22.51, 88.40];
    return [Number(center.lat), Number(center.lng)];
  }, [center]);

  const selectedArr = useMemo(() => {
    if (!selected) return null;
    return [Number(selected.lat), Number(selected.lng)];
  }, [selected]);

  const eventCoords = useMemo(() => {
    return events
      .map(ev => {
        const lat = Number(ev.lat);
        const lng = Number(ev.lng);
        if (!isFinite(lat) || !isFinite(lng)) return null;
        return [lat, lng];
      })
      .filter(Boolean);
  }, [events]);

  const whenCreated = (mapInstance) => {
    mapRef.current = mapInstance;
    // Adjusted timeout and second invalidateSize call for robustness in modals
    setTimeout(() => {
      try {
        mapInstance.invalidateSize();
      } catch (e) { /* ignore */ }
      // a second pass after layout settles
      setTimeout(() => {
        try {
          mapInstance.invalidateSize();
        } catch (e) { /* ignore */ }
      }, 200); // 200ms after the first call
    }, 400); // Initial delay of 400ms
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (eventCoords.length === 0) {
      if (selectedArr && zoomOnSelect) {
        try { map.flyTo(selectedArr, 14); } catch (e) {}
      } else {
        try { map.setView(centerArr, 12); } catch (e) {}
      }
      return;
    }
    try {
      const bounds = L.latLngBounds(eventCoords);
      map.fitBounds(bounds.pad(0.15), { maxZoom: 15, animate: true });
    } catch (err) {
      try { map.setView(centerArr, 12); } catch (e) {}
    }
  }, [eventCoords, centerArr, selectedArr, zoomOnSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!selectedArr) return;
    try { map.flyTo(selectedArr, 15, { animate: true }); } catch (err) {}
  }, [selectedArr]);

  return (
    <div style={{ height: height || '350px', marginBottom: "10px", borderRadius: "10px", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.1)", position: 'relative' }}>
      <MapContainer
        center={centerArr}
        zoom={12}
        style={{ height: "100%", width: "100%" }}
        whenCreated={whenCreated}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <ClickHandler onSelect={onSelect} />

        {selectedArr && (
          <Marker position={selectedArr}>
            <Popup>Selected location</Popup>
          </Marker>
        )}

        {events.map((ev) => {
          const lat = Number(ev.lat);
          const lng = Number(ev.lng);
          if (!isFinite(lat) || !isFinite(lng)) return null;
          return (
            <Marker key={ev.id || `${lat}-${lng}`} position={[lat, lng]}>
              <Popup>
                <div style={{ fontWeight: 700 }}>{ev.title || "Event"}</div>
                {ev.description && <div style={{ fontSize: 12 }}>{ev.description}</div>}
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}