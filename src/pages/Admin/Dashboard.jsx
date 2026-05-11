// src/pages/Admin/Dashboard.jsx
import React, { useEffect, useState, useCallback } from "react";
import {
  collection, query, getDocs, orderBy, limit,
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { useAuth } from "../../hooks/useAuth";
import { Link, Navigate } from "react-router-dom";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  FaUsers, FaFileAlt, FaStethoscope, FaShareAlt, FaCalendarAlt,
  FaExclamationTriangle, FaCheckCircle, FaClock, FaSync,
  FaNewspaper, FaArrowRight, FaShieldAlt, FaMapMarkerAlt,
  FaHeartbeat, FaUserMd,
} from "react-icons/fa";
import { MdOutlineHealthAndSafety, MdTrendingUp } from "react-icons/md";

// ─── Palette ─────────────────────────────────────────────────────────────────
const C = {
  blue:    "#1d4ed8",
  indigo:  "#4338ca",
  emerald: "#059669",
  amber:   "#d97706",
  red:     "#dc2626",
  purple:  "#7c3aed",
  cyan:    "#0891b2",
  slate:   "#64748b",   // neutral / cancelled
};

// Single source of truth for all status colours.
// Banner cards, charts, and badges all draw from here — guaranteed consistency.
const STATUS_COLOR = {
  // ── Reports ──────────────────────────────────────────
  pending:    C.amber,
  in_review:  C.blue,
  resolved:   C.emerald,
  // ── Consultations ────────────────────────────────────
  proposed:   C.purple,
  confirmed:  C.blue,
  completed:  C.emerald,
  cancelled:  C.slate,   // neutral — user cancelled, not a failure
  expired:    C.amber,
  declined:   C.red,     
  // ── Referrals ────────────────────────────────────────
  accepted:   C.emerald,
  rejected:   C.red,     // negative action → red
  withdrawn:  C.slate,
};

