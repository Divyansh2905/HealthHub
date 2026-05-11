// src/pages/Reports/ListReports.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  doc,
  updateDoc,
  serverTimestamp,
  deleteDoc,
  where
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { useAuth } from "../../hooks/useAuth";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "../../components/ToastProvider";
import AlertDialog from "../../components/AlertDialog";
import { useUsers } from "../../hooks/useUsers";

const TYPES = ["All", "illness", "outbreak", "mental", "other"];
const STATUSES = ["Unresolved", "All", "pending", "in_review", "resolved"];

export default function ListReports() {
  const { user, profile } = useAuth(); // may be null if not logged in
  const { addToast } = useToast();
  const navigate = useNavigate();
  const { usersMap, loadingUsers } = useUsers();

  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [type, setType] = useState("All");
  const [statusFilter, setStatusFilter] = useState("Unresolved");
  const [scope, setScope] = useState(profile?.role === "citizen" ? "Mine" : "Auto");
  const [qText, setQText] = useState("");
  const [tagsFilter, setTagsFilter] = useState(""); // tags input (comma-separated)

  // NEW: assigned-toggle state (for provider/ngo) and previous scope save
  const [assignedOnly, setAssignedOnly] = useState(false);
  const [prevScope, setPrevScope] = useState("auto");

  // AlertDialog state
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [alertActionCallback, setAlertActionCallback] = useState(null);

  const showAlert = (title, message, callback = null) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertActionCallback(() => callback);
    setIsAlertOpen(true);
  };

  const handleAlertConfirm = () => {
    if (alertActionCallback) {
      alertActionCallback();
    }
    setIsAlertOpen(false);
    setAlertActionCallback(null);
  };

  const handleAlertCancel = () => {
    setIsAlertOpen(false);
    setAlertActionCallback(null);
  };

  useEffect(() => {
    setLoadingReports(true);
    let q;
    if (profile?.role === "citizen") {
      // Citizen → only own reports
      q = query(collection(db, "reports"), where("uid", "==", user.uid));
    } else {
      // Provider/Admin → all reports
      q = query(collection(db, "reports"));
    }
    const unsub = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0));
      setReports(list);
      setLoadingReports(false);
    }, (error) => {
      console.error("Error fetching reports:", error);
      addToast({ type: "error", title: "Fetch Error", message: "Failed to load reports." });
      setLoadingReports(false);
    });
    return () => unsub();
  }, [addToast]);

  // helper role checks
  const isWorker = (r) => r === "provider" || r === "ngo";
  const canActOn = (r) => {
    if (!profile) return false;
    if (profile.role === "admin") return true;
    if (isWorker(profile.role)) {
      return r.assignedTo === profile.uid || r.assignedTo == null;
    }
    return false;
  };

  // Make sure unauthenticated users are treated as "public" (so they see ALL by default)
  const role = profile?.role || (user ? "citizen" : "public");

  // Set sensible default scope per role — run when role changes
  useEffect(() => {
    if (role === "citizen") {
      setScope("mine");
    } else if (role === "provider" || role === "ngo") {
      setScope("All");
    } else if (role === "admin") {
      setScope("All");
    } else {
      setScope("All"); // public
    }
    // reset assigned-only toggle when role changes
    setAssignedOnly(false);
    setPrevScope("All");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  // parse tagsFilter into array of tags (trimmed, lowercased)
  const requestedTags = useMemo(() => {
    if (!tagsFilter) return [];
    return tagsFilter.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
  }, [tagsFilter]);

  const filtered = useMemo(() => {
    // showMineOnly logic:
    const showMineOnly = scope === "mine" || (scope === "auto" && role === "citizen" && user?.uid);

    return reports.filter((r) => {
      // If assignedOnly toggle is on, only show those assigned to this provider/ngo
      if (assignedOnly) {
        if (!profile) return false;
        if (r.assignedTo !== profile.uid) return false;
      }

      if (showMineOnly && r.uid !== user?.uid) return false;
      if (type !== "All" && r.type !== type) return false;
      if (statusFilter === "Unresolved" && r.status === "resolved") return false;
      if (statusFilter !== "All" && statusFilter !== "Unresolved" && r.status !== statusFilter) return false;

      if (qText) {
        const hay = `${r.title || ""} ${r.description || ""} ${r.address || ""} ${(r.notes || []).map(n => n.text).join(" ")}`.toLowerCase();
        if (!hay.includes(qText.toLowerCase())) return false;
      }

      // Tags filter: if requestedTags present, ensure at least one matches report tags (case-insensitive)
      if (requestedTags.length > 0) {
        const reportTags = (r.tags || []).map(t => String(t).toLowerCase());
        const anyMatch = requestedTags.some(req => reportTags.some(rt => rt === req || rt.includes(req)));
        if (!anyMatch) return false;
      }

      return true;
    });
  }, [reports, type, statusFilter, qText, scope, user, profile, requestedTags, assignedOnly, role]);

  // action functions (unchanged semantics)
  const assignToMe = async (r) => {
    if (!profile) {
      addToast({ type: "error", title: "Permission Denied", message: "You must be logged in to assign reports." });
      return;
    }
    if (r.assignedTo === profile.uid) {
      addToast({ type: "info", title: "Already Assigned", message: "This report is already assigned to you." });
      return;
    }
    if (r.assignedTo && r.assignedTo !== profile.uid) {
      showAlert(
        "Confirm Reassignment",
        `This report is currently assigned to ${usersMap[r.assignedTo]?.displayName || r.assignedTo}. Assigning it to yourself will reassign it. Continue?`,
        async () => {
          try {
            const ref = doc(db, "reports", r.id);
            await updateDoc(ref, {
              assignedTo: profile.uid,
              updatedAt: serverTimestamp(),
            });
            addToast({ type: "success", title: "Reassigned", message: "Report reassigned to you." });
          } catch (err) {
            console.error(err);
            let errorMessage = "Try again. " + (err.message || "Unknown error.");
            if (err.code === "permission-denied") {
              errorMessage = "Permission denied. You might not have the rights to reassign this report.";
            }
            addToast({ type: "error", title: "Failed", message: errorMessage });
          }
        }
      );
      return;
    }

    try {
      const ref = doc(db, "reports", r.id);
      await updateDoc(ref, {
        assignedTo: profile.uid,
        updatedAt: serverTimestamp(),
      });
      addToast({ type: "success", title: "Assigned", message: "Report assigned to you." });
    } catch (err) {
      console.error(err);
      let errorMessage = "Try again. " + (err.message || "Unknown error.");
      if (err.code === "permission-denied") {
        errorMessage = "Permission denied. You might not have the rights to assign this report.";
      }
      addToast({ type: "error", title: "Failed", message: errorMessage });
    }
  };

  const updateReportStatus = async (r, newStatus) => {
    if (!profile) {
      addToast({ type: "error", title: "Permission Denied", message: "You must be logged in to update report status." });
      return;
    }
    const allowedStatuses = ["pending", "in_review", "resolved"];
    if (!allowedStatuses.includes(newStatus)) {
      addToast({ type: "error", title: "Invalid status", message: "Bad status." });
      return;
    }
    try {
      const ref = doc(db, "reports", r.id);
      await updateDoc(ref, {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
      addToast({ type: "success", title: "Updated", message: `Status set to ${newStatus}.` });
    } catch (err) {
      console.error(err);
      let errorMessage = "Try again. " + (err.message || "Unknown error.");
      if (err.code === "permission-denied") {
        errorMessage = "Permission denied. You might not have the rights to change this report's status.";
      }
      addToast({ type: "error", title: "Failed", message: errorMessage });
    }
  };

  const resolveReport = async (reportToResolve) => {
    showAlert(
      "Confirm Resolution",
      "Are you sure you want to mark this report as resolved? This action cannot be undone.",
      () => updateReportStatus(reportToResolve, "resolved")
    );
  };

  // Admin delete (safeguarded)
  const deleteReport = (r) => {
    showAlert(
      "Delete Report",
      `Are you sure you want to permanently delete report "${r.title || r.id}"? This action cannot be undone.`,
      async () => {
        try {
          await deleteDoc(doc(db, "reports", r.id));
          addToast({ type: "success", title: "Deleted", message: "Report deleted." });
        } catch (err) {
          console.error("deleteReport error:", err);
          let errorMessage = "Could not delete report. " + (err.message || "");
          if (err.code === "permission-denied") {
            errorMessage = "Permission denied. You might not have rights to delete reports.";
          }
          addToast({ type: "error", title: "Delete failed", message: errorMessage });
        }
      }
    );
  };

  // UI helpers
  if (loadingReports) {
    return <div className="p-6">Loading reports...</div>;
  }
  if (loadingUsers) {
    return <div className="p-6">Loading user data for display...</div>;
  }

  // scope options for select
  const scopeOptions = (() => {
    if (role === "citizen") {
      return [{ key: "mine", label: "My reports" }, { key: "All", label: "All" }];
    }
    if (role === "provider" || role === "ngo") {
      return [{ key: "All", label: "All" }, { key: "mine", label: "My reports" }];
    }
    if (role === "admin") {
      return [{ key: "All", label: "All" }, { key: "mine", label: "My reports" }];
    }
    return [{ key: "All", label: "All" }, { key: "mine", label: "My reports" }];
  })();

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{role === "citizen" ? "Your Reports" : "Reports"}</h2>

        <div className="flex items-center gap-2">
          {/* New Report, Map */}
          {user && (
            <Link to="/report/new" className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors duration-200">
              New Report
            </Link>
          )}
          <Link to="/map" className="px-3 py-2 bg-cyan-500 text-white border rounded hover:bg-cyan-600 transition-colors duration-200">
            Map
          </Link>

          {/* NEW: My Referrals link for provider/ngo placed at top-right, distinctive color */}
          {(role === "provider" || role === "ngo") && (
            <Link to="/my-referrals" className="px-3 py-2 bg-amber-500 text-white rounded hover:bg-amber-600 transition-colors duration-200">
              My Referrals
            </Link>
          )}

          {/* Assigned-only toggle for provider/ngo (acts as 'accepted reports' toggle) */}
          {(role === "provider" || role === "ngo" || role === "admin") && (
            <button
              onClick={(e) => {
                e.preventDefault();
                // toggle assignedOnly: when turning on, save current scope and force 'all'
                if (!assignedOnly) {
                  setPrevScope(scope);
                  setScope("All");
                  setAssignedOnly(true);
                } else {
                  // turning off -> restore previous scope
                  setAssignedOnly(false);
                  setScope(prevScope || "All");
                }
              }}
              className={`px-3 py-2 rounded border ${assignedOnly ? "bg-green-600 text-white border-green-600 hover:bg-green-700" : "bg-red-500 text-white hover:bg-red-600"}`}
              title="Toggle to show only reports assigned to you (Accepted)"
            >
              {assignedOnly ? "Only Assigned: ON" : "Only Assigned: OFF"}
            </button>
          )}
        </div>
      </div>

      <div className="bg-white p-3 rounded border grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Type</label>
          <select value={type} onChange={(e)=>setType(e.target.value)} className="w-full border p-2 rounded">
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Status</label>
          <select value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)} className="w-full border p-2 rounded">
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs text-gray-500 mb-1">Search</label>
          <input value={qText} onChange={(e)=>setQText(e.target.value)} className="w-full border p-2 rounded" placeholder="title, description, address, notes" />
        </div>

        {/* Tags filter input */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Tags</label>
          <input
            value={tagsFilter}
            onChange={(e)=>setTagsFilter(e.target.value)}
            placeholder="comma-separated (e.g. fever,urgent)"
            className="w-full border p-2 rounded"
          />
        </div>

        {role !== "citizen" && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Scope</label>
            <select value={scope} onChange={(e)=>setScope(e.target.value)} className="w-full border p-2 rounded">
              {scopeOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* (Deprecated quick-links area moved) - keep a small helper row for providers/NGOs to navigate to referrals or assigned if needed */}
      {/* Note: My Referrals is now at the top-right. We keep this area minimal. */}

      <div className="grid gap-3">
        {filtered.map((r) => {
          const assignedUserName = usersMap[r.assignedTo]?.displayName || r.assignedTo || "Unassigned";
          return (
            <Link to={`/reports/${r.id}`} key={r.id} className="block group cursor-pointer">
              <div className="bg-white border rounded p-4 hover:shadow-lg transition-shadow duration-200">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <div className="font-medium text-lg truncate">{r.title}</div>
                      {r.creatorRole && <div className="text-xs px-2 py-0.5 bg-gray-100 rounded text-gray-600">{r.creatorRole}</div>}
                      {r.assignedTo && <div className="text-xs px-2 py-0.5 bg-yellow-100 rounded text-gray-700">Assigned to: {assignedUserName}</div>}
                      {r.status === "resolved" && <div className="text-xs px-2 py-0.5 bg-green-100 rounded text-green-800">Resolved</div>}
                    </div>

                    <div className="text-sm text-gray-700 mt-1 line-clamp-2">{r.description}</div>

                    <div className="text-xs text-gray-500 mt-2 flex items-center gap-2">
                      <div>{r.address || (r.location ? `Lat: ${Number(r.location.lat).toFixed(4)}, Long: ${Number(r.location.lng).toFixed(4)}` : "")}</div>
                      <div>·</div>
                      <div>{r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString() : ""}</div>
                    </div>

                    {/* Tags display */}
                    <div className="mt-2 flex gap-2 flex-wrap">
                      {(r.tags || []).map((t, i) => (
                        <button
                          key={i}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setTagsFilter(t);
                          }}
                          className="text-xs px-2 py-0.5 bg-gray-100 rounded text-gray-700 hover:bg-gray-200"
                        >
                          #{t}
                        </button>
                      ))}
                    </div>

                    {r.photoUrl && <span className="text-xs text-blue-600 underline mt-1 inline-block">View photo</span>}
                  </div>

                  {/* Actions (only visible and enabled if user is authenticated and has permission) */}
                  {user && profile && (
                    <div className="flex flex-col items-end gap-2 shrink-0 min-w-[160px]">
                      {canActOn(r) && r.assignedTo !== profile.uid && (
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); assignToMe(r); }}
                          className="w-full px-3 py-1 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 transition-colors duration-200"
                        >
                          Assign to me
                        </button>
                      )}

                      {r.assignedTo === profile.uid && r.status !== "resolved" && r.status !== "in_review" && (
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); updateReportStatus(r, "in_review"); }}
                          className="w-full px-3 py-1 border rounded text-sm hover:bg-gray-100 transition-colors duration-200"
                        >
                          Mark In Review
                        </button>
                      )}

                      {(profile.role === "admin" || r.assignedTo === profile.uid) && r.status !== "resolved" && (
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); resolveReport(r); }}
                          className="w-full px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition-colors duration-200"
                        >
                          Resolve
                        </button>
                      )}

                      {/* Admin delete */}
                      {profile.role === "admin" && (
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteReport(r); }}
                          className="w-full px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition-colors duration-200"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          );
        })}

        {!filtered.length && (
          <div className="text-center text-gray-500 py-10">
            {!loadingReports && reports.length === 0 ? (
              "No reports found. Be the first to create one!"
            ) : (
              "No reports matching your current filters."
            )}
          </div>
        )}
      </div>

      <AlertDialog
        title={alertTitle}
        message={alertMessage}
        isOpen={isAlertOpen}
        onConfirm={handleAlertConfirm}
        onCancel={handleAlertCancel}
        showConfirmButton={!!alertActionCallback}
        showCancelButton={!!alertActionCallback}
        onClose={handleAlertCancel}
      />
    </div>
  );
}
