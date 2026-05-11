// src/pages/Reports/MapView.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "../../components/Map/leafletSetup";
import { toLatLngArray } from "../../components/Map/leafletSetup";
import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useUsers } from "../../hooks/useUsers";
import { useToast } from "../../components/ToastProvider";
import { HeatmapLayer } from "react-leaflet-heatmap-layer-v3";

export default function MapView() {
  const { user, profile } = useAuth();
  const { usersMap } = useUsers();
  const { addToast } = useToast();

  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(true);

  const [type, setType] = useState("all");
  const [statusFilter, setStatusFilter] = useState("unresolved");
  const [qText, setQText] = useState("");
  const [tagsFilter, setTagsFilter] = useState("");
  const [scope, setScope] = useState("auto");
  const [assignedOnly, setAssignedOnly] = useState(false);

  const [showHeatmap, setShowHeatmap] = useState(false);

  const mapRef = React.useRef(null);

  useEffect(() => {
    setLoadingReports(true);

    const isStaff = profile && ["provider", "ngo", "admin"].includes(profile.role);
    // Handle unauthenticated public users
    if (!user) {
      const unsub = onSnapshot(query(collection(db, "publicReports")), (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setReports(list);
        setLoadingReports(false);
      });
      return () => unsub();
    }

    // Handle staff and citizens (dual query for citizens)
    const queries = [];
    if (isStaff) {
      queries.push(query(collection(db, "reports")));
    } else if (user) {
      // Citizens get their own private reports AND all public reports
      queries.push(query(collection(db, "reports"), where("uid", "==", user.uid)));
      queries.push(query(collection(db, "publicReports")));
    }

    // Use Promise.all to fetch both queries simultaneously for citizens
    const unsubs = queries.map((q) =>
    onSnapshot(
      q,
      () => {
      Promise.all(queries.map(q => new Promise((resolve, reject) => onSnapshot(q, snap => resolve(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))), reject)))).then(results => {
        const combined = results.flat().reduce((acc, curr) => ({ ...acc, [curr.id]: curr }), {});
        setReports(Object.values(combined));
        setLoadingReports(false);
      }).catch(error => {
        console.error("MapView: error loading reports", error);
        addToast({ type: "error", title: "Map load failed", message: "Could not load reports for map." });
        setLoadingReports(false);
      });
      }
    )
    );

    return () => unsubs.forEach(unsub => unsub());
  }, [addToast, user, profile]);

  const role = profile?.role || (user ? "citizen" : "public");
  const isStaff = ["provider", "ngo", "admin"].includes(role);

  useEffect(() => {
    if (role === "citizen") {
      setScope("mine");
    } else if (role === "public") {
      setScope("all"); // force public to always see all
    } else {
      setScope("all");
    }
    setAssignedOnly(false);
  }, [role]);

  const requestedTags = useMemo(() => {
    if (!tagsFilter) return [];
    return tagsFilter
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
  }, [tagsFilter]);

  const filteredReports = useMemo(() => {
    const showMineOnly =
      scope === "mine" ||
      (scope === "auto" && role === "citizen" && user?.uid);

    return reports.filter((r) => {
      if (assignedOnly) {
        if (!profile) return false;
        if (r.assignedTo !== profile.uid) return false;
      }

      if (showMineOnly && r.uid !== user?.uid) return false;
      if (type !== "all" && r.type !== type) return false;
      if (statusFilter === "unresolved" && r.status === "resolved") return false;
      if (statusFilter !== "all" && statusFilter !== "unresolved" && r.status !== statusFilter) return false;

      if (qText) {
        const hay = `${r.title || ""} ${r.description || ""}`.toLowerCase();
        if (!hay.includes(qText.toLowerCase())) return false;
      }

      if (requestedTags.length > 0) {
        const rtags = (r.tags || []).map((t) => String(t).toLowerCase());
        const any = requestedTags.some((req) =>
          rtags.some((rt) => rt === req || rt.includes(req))
        );
        if (!any) return false;
      }

      return true;
    });
  }, [
    reports,
    type,
    statusFilter,
    qText,
    requestedTags,
    scope,
    assignedOnly,
    role,
    user,
    profile
  ]);

  const coords = useMemo(() => {
    return filteredReports.map((r) => toLatLngArray(r.location)).filter(Boolean);
  }, [filteredReports]);

  const applyTag = (t) => {
    setTagsFilter(t);
  };

  const onMapCreated = (mapInstance) => {
    mapRef.current = mapInstance;
  };

  const clearFilters = () => {
    setType("all");
    setStatusFilter("unresolved");
    setQText("");
    setTagsFilter("");
  };

  if (loadingReports) {
    return <div className="p-6">Loading map reports...</div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold">Community Reports Map</h2>

        <div className="flex items-center gap-2">
          {user && (
            <Link
              to="/report/new"
              className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors duration-200"
            >
              New Report
            </Link>
          )}
          {user && (
            <Link
              to="/reports"
              className="px-3 py-2  bg-cyan-500 text-white border rounded hover:bg-cyan-600 transition-colors duration-200"
            >
              Back to Reports
            </Link>
          )}

          {(role === "provider" || role === "ngo") && (
            <Link
              to="/my-referrals"
              className="px-3 py-2 bg-amber-500 text-white rounded hover:bg-amber-600 transition-colors duration-200"
            >
              My Referrals
            </Link>
          )}

          {(role === "provider" || role === "ngo") && (
            <button
              onClick={() => {
                if (!assignedOnly) {
                  setAssignedOnly(true);
                  setScope("all");
                } else {
                  setAssignedOnly(false);
                }
              }}
              className={`px-3 py-2 rounded border ${
                assignedOnly
                  ? "bg-green-600 text-white border-green-600 hover:bg-green-700"
                  : "bg-red-500 text-white hover:bg-red-600"
              }`}
            >
              {assignedOnly ? "Assigned: ON" : "Assigned: OFF"}
            </button>
          )}

          <button
            onClick={() => setShowHeatmap((prev) => !prev)}
            className={`px-3 py-2 rounded border ${
              showHeatmap
                ? "bg-purple-600 text-white hover:bg-purple-700"
                : "bg-gray-200 hover:bg-gray-300"
            }`}
          >
            {showHeatmap ? "Heatmap: ON" : "Heatmap: OFF"}
          </button>
        </div>
      </div>

      {/* Filters panel */}
      <div className="bg-white p-3 rounded border grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full border p-2 rounded"
          >
            <option value="all">All</option>
            <option value="illness">Illness</option>
            <option value="outbreak">Outbreak</option>
            <option value="mental">Mental Health</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full border p-2 rounded"
          >
            <option value="unresolved">Unresolved</option>
            <option value="pending">Pending</option>
            <option value="in_review">In Review</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs text-gray-500 mb-1">Search</label>
          <input
            value={qText}
            onChange={(e) => setQText(e.target.value)}
            placeholder="title, description"
            className="w-full border p-2 rounded"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Tags</label>
          <input
            value={tagsFilter}
            onChange={(e) => setTagsFilter(e.target.value)}
            placeholder="comma-separated (e.g. fever,urgent)"
            className="w-full border p-2 rounded"
          />
        </div>

        {role !== "public" && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Scope</label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="w-full border p-2 rounded"
            >
                <option value="all">All</option>
                <option value="mine">My reports</option>
            </select>
          </div>
        )}
      </div>

      {/* Filters summary */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={clearFilters}
          className="px-2 py-1 text-sm border rounded hover:bg-gray-50"
        >
          Clear filters
        </button>
        <div className="text-sm text-gray-600">
          Showing <span className="font-medium">{filteredReports.length}</span>{" "}
          reports
          {assignedOnly && profile
            ? ` assigned to ${profile.displayName || profile.uid}`
            : ""}
        </div>
      </div>

      {/* Map */}
      <div className="w-full rounded overflow-hidden border">
        <MapContainer
          center={[22.51, 78.96]}
          zoom={5}
          style={{ height: "560px" }}
          whenCreated={onMapCreated}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {showHeatmap ? (
            <HeatmapLayer
              fitBoundsOnLoad
              fitBoundsOnUpdate
              points={coords.map((c) => ({ lat: c[0], lng: c[1], value: 1 }))}
              longitudeExtractor={(p) => p.lng}
              latitudeExtractor={(p) => p.lat}
              intensityExtractor={(p) => p.value}
              radius={25}
              blur={20}
              max={1.0}
            />
          ) : (

            filteredReports.map((r) => {
                let pos = null;
                // Prioritize the nested location object, as that is the standard
                if (r.location?.lat && r.location?.lng) {
                    pos = [r.location.lat, r.location.lng];
                } else if (r.lat && r.lng) {
                    // Fallback to top-level lat/lng (for publicReports)
                    pos = [r.lat, r.lng];
                }
              if (!pos) return null;

              const isOwner = user && r.uid === user.uid;
              const canClick = isStaff || isOwner;

              return (
                <Marker key={r.id} position={pos}>
                  <Popup minWidth={220}>
                    <div className="space-y-1 p-1">
                      {canClick ? (
                        <Link
                          to={`/reports/${r.id}`}
                          className="block no-underline text-inherit"
                        >
                          <div className="font-medium text-gray-800">{r.title}</div>
                          <div className="text-xs text-gray-600">{r.type} • {r.status}</div>
                          {r.address && <div className="text-xs text-gray-700">{r.address}</div>}
                          <div className="text-xs text-gray-500">
                            {r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString() : ""}
                          </div>
                        </Link>
                      ) : (
                        <div className="block">
                          <div className="font-medium text-gray-800">{r.title}</div>
                          <div className="text-xs text-gray-600">{r.type} • {r.status}</div>
                          <div className="text-xs text-gray-500">
                            {r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString() : ""}
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            Full details are private. Sign in as staff or the reporter to view.
                          </div>
                        </div>
                      )}

                      {/* Tags */}
                      <div className="mt-1 flex gap-1 flex-wrap">
                        {(r.tags || []).slice(0, 8).map((t, i) => (
                          <button
                            key={i}
                            onClick={(e) => {
                              e.preventDefault();
                              applyTag(t);
                            }}
                            className="text-xs px-2 py-0.5 bg-gray-100 rounded text-gray-700 hover:bg-gray-200"
                          >
                            #{t}
                          </button>
                        ))}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })
          )}
        </MapContainer>
      </div>
    </div>
  );
}
