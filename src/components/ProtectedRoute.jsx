// src/components/ProtectedRoute.jsx
import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

/**
 * ProtectedRoute
 * Props:
 *  - children
 *  - allowRoles: array of allowed roles (e.g. ['provider','ngo']) OR null to allow any authenticated user
 *  - redirectTo: where to send unauthenticated users (default '/login')
 */
export default function ProtectedRoute({ children, allowRoles = null, redirectTo = "/login" }) {
  const { user, profile, loading } = useAuth();

  if (loading) return <div className="p-6">Loading...</div>;

  // Not authenticated -> redirect
  if (!user) return <Navigate to={redirectTo} replace />;

  // User authenticated but profile doc not yet created/loaded
  if (user && profile == null) {
    return <div className="p-6 text-sm text-gray-600">Finishing setup…</div>;
  }

  // Role-based guard
  if (allowRoles && Array.isArray(allowRoles)) {
    const role = profile?.role;
    // allow admin regardless
    if (role !== "admin" && !allowRoles.includes(role)) {
      return <div className="p-6 text-sm text-red-600">Access denied — insufficient permissions.</div>;
    }
  }

  return children;
}
