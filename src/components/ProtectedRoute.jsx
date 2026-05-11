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

  if (loading) return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-10 bg-slate-50">
      <div className="w-full max-w-sm rounded-[2rem] border border-slate-200 bg-white shadow-2xl p-8 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600">
          <svg className="h-8 w-8 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle className="opacity-25" cx="12" cy="12" r="10" />
            <path d="M4 12a8 8 0 018-8" strokeLinecap="round" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-slate-900 mb-2">Loading..</h2>
        <p className="text-sm text-slate-500">Hang tight while we securely load everything for you.</p>
      </div>
    </div>
  );

  // Not authenticated -> redirect
  if (!user) return <Navigate to={redirectTo} replace />;

  // User authenticated but profile doc not yet created/loaded
  if (user && profile == null) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4 py-10 bg-slate-50">
        <div className="w-full max-w-sm rounded-[2rem] border border-slate-200 bg-white shadow-2xl p-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 8v4l2 2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="12" r="10" className="opacity-20" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Finishing setup…</h2>
          <p className="text-sm text-slate-500">We are preparing your profile and permissions. This should only take a moment.</p>
        </div>
      </div>
    );
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
