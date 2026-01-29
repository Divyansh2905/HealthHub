// src/pages/Admin/Dashboard.jsx
import React, { useEffect, useState } from "react";
import { getCountFromServer, collection, query } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useAuth } from "../../hooks/useAuth";
import { Link, Navigate } from "react-router-dom";
import { FaUsers, FaChartLine, FaMapMarkerAlt, FaFileAlt, FaCampground, FaNewspaper, FaLink, FaExclamationTriangle } from 'react-icons/fa';

/**
 * A reusable, enhanced card for displaying a key metric.
 */
function DashboardCard({ label, value, to, icon, subtext, color = "bg-blue-50" }) {
  return (
    <Link to={to} className={`block rounded-xl border p-4 shadow-sm hover:shadow-md transition-shadow duration-200 ${color} bg-opacity-75`}>
      <div className="flex items-center space-x-3 mb-2">
        {icon && <div className="text-2xl text-blue-600">{icon}</div>}
        <div className="text-sm font-medium text-gray-500">{label}</div>
      </div>
      <div className="text-3xl font-bold text-gray-800">{value}</div>
      {subtext && <div className="text-xs text-gray-500 mt-1">{subtext}</div>}
    </Link>
  );
}

export default function AdminDashboard() {
  const { user, profile, loading } = useAuth();
  const [counts, setCounts] = useState({ users: 0, reports: 0, publicReports: 0, events: 0, posts: 0 });
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState(null);
  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    if (!isAdmin) return;
    
    async function loadCounts() {
      try {
        setError(null);
        setDataLoading(true);
        const [u, r, pr, c, p] = await Promise.all([
          getCountFromServer(query(collection(db, "users"))),
          getCountFromServer(query(collection(db, "reports"))),
          getCountFromServer(query(collection(db, "publicReports"))),
          getCountFromServer(query(collection(db, "events"))),
          getCountFromServer(query(collection(db, "blogs"))),
        ]);
        setCounts({
          users: u.data().count,
          reports: r.data().count,
          publicReports: pr.data().count,
          events: c.data().count,
          blogs: p.data().count,
        });
      } catch (e) {
        console.error("[AdminDashboard] count error", e);
        setError("Failed to load data. Please check your network and Firebase connection.");
      } finally {
        setDataLoading(false);
      }
    }
    loadCounts();
  }, [isAdmin]);

  if (loading) return <div className="p-4 text-center">Loading authentication...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <div className="p-6 text-center text-red-500">Access denied (admin only)</div>;

  return (
    <div className="space-y-8 p-4 md:p-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Admin Dashboard</h1>
        <p className="text-sm text-gray-500">Overview and quick actions</p>
      </div>

      {dataLoading ? (
        <div className="flex justify-center items-center py-12">
          <svg className="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="ml-3 text-gray-600">Loading data...</span>
        </div>
      ) : error ? (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <FaExclamationTriangle className="inline mr-2" />
          {error}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <DashboardCard
              label="Users"
              value={counts.users}
              to="/admin/users"
              icon={<FaUsers />}
              subtext="Total registered users"
            />
            <DashboardCard
              label="Private Reports"
              value={counts.reports}
              to="/reports"
              icon={<FaFileAlt />}
              subtext="Issues reported by citizens"
            />
            <DashboardCard
              label="Public Map Pins"
              value={counts.publicReports}
              to="/map"
              icon={<FaMapMarkerAlt />}
              subtext="Pins visible on the public map"
            />
            <DashboardCard
              label="events"
              value={counts.events}
              to="/events"
              icon={<FaCampground />}
              subtext="Total health events created"
            />
            <DashboardCard
              label="Awareness Posts"
              value={counts.blogs}
              to="/blogs"
              icon={<FaNewspaper />}
              subtext="Published articles and blogs"
            />
          </div>

          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Quick Links & Actions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Link className="flex items-center px-4 py-2 border rounded-md hover:bg-gray-100 transition-colors" to="/reports">
                <FaFileAlt className="text-blue-600 mr-3" />
                Manage All Reports
              </Link>
              <Link className="flex items-center px-4 py-2 border rounded-md hover:bg-gray-100 transition-colors" to="/events">
                <FaLink className="text-blue-600 mr-3" />
                View & Manage Events
              </Link>
              <Link className="flex items-center px-4 py-2 border rounded-md hover:bg-gray-100 transition-colors" to="/events">
                <FaLink className="text-blue-600 mr-3" />
                Create a New Event
              </Link>
              <Link className="flex items-center px-4 py-2 border rounded-md hover:bg-gray-100 transition-colors" to="/events">
                <FaLink className="text-blue-600 mr-3" />
                View Awareness events
              </Link>
              <Link className="flex items-center px-4 py-2 border rounded-md hover:bg-gray-100 transition-colors" to="/events">
                <FaLink className="text-blue-600 mr-3" />
                Create a New Blog
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}