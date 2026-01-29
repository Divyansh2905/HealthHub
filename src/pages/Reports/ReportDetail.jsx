// src/pages/Reports/ReportDetail.jsx
import React, { useEffect, useState } from "react";
import { doc, onSnapshot, updateDoc, serverTimestamp, collection, query, where, orderBy, onSnapshot as onSnapQuery, arrayUnion, getDoc } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../components/ToastProvider";
import { useUsers } from "../../hooks/useUsers";
import AlertDialog from "../../components/AlertDialog";

export default function ReportDetail() {
  const { id } = useParams();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [consultations, setConsultations] = useState([]); // State to hold consultations
  const [note, setNote] = useState("");
  const { user, profile } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const { usersMap, loadingUsers } = useUsers();

  // State for AlertDialog
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [alertActionCallback, setAlertActionCallback] = useState(null);
  const [showAlertConfirm, setShowAlertConfirm] = useState(false);
  const [showAlertCancel, setShowAlertCancel] = useState(false);

  const showAlert = (title, message, callback = null, showConfirm = true, showCancel = true) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertActionCallback(() => callback);
    setShowAlertConfirm(showConfirm);
    setShowAlertCancel(showCancel);
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
    if (!id) return;
    const ref = doc(db, "reports", id);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setReport(null);
      } else {
        setReport({ id: snap.id, ...snap.data() });
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching report detail:", error);
      addToast({ type: "error", title: "Fetch Error", message: "Failed to load report details." });
      setLoading(false);
    });

    return () => unsub();
  }, [id, addToast]);

  const isAdmin = profile?.role === "admin";
  const isCreator = profile?.uid && profile.uid === report?.uid; // Added
  const isAssignedProvider = profile?.uid && report?.assignedTo === profile.uid; // Added
  const isProviderOrNGO = profile?.role === "provider" || profile?.role === "ngo"; // New helper

  // Only show consultations when the report is assigned AND the viewer is creator/assignee/admin
  // Changed condition: A patient (creator) or any provider/NGO/Admin can see consultations if assigned
  const canSeeConsultations = !!report?.assignedTo && (isCreator || isAssignedProvider || isAdmin || isProviderOrNGO);

  // Provider can propose ONLY if assigned to this report and report is not resolved
  const canProposeForThisProvider = isAssignedProvider && report?.status !== "resolved";

  // Listen to consultations for this report (only if user eligible and report is assigned)
  useEffect(() => {
    if (!id) return; // Ensure ID exists
    // Guard the consultation query effect: only run if user can see consultations
    // Or if current user is not logged in but it's a public report (not assigned) - depends on overall app visibility
    if (!canSeeConsultations) {
      setConsultations([]); // Clear consultations if user is not allowed to see them
      return;
    }
    
    // orderBy("createdAt", "desc") is good for display, but ensure you have an index for this in Firestore.
    // If you encounter "The query requires an index" errors, you may need to create it in the Firebase Console
    // or remove this orderBy for simple queries.
    const q = query(
      collection(db, "consultations"),
      where("reportId", "==", id),
      orderBy("createdAt", "desc") // Ordering by createdAt
    );

    const unsub = onSnapQuery(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setConsultations(list);
    }, (err) => {
      console.error("consultations query err", err);
      setConsultations([]);
    });
    return () => unsub();
  }, [id, canSeeConsultations, db]); // Added db to dependencies

  if (loading || loadingUsers) return <div className="p-6">Loading...</div>;
  if (!report) return <div className="p-6">Report not found.</div>;

  // Determine if the current user can assign this report
  // (Admin, or Provider/NGO that is not assigned to it yet or assigning to unassigned).
  // This logic is sensitive, tied to Firebase Security Rules.
  const canAssign = profile && (profile.role === "admin" || profile.role === "provider" || profile.role === "ngo");
  // canResolve: Admin, or the currently assigned user
  const canResolve = profile && (profile.role === "admin" || report.assignedTo === profile.uid);
  // canAddNote: Admin, or the currently assigned user or the creator of the report
  // (This matches your security rules for reports where creator can update notes)
  const canAddNote = profile && (profile.role === "admin" || report.assignedTo === profile.uid || report.uid === profile.uid);
  // canRefer: Admin, Provider, or NGO (This logic remains as per your previous implementation)
  const canRefer = profile && (profile.role === "admin" || profile.role === "provider" || profile.role === "ngo");


  const assignToMe = async () => {
    if (!profile) {
      addToast({ type: "error", title: "Permission Denied", message: "You must be logged in to assign reports." });
      return;
    }
    // Logic to prevent re-assignment if already assigned to current user (button is hidden anyway)
    if (report.assignedTo === profile.uid) {
        addToast({ type: "info", title: "Already Assigned", message: "This report is already assigned to you." });
        return;
    }
    // Warn if trying to assign a report already taken by someone else (but allow if rules permit)
    if (report.assignedTo && report.assignedTo !== profile.uid) {
        showAlert(
            "Confirm Reassignment",
            `This report is currently assigned to ${usersMap[report.assignedTo]?.displayName || report.assignedTo}. Assigning it to yourself will reassign it. Continue?`,
            async () => {
                try {
                    const ref = doc(db, "reports", report.id);
                    await updateDoc(ref, {
                        assignedTo: profile.uid,
                        updatedAt: serverTimestamp(),
                        notes: arrayUnion({ // Add a note when reassigned
                            text: `Report reassigned from ${usersMap[report.assignedTo]?.displayName || report.assignedTo} to ${profile.displayName || user.email}.`,
                            by: user.uid,
                            at: Date.now()
                        })
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
            },
            true, // Show confirm button
            true  // Show cancel button
        );
        return;
    }

    // Standard assignment if not assigned or if it's currently assigned to user
    try {
      const ref = doc(db, "reports", report.id);
      await updateDoc(ref, {
        assignedTo: profile.uid,
        updatedAt: serverTimestamp(),
        notes: arrayUnion({ // Add a note when assigned
            text: `Report assigned to ${profile.displayName || user.email}.`,
            by: user.uid,
            at: Date.now()
        })
      });
      addToast({ type: "success", title: "Assigned", message: "Assigned to you." });
    } catch (err) {
      console.error(err);
      let errorMessage = "Try again. " + (err.message || "Unknown error.");
      if (err.code === "permission-denied") {
        errorMessage = "Permission denied. You might not have the rights to assign this report.";
      }
      addToast({ type: "error", title: "Failed", message: errorMessage });
    }
  };

  const changeStatus = async (newStatus) => {
    try {
      const ref = doc(db, "reports", report.id);
      await updateDoc(ref, {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
      addToast({ type: "success", title: "Status updated", message: `Now ${newStatus}` });
    } catch (err) {
      console.error(err);
      let errorMessage = "Try again. " + (err.message || "Unknown error.");
      if (err.code === "permission-denied") {
        errorMessage = "Permission denied. You might not have the rights to change this report's status.";
      }
      addToast({ type: "error", title: "Failed", message: errorMessage });
    }
  };

  const resolveReport = async () => {
    showAlert(
      "Confirm Resolution",
      "Are you sure you want to mark this report as resolved? This action cannot be undone.",
      () => changeStatus("resolved"),
      true,
      true
    );
  };

  const addNote = async () => {
    if (!note.trim()) {
      addToast({ type: "error", title: "Empty note", message: "Please write something." });
      return;
    }
    if (!canAddNote) {
        addToast({ type: "error", title: "Permission Denied", message: "You can only add notes to your own reports, to reports assigned to you, or if you are an admin." });
        return;
    }

    try {
      const ref = doc(db, "reports", report.id);
      const newNoteEntry = {
        text: note.trim(),
        by: profile?.uid || null,
        at: Date.now()
      };
      await updateDoc(ref, {
        notes: arrayUnion(newNoteEntry),
        updatedAt: serverTimestamp()
      });
      setNote("");
      addToast({ type: "success", title: "Note added" });
    } catch (err) {
      console.error(err);
      let errorMessage = "Try again. " + (err.message || "Unknown error.");
      if (err.code === "permission-denied") {
        errorMessage = "Permission denied. You might not have the rights to add notes to this report.";
      }
      addToast({ type: "error", title: "Failed", message: errorMessage });
    }
  };

  // Function to copy report ID to clipboard - UPDATED TO USE MODERN CLIPBOARD API
  const copyReportIdToClipboard = async () => {
    if (report?.id) {
      try {
        await navigator.clipboard.writeText(report.id); // Use modern API
        addToast({
          type: "success",
          title: "Report ID Copied!",
          message: "Report ID copied to clipboard. Now go to the Providers page and paste it to refer.",
          timeout: 5000 // Give user more time to read instructions
        });
      } catch (err) {
        console.error('Failed to copy text: ', err);
        addToast({ type: "error", title: "Copy Failed", message: "Could not copy report ID automatically. Please copy it manually." });
      } finally {
        // No need to remove temporary textarea with modern API
      }
      navigate("/providers"); // Navigate to providers page after copying
    } else {
      addToast({ type: "error", title: "Error", message: "Report ID not available." });
    }
  };

  const assignedUserName = usersMap[report.assignedTo]?.displayName || report.assignedTo || "Unassigned";
  const creatorUserName = usersMap[report.uid]?.displayName || report.uid || "Unknown Creator";

  return (
    <div className="max-w-4xl mx-auto bg-white p-6 rounded shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-semibold text-gray-900">{report.title}</h2>
        <div className="text-sm text-gray-600">
          {report.type} • <span className="font-medium text-blue-700">{report.status.replace(/_/g, ' ')}</span>
        </div>
      </div>

      <p className="text-base text-gray-700 leading-relaxed">{report.description}</p>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          {/* Location & Photo */}
          {report.photoUrl && (
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <a href={report.photoUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline mt-2 inline-block text-sm">
                View attached photo
              </a>
            </div>
            )}
          

          {/* Notes Section */}
          <div className="mt-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
            <h3 className="font-semibold text-lg text-gray-800 mb-3">Report Notes</h3>
            <div className="space-y-3 mt-2">
              {Array.isArray(report.notes) && report.notes.length > 0 ? (
                report.notes.map((n, i) => {
                  const noteAuthorName = usersMap[n.by]?.displayName || n.by || "Anonymous";
                  return (
                    <div key={i} className="p-3 border border-gray-200 rounded-md bg-white">
                      <div className="text-sm text-gray-800">{n.text}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        <span className="font-medium">{noteAuthorName}</span> • {n.at ? new Date(n.at).toLocaleString() : "N/A"}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-sm text-gray-500">No notes yet for this report.</div>
              )}
            </div>

            <div className="mt-4">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full border border-gray-300 p-2 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-800"
                placeholder="Add a short note (e.g., 'Contacted citizen for more details')"
                rows={3}
                disabled={!canAddNote}
              ></textarea>
              <div className="flex gap-3 mt-2">
                <button
                  onClick={addNote}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md font-semibold hover:bg-blue-700 transition-colors duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!canAddNote}
                >
                  Add note
                </button>
                <button
                  onClick={() => setNote("")}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 transition-colors duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!canAddNote}
                >
                  Clear
                </button>
              </div>
              {!canAddNote && (
                <p className="text-sm text-red-500 mt-2">
                  You can only add notes if you are an admin, are assigned to this report, or are the report's creator.
                </p>
              )}
            </div>
          </div>

          {/* Consultation Section */}
          {canSeeConsultations && ( // Controlled by canSeeConsultations
            <div className="mt-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h3 className="font-semibold text-lg text-gray-800 mb-3">Consultation History</h3>

              {/* Action area */}
              <div className="flex gap-2">
                {canProposeForThisProvider && ( // Controlled by canProposeForThisProvider
                  <button onClick={() => navigate(`/consultations/new?reportId=${report.id}`)} className="px-3 py-2 bg-indigo-600 text-white rounded font-semibold">
                    Propose Consultation
                  </button>
                )}
                {isAdmin && ( // Admin button
                  <button onClick={() => navigate(`/consultations/new?reportId=${report.id}`)} className="px-3 py-2 border rounded font-semibold">
                    Create Consultation (admin)
                  </button>
                )}
                {report.status === "resolved" && ( // Message when resolved
                  <div className="text-xs text-red-600 ml-2 self-center">Report is resolved — no new consultations.</div>
                )}
              </div>

              {/* Consultation history list */}
              <div className="mt-4">
                {!consultations.length && <div className="text-sm text-gray-500 mt-2">No consultations for this report yet.</div>}
                <ul className="space-y-2 mt-2">
                  {consultations.map((c) => (
                    <li key={c.id} className="border rounded p-3 bg-white">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="text-sm font-medium">Status: {c.status}{c.sessionStatus ? ` • Session: ${c.sessionStatus}` : ''}</div>
                          <div className="text-xs text-gray-600">Created by: {c.creatorName}</div>
                          {/* Use toDateObject for robust date handling */}
                          {c.proposedTimes?.length > 0 && (
                            <div className="mt-1 text-xs">
                              Proposed:
                              {c.proposedTimes.map((t, i) => <div key={i}>{new Date(t).toLocaleString()}</div>)}
                            </div>
                          )}
                          {c.scheduledAt && <div className="mt-1 text-xs">Scheduled: {new Date(c.scheduledAt).toLocaleString()}</div>}
                          {c.lastRejectionNote && <div className="mt-1 text-xs text-amber-700">Patient note: {c.lastRejectionNote}</div>}
                          
                          {/* Display Provider's Notes and Prescription if session ended or completed */}
                          {(c.sessionStatus === "ended" || c.status === "completed") && (
                            <>
                              {c.notes && <div className="mt-1 text-xs text-gray-700">Provider Notes: {c.notes}</div>}
                              {c.prescriptionText && <div className="mt-1 text-xs text-gray-700">Prescription: {c.prescriptionText}</div>}
                            </>
                          )}

                        </div>
                        <div className="flex flex-col gap-2 items-end">
                          <Link to={`/consultations/${c.id}`} className="text-sm text-blue-600">Open</Link>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Metadata & Actions */}
        <div className="md:col-span-1 bg-gray-50 p-4 rounded-lg border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Report Details</h3>
          <div className="mt-2 text-sm space-y-2">
            <div><strong>Report ID:</strong> <span className="font-mono text-xs bg-gray-200 px-2 py-1 rounded">{report.id}</span></div>
            <div><strong>Created On:</strong> {report.createdAt?.toDate ? report.createdAt.toDate().toLocaleString() : "N/A"}</div>
            <div className="font-medium"><strong>Assigned to:</strong> {assignedUserName}</div>
          </div>

          <div className="mt-6 flex flex-col gap-3">
            {/* Show Assign to me ONLY if not assigned OR assigned to a different user, AND current user has permission */}
            {canAssign && report.assignedTo !== profile?.uid && (
              <button onClick={assignToMe} className="px-4 py-2 bg-indigo-600 text-white rounded-md font-semibold hover:bg-indigo-700 transition-colors duration-200 shadow-md">
                Assign to me
              </button>
            )}
            {(profile?.role === "admin" || isAssignedProvider) && report.status !== "in_review" && report.status !== "resolved" && (
                <button 
                  onClick={() => changeStatus("in_review")} 
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 font-semibold hover:bg-gray-100 transition-colors duration-200 shadow-sm"
                >
                  Mark In Review
                </button>
            )}

            {canResolve && report.status !== "resolved" && (
              <button onClick={resolveReport} className="px-4 py-2 bg-green-600 text-white rounded-md font-semibold hover:bg-green-700 transition-colors duration-200 shadow-md">
                Resolve Report
              </button>
            )}

            {/* Refer This Report button with copy functionality */}
            {canRefer && (
              <button
                onClick={() => {
                  if (report.assignedTo) {
                    addToast({
                      type: "error",
                      title: "Cannot Refer",
                      message: "This report is already assigned and cannot be referred."
                    });
                    return;
                  }
                  copyReportIdToClipboard();
                }}
                disabled={!!report.assignedTo}
                className={`px-4 py-2 rounded-md font-semibold text-center shadow-md transition-colors duration-200 
                  ${report.assignedTo
                    ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                    : "bg-purple-600 text-white hover:bg-purple-700"
                  }`}
              >
                Refer This Report
              </button>
            )}
          </div>

          <div className="mt-6 flex flex-col gap-2 text-sm">
            <Link to="/reports" className="text-blue-600 hover:underline">← Back to All Reports</Link>
            <Link to="/map" className="text-blue-600 hover:underline">View on Map</Link>
          </div>
        </div>
      </div>

      <AlertDialog
        title={alertTitle}
        message={alertMessage}
        isOpen={isAlertOpen}
        onConfirm={handleAlertConfirm}
        onCancel={handleAlertCancel}
        showConfirmButton={showAlertConfirm}
        showCancelButton={showAlertCancel}
        onClose={handleAlertCancel}
      />
    </div>
  );
}