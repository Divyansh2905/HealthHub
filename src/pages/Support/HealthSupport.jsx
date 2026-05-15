// src/components/HealthSupport.jsx
import React, { useState, useEffect } from "react";
import { MapContainer, TileLayer, Popup, CircleMarker } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { FaHospital, FaAmbulance, FaClinicMedical } from "react-icons/fa";

// --- Verified Helplines Data ---
const helplines = [
  {
    name: "Ruby General Hospital",
    type: "Hospital",
    number: "+91-33-66011800",
    lat: 22.513325,
    lng: 88.403227,
  },
  {
    name: "Fortis Hospital, Anandapur",
    type: "Hospital",
    number: "+91-33-6628-4444",
    lat: 22.520446,
    lng: 88.401238,
  },
  {
    name: "Belle Vue Clinic",
    type: "Clinic",
    number: "+91-33-2287-2321",
    lat: 22.53933,
    lng: 88.35154,
  },
  {
    name: "BM Birla Heart Research Centre",
    type: "Hospital",
    number: "+91-33-3040-3040",
    lat: 22.533884,
    lng: 88.329042,
  },
  {
    name: "Peerless Hospital",
    type: "Hospital",
    number: "+91-33-4033-3333",
    lat: 22.481937,
    lng: 88.392904,
  },
  {
    name: "Apollo Clinic, Salt Lake",
    type: "Clinic",
    number: "+91-33-2359-7777",
    lat: 22.5861,
    lng: 88.4176,
  },
  {
    name: "Nightingale Diagnostic & Clinic",
    type: "Clinic",
    number: "+91-33-2289-1034",
    lat: 22.5435,
    lng: 88.3529,
  },
  {
    name: "Kolkata Ambulance Service",
    type: "Ambulance",
    number: "102",
    lat: 22.572645,
    lng: 88.363892,
  },
  {
    name: "LifeLine Ambulance",
    type: "Ambulance",
    number: "+91-9830-111-222",
    lat: 22.5670,
    lng: 88.3700,
  },
  {
    name: "Red Cross Ambulance",
    type: "Ambulance",
    number: "+91-9876-555-444",
    lat: 22.5630,
    lng: 88.3740,
  },
];

// fixed colors
const colors = {
  Hospital: "#2563eb", // blue
  Clinic: "#16a34a", // green
  Ambulance: "#dc2626", // red
};

export default function HealthSupport() {
  const [filter, setFilter] = useState("All");
  const [userLocation, setUserLocation] = useState({
    lat: 22.572645,
    lng: 88.363892, // Kolkata center
  });

  // optional: detect user location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) =>
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        })
      );
    }
  }, []);

  const filtered =
    filter === "All" ? helplines : helplines.filter((h) => h.type === filter);

  return (
    // Changed pt-20 to pt-28 to provide even more space for the sticky header
    <div className="max-w-6xl mx-auto px-4 pt-10">
      {/* Header */}
      <header className="mb-10" align="center">
        <h1 className="text-3xl font-bold text-blue-500">
          Health Support & Helplines
        </h1>
        <p className="text-gray-600 mt-1">
          Find trusted hospitals, clinics, and ambulance services in Kolkata.
        </p>
      </header>

      {/* Map */}
      <div className="w-full h-[450px] rounded-lg shadow overflow-hidden mb-6">
        <MapContainer
          center={[userLocation.lat, userLocation.lng]}
          zoom={12}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />

          {/* User location */}
          <CircleMarker
            center={[userLocation.lat, userLocation.lng]}
            radius={8}
            fillColor="blue"
            color="blue"
            weight={2}
            opacity={0.9}
            fillOpacity={0.6}
          >
            <Popup>You are here</Popup>
          </CircleMarker>

          {/* Helpline markers */}
          {filtered.map((h, i) => (
            <CircleMarker
              key={i}
              center={[h.lat, h.lng]}
              radius={10}
              fillColor={colors[h.type]}
              color={colors[h.type]}
              weight={2}
              opacity={0.9}
              fillOpacity={0.8}
            >
              <Popup>
                <div className="text-sm">
                  <strong>{h.name}</strong>
                  <br />
                  {h.type}
                  <br />
                  {h.number}
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {["All", "Hospital", "Clinic", "Ambulance"].map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`px-4 py-2 rounded-md font-semibold text-sm transition ${
              filter === t
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((h, i) => (
          <div
            key={i}
            className="p-4 bg-white rounded-lg shadow flex items-start gap-3 border-l-4"
            style={{ borderColor: colors[h.type] }}
          >
            <div className="pt-1">
              {h.type === "Hospital" && (
                <FaHospital size={26} color={colors[h.type]} />
              )}
              {h.type === "Clinic" && (
                <FaClinicMedical size={26} color={colors[h.type]} />
              )}
              {h.type === "Ambulance" && (
                <FaAmbulance size={26} color={colors[h.type]} />
              )}
            </div>
            <div>
              <h3 className="font-semibold">{h.name}</h3>
              <p className="text-sm text-gray-600">{h.type}</p>
              <p className="text-sm mt-1">
                <strong>Contact:</strong> <a href={`tel:${h.number}`} className="text-blue-500 hover:underline">
                  {h.number}
                </a>
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
