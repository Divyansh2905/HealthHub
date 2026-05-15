// src/pages/ResourceHub/ResourceHub.jsx
import React, { useEffect, useMemo, useState } from "react";
// Corrected paths to go up one level to 'src' then into the respective folders
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore"; // This is usually from 'firebase/firestore' directly if installed
import { db } from "../../firebase/config"; // Corrected path: from pages/ResourceHub/ to src/firebase/
import ProviderCard from "../../components/ProviderCard"; // Corrected path: from pages/ResourceHub/ to src/components/
import { useAuth } from "../../hooks/useAuth"; // Corrected path: from pages/ResourceHub/ to src/hooks/

/**
 * ResourceHub - lists providers and NGOs
 */
export default function ResourceHub() {
  const { profile } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // filters
  const [q, setQ] = useState("");
  // Set initial onlyVerified to "false" explicitly to show both verified and unverified profiles by default
  const [onlyVerified, setOnlyVerified] = useState(false);
  // Set initial roleFilter to "all" to show both providers and NGOs by default
  const [roleFilter, setRoleFilter] = useState("all"); // provider | ngo | all

  useEffect(() => {
    // Query for users with role in (provider, ngo)
    const roles = roleFilter === "all" ? ["provider", "ngo"] : [roleFilter];

    const qref = query(
      collection(db, "users"),
      where("role", "in", roles),
      orderBy("displayName")
    );

    const unsub = onSnapshot(qref, (snap) => {
      const arr = [];
      snap.forEach((doc) => {
        arr.push({ uid: doc.id, ...doc.data() });
      });
      console.log("Firestore users fetched:", arr); // Debug: log all fetched users
      setItems(arr);
      setLoading(false);
    }, (err) => {
      console.error("ResourceHub snapshot error:", err);
      setLoading(false);
    });

    return () => unsub();
  }, [roleFilter]); // The useEffect dependency for roleFilter ensures the query updates when the dropdown changes

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter((p) => {
      // This line filters based on the 'onlyVerified' state
      if (onlyVerified && !p.verified) return false;
      if (!term) return true;
      const hay = `${p.displayName || ""} ${p.orgName || ""} ${(p.services || []).join(" ")}`.toLowerCase();
      return hay.includes(term);
    });
  }, [items, q, onlyVerified]);

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Resource Hub</h2>
        <div className="text-sm text-gray-500">Find verified providers and NGOs</div>
      </div>

      <div className="bg-white p-3 rounded border grid grid-cols-1 md:grid-cols-4 gap-3">
        <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search name, org or service" className="md:col-span-2 border p-2 rounded" />
        <div>
          <label className="block text-xs text-gray-500 mb-1">Role</label>
          <select value={roleFilter} onChange={(e)=>setRoleFilter(e.target.value)} className="w-full border p-2 rounded h-12">
            {/* ENSURE 'All' OPTION IS PRESENT AND CORRESPONDS TO THE STATE */}
            <option value="all">All</option>
            <option value="provider">Providers</option>
            <option value="ngo">NGOs</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Verified</label>
          <label htmlFor="verified" className="flex items-center justify-between gap-3 w-full border rounded p-3 cursor-pointer hover:bg-slate-50 transition-colors duration-150">
            <span className="text-sm font-medium text-gray-700">Only verified</span>
            <input id="verified" type="checkbox" checked={onlyVerified} onChange={(e)=>setOnlyVerified(e.target.checked)} className="h-5 w-5 text-blue-600 rounded" />
          </label>
        </div>
      </div>

      <div className="grid gap-3">
        {loading && <div className="text-center p-6">Loading providers...</div>}
        {!loading && filtered.length === 0 && <div className="text-center p-6 text-gray-500">No providers found.</div>}

        {filtered.map((p) => (
          <ProviderCard key={p.uid} provider={p} />
        ))}
      </div>
    </div>
  );
}