const ROLE_COLOR = {
  citizen:  C.cyan,
  provider: C.emerald,
  ngo:      C.purple,
  admin:    C.amber,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatDate(ts) {
  if (!ts) return "—";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function capitalize(s) {
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

function formatLocation(r) {
  if (r.approxArea && typeof r.approxArea === "string") return r.approxArea;
  if (r.location && typeof r.location === "object" && r.location.lat != null) {
    const lat = Number(r.location.lat).toFixed(3);
    const lng = Number(r.location.lng).toFixed(3);
    return `${lat}°N, ${lng}°E`;
  }
  return "—";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, icon, color, subtext, to, loading }) {
  const inner = (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:shadow-md transition-all duration-200 h-full">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Allow wrapping — no truncate — so label is never cut */}
          <p
            className="font-semibold uppercase text-slate-400 mb-1 leading-tight"
            style={{ fontSize: "9px", letterSpacing: "0.08em" }}
          >
            {label}
          </p>
          <div className="text-2xl font-extrabold text-slate-800 tabular-nums">
            {loading
              ? <span className="inline-block w-12 h-7 bg-slate-100 rounded-lg animate-pulse" />
              : (value ?? "—")}
          </div>
          {subtext && (
            <p className="text-slate-400 mt-1 leading-snug" style={{ fontSize: "10px" }}>
              {subtext}
            </p>
          )}
        </div>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-base flex-shrink-0"
          style={{ backgroundColor: color }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
  if (to) return <Link to={to} className="block h-full">{inner}</Link>;
  return inner;
}

function ChartCard({ title, subtitle, children, className = "", action }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-5 ${className}`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-slate-800 text-sm">{title}</h3>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function StatusBadge({ status }) {
  const color = STATUS_COLOR[status?.toLowerCase?.()] ?? C.slate;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ color, backgroundColor: color + "18" }}
    >
      {capitalize(status)}
    </span>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-100 rounded-xl shadow-lg px-3 py-2 text-xs">
      {label && <p className="font-semibold text-slate-700 mb-1">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-1.5 py-0.5">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color || p.fill }} />
          <span className="text-slate-500">{p.name}:</span>
          <span className="font-semibold text-slate-800">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// Custom inline legend — replaces Recharts' built-in Legend so nothing gets cut
function InlineLegend({ items }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3 px-1">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5 min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: item.color }}
          />
          <span className="text-xs text-slate-500 truncate">{item.name}</span>
          <span className="text-xs font-bold text-slate-700 ml-auto pl-1">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function Skeleton({ className = "" }) {
  return <div className={`bg-slate-100 rounded-xl animate-pulse ${className}`} />;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { user, profile, loading: authLoading } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [data, setData]               = useState(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError]             = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  // Inject DM Sans for the dashboard; won't affect other pages
  useEffect(() => {
    const id = "dm-sans-font";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id   = id;
    link.rel  = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap";
    document.head.appendChild(link);
  }, []);

  const loadData = useCallback(async () => {
    if (!isAdmin) return;
    setDataLoading(true);
    setError(null);
    try {
      const [usersSnap, reportsSnap, consultsSnap, referralsSnap, eventsSnap, blogsSnap] =
        await Promise.all([
          getDocs(query(collection(db, "users"))),
          getDocs(query(collection(db, "reports"), orderBy("createdAt", "desc"), limit(500))),
          getDocs(query(collection(db, "consultations"), limit(500))),
          getDocs(query(collection(db, "referrals"),     limit(500))),
          getDocs(query(collection(db, "events"))),
          getDocs(query(collection(db, "blogs"))),
        ]);

      // ── Users ─────────────────────────────────────────────────────────────
      const roleGroups = { citizen: 0, provider: 0, ngo: 0, admin: 0 };
      let verifiedProviders = 0;
      usersSnap.forEach(doc => {
        const d = doc.data();
        const r = d.role || "citizen";
        roleGroups[r] = (roleGroups[r] || 0) + 1;
        if (r === "provider" && d.verified) verifiedProviders++;
      });
      const userRoleData = Object.entries(roleGroups)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => ({ name: capitalize(k), value: v, color: ROLE_COLOR[k] }));

      // ── Reports ───────────────────────────────────────────────────────────
      const statusCounts = {};
      const typeCounts   = {};
      const recentReports = [];

      reportsSnap.forEach(doc => {
        const d = doc.data();
        const st = d.status || "pending";
        const ty = d.type   || "other";
        statusCounts[st] = (statusCounts[st] || 0) + 1;
        typeCounts[ty]   = (typeCounts[ty]   || 0) + 1;
        if (recentReports.length < 8) recentReports.push({ id: doc.id, ...d });
      });

      const reportTypeData = Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 7)
        .map(([k, v]) => ({ name: capitalize(k), count: v }));

      const openReports     = statusCounts["pending"]   || 0;
      const inReviewReports = statusCounts["in_review"] || 0;
      const resolvedReports = statusCounts["resolved"]  || 0;

      // ── Consultations ─────────────────────────────────────────────────────
      const consultCounts = {};
      consultsSnap.forEach(doc => {
        const st = doc.data().status || "proposed";
        consultCounts[st] = (consultCounts[st] || 0) + 1;
      });
      const consultStatusData = Object.entries(consultCounts).map(([k, v]) => ({
        name: capitalize(k), value: v, color: STATUS_COLOR[k.toLowerCase()] ?? C.slate,
      }));
      const activeConsults = (consultCounts["proposed"] || 0) + (consultCounts["scheduled"] || 0);

      // ── Referrals ─────────────────────────────────────────────────────────
      const referralCounts = {};
      referralsSnap.forEach(doc => {
        const st = doc.data().status || "pending";
        referralCounts[st] = (referralCounts[st] || 0) + 1;
      });
      const referralStatusData = Object.entries(referralCounts).map(([k, v]) => ({
        name: capitalize(k), value: v, color: STATUS_COLOR[k.toLowerCase()] ?? C.slate,
      }));
      const pendingReferrals = referralCounts["pending"] || 0;

      // ── Events ────────────────────────────────────────────────────────────
      const now = new Date();
      let upcomingCount = 0;
      eventsSnap.forEach(doc => {
        const d = doc.data();
        if (d.date && d.time) {
          const start = new Date(`${d.date}T${d.time}`);
          const end   = new Date(start.getTime() + (Number(d.duration || 1) * 86_400_000));
          if (now < end) upcomingCount++;
        }
      });

      setData({
        totalUsers: usersSnap.size,
        totalReports: reportsSnap.size,
        totalConsultations: consultsSnap.size,
        totalReferrals: referralsSnap.size,
        totalEvents: eventsSnap.size,
        totalBlogs: blogsSnap.size,
        verifiedProviders,
        openReports,
        inReviewReports,
        resolvedReports,
        activeConsults,
        pendingReferrals,
        upcomingCount,
        userRoleData,
        reportTypeData,
        consultStatusData,
        referralStatusData,
        recentReports,
      });

      setLastRefreshed(new Date());
    } catch (e) {
      console.error("[AdminDashboard] loadData:", e);
      setError("Failed to load dashboard data. Check your connection and try again.");
    } finally {
      setDataLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) loadData();
  }, [isAdmin, loadData]);

  // ── Auth guards ────────────────────────────────────────────────────────────
  if (authLoading) return (
    <div className="flex items-center justify-center h-64">
      <svg className="animate-spin h-7 w-7 text-blue-600" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <FaShieldAlt className="text-5xl text-red-300" />
      <p className="text-red-600 font-semibold text-sm">Access restricted to administrators.</p>
    </div>
  );

  const resolutionRate = data && data.totalReports > 0
    ? Math.round((data.resolvedReports / data.totalReports) * 100)
    : 0;

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }} className="pb-16 pt-6">

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-8">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 rounded-xl bg-blue-700 flex items-center justify-center shadow">
              <MdOutlineHealthAndSafety className="text-white text-xl" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Admin Dashboard</h1>
          </div>
          <p className="text-xs text-slate-400 pl-0.5">
            {today}
            {lastRefreshed && (
              <span className="ml-2 text-slate-300">
                · Updated {lastRefreshed.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={dataLoading}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-xl transition-colors disabled:opacity-50 self-start sm:self-auto shadow-sm"
        >
          <FaSync className={`text-xs ${dataLoading ? "animate-spin" : ""}`} />
          {dataLoading ? "Refreshing…" : "Refresh Data"}
        </button>
      </div>

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex items-center gap-2 text-red-700 text-xs">
          <FaExclamationTriangle className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── 6 KPI Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <StatCard
          label="Users"
          value={data?.totalUsers}
          icon={<FaUsers />}
          color={C.blue}
          subtext={`${data?.verifiedProviders ?? 0} verified providers`}
          to="/providers"
          loading={dataLoading}
        />
        <StatCard
          label="Reports"
          value={data?.totalReports}
          icon={<FaFileAlt />}
          color={C.red}
          subtext={`${data?.openReports ?? 0} open · ${data?.inReviewReports ?? 0} in review`}
          to="/reports"
          loading={dataLoading}
        />
        <StatCard
          label="Consults"
          value={data?.totalConsultations}
          icon={<FaStethoscope />}
          color={C.cyan}
          subtext={`${data?.activeConsults ?? 0} active`}
          loading={dataLoading}
        />
        <StatCard
          label="Referrals"
          value={data?.totalReferrals}
          icon={<FaShareAlt />}
          color={C.purple}
          subtext={`${data?.pendingReferrals ?? 0} pending`}
          loading={dataLoading}
        />
        <StatCard
          label="Events"
          value={data?.totalEvents}
          icon={<FaCalendarAlt />}
          color={C.amber}
          subtext={`${data?.upcomingCount ?? 0} upcoming`}
          to="/events"
          loading={dataLoading}
        />
        <StatCard
          label="Blogs"
          value={data?.totalBlogs}
          icon={<FaNewspaper />}
          color={C.indigo}
          subtext="Published articles"
          to="/blogs"
          loading={dataLoading}
        />
      </div>

      {/* ── 3 Status Banner Cards ────────────────────────────────────────────
          Colours match STATUS_COLOR exactly so the whole dashboard is coherent:
            pending   → amber
            in_review → blue
            resolved  → emerald                                              */}
      {dataLoading ? (
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">

          {/* PENDING — amber */}
          <div
            className="rounded-2xl p-5 text-white shadow-sm"
            style={{ background: `linear-gradient(135deg, ${C.amber}, #f97316)` }}
          >
            <p className="text-xs font-semibold uppercase tracking-widest opacity-70 mb-1">Open Cases</p>
            <div className="flex items-end gap-1.5">
              <span className="text-4xl font-extrabold tabular-nums">{data.openReports}</span>
              <FaClock className="text-xl opacity-70 mb-1" />
            </div>
            <p className="text-xs mt-2 opacity-60">Pending · awaiting assignment</p>
          </div>

          {/* IN REVIEW — blue (exact same C.blue as STATUS_COLOR.in_review) */}
          <div
            className="rounded-2xl p-5 text-white shadow-sm"
            style={{ background: `linear-gradient(135deg, ${C.blue}, ${C.indigo})` }}
          >
            <p className="text-xs font-semibold uppercase tracking-widest opacity-70 mb-1">Under Review</p>
            <div className="flex items-end gap-1.5">
              <span className="text-4xl font-extrabold tabular-nums">{data.inReviewReports}</span>
              <MdTrendingUp className="text-2xl opacity-70 mb-1" />
            </div>
            <p className="text-xs mt-2 opacity-60">Being actively handled by providers</p>
          </div>

          {/* RESOLVED — emerald (exact same C.emerald as STATUS_COLOR.resolved) */}
          <div
            className="rounded-2xl p-5 text-white shadow-sm"
            style={{ background: `linear-gradient(135deg, ${C.emerald}, #0d9488)` }}
          >
            <p className="text-xs font-semibold uppercase tracking-widest opacity-70 mb-1">Resolved</p>
            <div className="flex items-end gap-1.5">
              <span className="text-4xl font-extrabold tabular-nums">{data.resolvedReports}</span>
              <FaCheckCircle className="text-xl opacity-70 mb-1" />
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs opacity-60">of {data.totalReports} total</p><p className="text-s font-bold opacity-80">{resolutionRate}% resolved</p>
            </div>
            <div className="mt-1.5 w-full bg-white/20 rounded-full h-1">
              <div
                className="bg-white rounded-full h-1 transition-all duration-700"
                style={{ width: `${resolutionRate}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Chart Row 1: User Distribution + Report Types ─────────────────
          "Report Types" replaces the old "Reports by Status" bar chart,
          which was redundant with the 3 banner cards above.               */}
      {dataLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      ) : data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

          {/* User role donut */}
          <ChartCard
            title="User Role Distribution"
            subtitle="All registered users broken down by role"
          >
            {data.userRoleData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={210}>
                  <PieChart>
                    <Pie
                      data={data.userRoleData}
                      cx="50%" cy="50%"
                      innerRadius={60} outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                    >
                      {data.userRoleData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <InlineLegend items={data.userRoleData} />
              </>
            ) : (
              <div className="h-52 flex items-center justify-center text-slate-400 text-xs">No user data</div>
            )}
          </ChartCard>

          {/* Report types horizontal bar */}
          <ChartCard
            title="Report Types"
            subtitle="Most frequently reported health issue categories"
            action={
              <Link to="/reports" className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium">
                View all <FaArrowRight className="text-[10px]" />
              </Link>
            }
          >
            {data.reportTypeData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart
                  data={data.reportTypeData}
                  layout="vertical"
                  margin={{ top: 4, right: 24, left: 4, bottom: 4 }}
                >
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={90}
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Reports" fill={C.blue} radius={[0, 5, 5, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-52 flex items-center justify-center text-slate-400 text-xs">No type data yet</div>
            )}
          </ChartCard>
        </div>
      )}

      {/* ── Chart Row 2: Consultations + Referrals (2-col, larger) ────────── */}
      {dataLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      ) : data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

          {/* Consultations by status */}
          <ChartCard title="Consultations by Status" subtitle="Breakdown across all telemedicine sessions">
            {data.consultStatusData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={210}>
                  <PieChart>
                    <Pie
                      data={data.consultStatusData}
                      cx="50%" cy="50%"
                      innerRadius={60} outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                    >
                      {data.consultStatusData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <InlineLegend items={data.consultStatusData} />
              </>
            ) : (
              <div className="h-52 flex items-center justify-center text-slate-400 text-xs">No consultations yet</div>
            )}
          </ChartCard>

          {/* Referrals by status */}
          <ChartCard title="Referrals by Status" subtitle="Breakdown across all inter-provider referrals">
            {data.referralStatusData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={210}>
                  <PieChart>
                    <Pie
                      data={data.referralStatusData}
                      cx="50%" cy="50%"
                      innerRadius={60} outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                    >
                      {data.referralStatusData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <InlineLegend items={data.referralStatusData} />
              </>
            ) : (
              <div className="h-52 flex items-center justify-center text-slate-400 text-xs">No referrals yet</div>
            )}
          </ChartCard>
        </div>
      )}

      {/* ── Recent Reports Table ─────────────────────────────────────────── */}
      {dataLoading ? (
        <Skeleton className="h-64 mb-4" />
      ) : data && data.recentReports.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-4 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-800 text-sm">Recent Reports</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Latest {data.recentReports.length} health issues submitted by citizens
              </p>
            </div>
            <Link
              to="/reports"
              className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium"
            >
              All reports <FaArrowRight className="text-[10px]" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/70">
                  {["Title", "Type", "Status", "Location", "Submitted"].map(h => (
                    <th
                      key={h}
                      className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.recentReports.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-slate-50 hover:bg-blue-50/30 transition-colors"
                  >
                    <td className="px-5 py-3 max-w-[200px]">
                      <Link
                        to={`/reports/${r.id}`}
                        className="text-blue-700 hover:text-blue-900 font-medium text-xs line-clamp-1 block"
                      >
                        {r.title || "Untitled report"}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-slate-500 text-xs whitespace-nowrap">
                      {capitalize(r.type)}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-5 py-3 text-slate-400 text-xs max-w-[160px] truncate">
                      {formatLocation(r)}
                    </td>
                    <td className="px-5 py-3 text-slate-400 text-xs whitespace-nowrap">
                      {formatDate(r.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Quick Actions ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <h3 className="font-semibold text-slate-800 text-sm mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "All Reports",    to: "/reports",   icon: <FaFileAlt />,      color: C.red     },
            { label: "Manage Events",  to: "/events",    icon: <FaCalendarAlt />,  color: C.amber   },
            { label: "Providers",      to: "/providers", icon: <FaUserMd />,       color: C.emerald },
            { label: "Public Map",     to: "/map",       icon: <FaMapMarkerAlt />, color: C.blue    },
            { label: "Blogs",          to: "/blogs",     icon: <FaNewspaper />,    color: C.indigo  },
            { label: "Health Support", to: "/support",   icon: <FaHeartbeat />,    color: C.purple  },
          ].map(({ label, to, icon, color }) => (
            <Link
              key={label}
              to={to}
              className="flex flex-col items-center justify-center gap-2 py-4 px-2 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/60 transition-all text-center group"
            >
              <span
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-base shadow-sm group-hover:scale-105 transition-transform"
                style={{ backgroundColor: color }}
              >
                {icon}
              </span>
              <span className="text-xs font-medium text-slate-600 group-hover:text-slate-800 leading-tight">
                {label}
              </span>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}