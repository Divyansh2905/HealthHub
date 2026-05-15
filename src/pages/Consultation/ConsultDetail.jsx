// src/pages/Consultation/ConsultDetail.jsx
import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  doc, onSnapshot, updateDoc, serverTimestamp, addDoc, collection, getDoc
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../components/ToastProvider";
import AlertDialog from "../../components/AlertDialog"; // Import AlertDialog for confirmations

// Helper function to convert a Firestore Timestamp or ISO string to a JavaScript Date object.
// This ensures consistent date handling across the component.
function toDateObject(dateValue) {
  if (dateValue?.toDate) { // Check if it's a Firestore Timestamp
    return dateValue.toDate();
  }
  if (typeof dateValue === 'string') { // Check if it's an ISO string
    const d = new Date(dateValue);
    return Number.isFinite(d.getTime()) ? d : null; // Return null if parsing fails
  }
  return null; // Return null for other types or null/undefined
}

// Helper function to check if a date is in the future
// 'date' here is expected to be a JavaScript Date object.
function isFuture(date, minutesAhead = 0) {
  if (!date) return false;
  const t = date.getTime();
  return Number.isFinite(t) && t > Date.now() + minutesAhead * 60_000;
}

// Helper function to check if a date is within the join window
// 'date' here is expected to be a JavaScript Date object.
function canJoinWindow(date, preMinutes = 10, postMinutes = 120) {
  if (!date) return false;
  const t = date.getTime();
  const now = Date.now();
  return now >= t - preMinutes * 60_000 && now <= t + postMinutes * 60_000;
}

function randomRoom() {
  return "rep" + Math.random().toString(36).substring(2, 10); // only letters+numbers
}


export default function ConsultDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { addToast } = useToast();

  const [consult, setConsult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState(""); // Used for provider notes input
  const [prescriptionText, setPrescriptionText] = useState(""); // Used for prescription input
  const [declineNote, setDeclineNote] = useState("");

  // AlertDialog state (from Version 1)
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [alertActionCallback, setAlertActionCallback] = useState(null);
  const [showAlertConfirm, setShowAlertConfirm] = useState(false);
  const [showAlertCancel, setShowAlertCancel] = useState(false);

  // Function to show AlertDialog (from Version 1)
  const showAlert = (title, message, callback = null, showConfirm = false, showCancel = false) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertActionCallback(() => callback); // Use functional update
    setShowAlertConfirm(showConfirm);
    setShowAlertCancel(showCancel);
    setIsAlertOpen(true);
  };

  // AlertDialog confirmation handler (from Version 1)
  const handleAlertConfirm = () => {
    if (alertActionCallback) {
      alertActionCallback();
    }
    setIsAlertOpen(false);
    setAlertActionCallback(null);
  };

  // AlertDialog cancellation handler (from Version 1)
  const handleAlertCancel = () => {
    setIsAlertOpen(false);
    setAlertActionCallback(null);
  };

  // Main useEffect for fetching consultation data and initializing inputs
  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(
      doc(db, "consultations", id),
      (snap) => {
        if (!snap.exists()) {
          setConsult(null);
        } else {
          const data = snap.data();
          setConsult({ id: snap.id, ...data });
          // Initialize notes and prescriptionText inputs only if they are currently empty
          // This prevents overwriting user's typing with old data on subsequent snapshots
          if (notes === "") {
            setNotes(data.notes || "");
          }
          if (prescriptionText === "") {
            setPrescriptionText(data.prescriptionText || "");
          }
        }
        setLoading(false);
      },
      (err) => {
        console.error("consult snap err", err);
        addToast({ type: "error", title: "Load failed", message: "Could not load consultation." });
        setLoading(false);
      }
    );
    return () => unsub();
  }, [id, addToast, notes, prescriptionText]); // Added notes and prescriptionText to deps for initial load check

  // Effect to handle automatic status change to "expired" (from Version 1)
  useEffect(() => {
    if (consult?.status === "proposed" && consult.proposedTimes?.length > 0) {
      const allProposedTimesHavePassed = consult.proposedTimes.every(t => {
        // Use toDateObject for robust conversion
        const dateObj = toDateObject(t);
        // Check if the proposed time is strictly in the past (0ms grace period)
        return dateObj && dateObj.getTime() < Date.now();
      });
      
      if (allProposedTimesHavePassed) {
        const ref = doc(db, "consultations", consult.id);
        updateDoc(ref, {
          status: "expired",
          updatedAt: serverTimestamp(),
          events: [ ...(consult.events || []), { type: "system_expired", at: Date.now(), note: "All proposed times passed." } ],
        }).then(() => {
          console.log("Consultation expired due to no action.");
          addToast({ type: "info", title: "Expired", message: "This consultation expired as no action was taken on the proposed times." });
        }).catch((err) => {
          console.error("Failed to update status to expired", err);
        });
      }
    }
  }, [consult, addToast, db]); // Added db to deps

  const isAdmin = profile?.role === "admin";
  const isProvider = profile?.role === "provider" || profile?.role === "ngo";
  const isPatient = !!(consult && user && consult.patientUid === user.uid);
  const isProviderOfThis = !!(consult && user && consult.providerUid === user.uid); // Specific check from Version 2
  const isParticipant = !!(consult && user && (
    consult.patientUid === user.uid || consult.providerUid === user.uid || consult.creatorUid === user.uid
  ));

  // Deny UI if not allowed (rules also enforce)
  if (!loading && !isParticipant && !isAdmin) {
    return <div className="p-6">You do not have access to this consultation.</div>;
  }

  const isCancelled = consult?.status === "cancelled";
  const isCompleted = consult?.status === "completed";
  const hasSchedule = Boolean(consult?.scheduledAt);
  // Convert scheduledAt to Date object for canJoinWindow check (robust handling)
  const scheduledDateObj = toDateObject(consult?.scheduledAt);
  const joinOpen = hasSchedule && canJoinWindow(scheduledDateObj);

  // PATIENT — Accept proposed time
  const handlePatientAccept = async (timeValue) => {
    if (!user || !isPatient) return;
    if (consult.status !== "proposed") {
      addToast({ type: "error", title: "Not allowed", message: "Consultation is not in a proposed state." });
      return;
    }
    // Use toDateObject for robust conversion from Firestore Timestamp or ISO string
    const dateObjToAccept = toDateObject(timeValue);
    if (!isFuture(dateObjToAccept, 0)) {
      addToast({ type: "error", title: "Invalid time", message: "You cannot accept a time in the past." });
      return;
    }
    setBusy(true);
    try {
      // Store the Date object directly; Firestore will convert it to a Timestamp
      await updateDoc(doc(db, "consultations", consult.id), {
        scheduledAt: dateObjToAccept,
        status: "confirmed",
        updatedAt: serverTimestamp(),
        // Add event (from Version 2)
        events: [ ...(consult.events || []), { type: "patient_accepted", at: Date.now(), note: `Accepted ${dateObjToAccept.toLocaleString()}` } ],
      });
      if (consult.providerUid) {
        await addDoc(collection(db, "notifications"), {
          toUid: consult.providerUid,
          fromUid: user.uid,
          title: "Consultation accepted",
          body: `Patient accepted ${dateObjToAccept.toLocaleString()}.`,
          link: `/consultations/${consult.id}`,
          read: false,
          createdAt: serverTimestamp(),
        });
      }
      addToast({ type: "success", title: "Accepted", message: "Consultation scheduled." });
    } catch (err) {
      console.error("patient accept err", err);
      addToast({ type: "error", title: "Failed", message: err.message || "Could not accept." });
    } finally {
      setBusy(false);
    }
  };

  // PATIENT — Decline with availability note
  const handlePatientDecline = async () => {
    if (!user || !isPatient) return;
    if (!declineNote.trim()) {
      addToast({ type: "error", title: "Missing note", message: "Please tell the provider about your free time." });
      return;
    }
    setBusy(true);
    try {
      await updateDoc(doc(db, "consultations", consult.id), {
        status: "declined", // Changed status to declined as per version 1 logic
        updatedAt: serverTimestamp(),
        lastRejectionNote: declineNote.trim(), // From Version 2
        events: [ ...(consult.events || []), { type: "patient_declined", at: Date.now(), note: declineNote.trim() } ], // From Version 2
      });

      // Add the decline note to the report's notes array for visibility (from Version 1)
      const reportRef = doc(db, "reports", consult.reportId);
      const reportSnap = await getDoc(reportRef); // Ensure getDoc is imported
      if (reportSnap.exists()) {
          await updateDoc(reportRef, {
              notes: [...(reportSnap.data().notes || []), {
                  text: `Patient (Declined Proposal): ${declineNote.trim()}`,
                  by: user.uid,
                  at: Date.now()
              }],
              updatedAt: serverTimestamp()
          });
      }

      if (consult.providerUid) {
        await addDoc(collection(db, "notifications"), {
          toUid: consult.providerUid,
          fromUid: user.uid,
          title: "Proposal declined — patient availability",
          body: declineNote.trim(),
          link: `/consultations/${consult.id}`,
          read: false,
          createdAt: serverTimestamp(),
        });
      }
      setDeclineNote("");
      addToast({ type: "success", title: "Sent", message: "Your note was sent to the provider and the consultation was declined." });
    } catch (err) {
      console.error("patient decline err", err);
      addToast({ type: "error", title: "Failed", message: err.message || "Could not send decline note." });
    } finally {
      setBusy(false);
    }
  };

  // PROVIDER — Start session (only in join window)
  const handleStartSession = async () => {
    if (!user || !isProviderOfThis) return; // Using isProviderOfThis from Version 2
    if (consult.status !== "confirmed") {
      addToast({ type: "error", title: "Not confirmed", message: "The consultation must be confirmed before starting." });
      return;
    }
    if (!hasSchedule || !joinOpen) {
      addToast({ type: "error", title: "Too early/late", message: "You can start within 10 minutes before the scheduled time." });
      return;
    }
    setBusy(true);
    try {
      const room = consult.jitsiRoom || ("consult-" + consult.id);
      await updateDoc(doc(db, "consultations", consult.id), {
        jitsiRoom: room,
        sessionStatus: "live", // From Version 2
        sessionStartedAt: serverTimestamp(), // From Version 2
        updatedAt: serverTimestamp(),
        events: [ ...(consult.events || []), { type: "session_started", at: Date.now() } ], // From Version 2
      });
      if (consult.patientUid) {
        await addDoc(collection(db, "notifications"), {
          toUid: consult.patientUid,
          fromUid: user.uid,
          title: "Session started",
          body: "Your consultation is live. Join now.",
          link: `/consultations/${consult.id}/video`,
          read: false,
          createdAt: serverTimestamp(),
        });
      }
      addToast({ type: "success", title: "Jitsi ready", message: "Opening video room…" });
      navigate(`/consultations/${consult.id}/video`);
    } catch (err) {
      console.error("start session err", err);
      addToast({ type: "error", title: "Failed", message: err.message || "Could not start session." });
    } finally {
      setBusy(false);
    }
  };

  // PROVIDER — End session (from Version 2)
  const handleEndSession = async () => {
    if (!user || !isProviderOfThis) return;
    if (consult.sessionStatus !== "live") return;
    setBusy(true);
    try {
      await updateDoc(doc(db, "consultations", consult.id), {
        sessionStatus: "ended",
        sessionEndedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        events: [ ...(consult.events || []), { type: "session_ended", at: Date.now() } ],
      });
      addToast({ type: "success", title: "Session ended", message: "You can add notes/prescription now." });
    } catch (err) {
      addToast({ type: "error", title: "Failed", message: err.message || "Could not end session." });
    } finally {
      setBusy(false);
    }
  };

  // PROVIDER — save notes/prescription (doesn't complete)
  const handleSaveProviderNotes = async () => {
    if (!user || !isProviderOfThis) return; // Using isProviderOfThis
    setBusy(true);
    try {
      await updateDoc(doc(db, "consultations", consult.id), {
        notes: notes || "", // Using 'notes' state variable
        prescriptionText: prescriptionText || "", // Using 'prescriptionText' state variable
        updatedAt: serverTimestamp(),
      });
      addToast({ type: "success", title: "Saved", message: "Notes updated." });
    } catch (err) {
      console.error("save notes err", err);
      addToast({ type: "error", title: "Failed", message: err.message || "Could not save notes." });
    } finally {
      setBusy(false);
    }
  };

  // ADMIN — mark completed (only after a session ended) (from Version 2, integrated with AlertDialog from Version 1)
  const handleAdminComplete = async () => {
    if (!user) return;
    if (consult.sessionStatus !== "ended") {
      addToast({ type: "error", title: "Not allowed", message: "A session must be ended before completion." });
      return;
    }
    
    // Use AlertDialog for confirmation (from Version 1)
    showAlert(
      "Confirm Completion",
      "Are you sure you want to mark this consultation as completed? You will also have an option to mark the associated report as resolved.",
      async () => {
        setBusy(true);
        try {
          await updateDoc(doc(db, "consultations", consult.id), {
            status: "completed",
            updatedAt: serverTimestamp(),
            events: [ ...(consult.events || []), { type: "admin_completed", at: Date.now() } ], // From Version 2
          });

          // Ask if they want to resolve the associated report (from Version 1)
          showAlert(
            "Resolve Report?",
            "Do you also want to mark the associated report as resolved? This is irreversible.",
            async () => {
              // User confirmed to resolve report
              const reportRef = doc(db, "reports", consult.reportId); // Ensure getDoc is imported earlier
              await updateDoc(reportRef, {
                status: "resolved",
                updatedAt: serverTimestamp(),
                // Ensure `consult.notes` and `notes` state are used correctly
                notes: [...(Array.isArray(consult.notes) ? consult.notes : []), { // Handle existing consult.notes array
                  text: `Consultation completed by Admin. Provider notes: ${notes || 'N/A'}. Prescription: ${prescriptionText || 'N/A'}`,
                  by: user.uid,
                  at: Date.now()
                }]
              });
              addToast({ type: "success", title: "Report Resolved", message: "Consultation and report marked as completed/resolved." });
            },
            true, // Show confirm button for inner alert
            true  // Show cancel button for inner alert
          );

          addToast({ type: "success", title: "Completed", message: "Consultation marked as completed." });
        } catch (err) {
          console.error("mark complete err", err);
          addToast({ type: "error", title: "Failed", message: err.message || "Could not mark completed." });
        } finally {
          setBusy(false);
        }
      },
      true, // Show confirm button for initial alert
      true  // Show cancel button for initial alert
    );
  };

  if (loading) return <div className="p-6">Loading…</div>;
  if (!consult) return <div className="p-6">Consultation not found.</div>;

  const showAcceptReject = isPatient && consult.status === "proposed" && !isCancelled && !isCompleted;
  // Adjusted showStart logic to use sessionStatus for finer control (from Version 2)
  const showStart = isProviderOfThis && consult.status === "confirmed" && hasSchedule && !isCancelled && !isCompleted && consult.sessionStatus !== "live" && consult.sessionStatus !== "ended";
  const showEnd = isProviderOfThis && consult.sessionStatus === "live"; // From Version 2
  // Completion logic for the assigned provider or admin once the session has ended
  const showAdminComplete = (isAdmin || isProviderOfThis) && consult.sessionStatus === "ended" && consult.status !== "completed";

  return (
    <div className="max-w-3xl mx-auto p-4 bg-white rounded shadow-sm space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Consultation</h2>
        <Link to={`/reports/${consult.reportId}`} className="text-sm text-blue-600 hover:underline">View report</Link>
      </div>

      <div className="text-sm text-gray-600">
        Status: <strong>{consult.status}</strong>
        {consult.sessionStatus ? ` • Session: ${consult.sessionStatus}` : ""} {/* From Version 2 */}
        {/* Display scheduledAt, robustly converting to Date object for proper formatting */}
        {consult.scheduledAt && <> • Scheduled: {toDateObject(consult.scheduledAt)?.toLocaleString()}</>}
        {consult.jitsiRoom && <> • Room: <span className="font-mono text-xs">{consult.jitsiRoom}</span></>}
      </div>

      {/* PATIENT ACTIONS */}
      {showAcceptReject && (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-4">
          <h3 className="text-lg font-semibold text-gray-800">Propose a Consultation Time</h3>
          
          <div className="flex flex-col gap-2">
            <p className="text-sm text-gray-700">Select one of the times proposed by the provider to accept and confirm the consultation:</p>
            {Array.isArray(consult.proposedTimes) && consult.proposedTimes.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {consult.proposedTimes.map((t, i) => {
                  // Use toDateObject for robust conversion and isFuture check
                  const dateObj = toDateObject(t);
                  const disabled = !isFuture(dateObj); 
                  return (
                    <button
                      key={i}
                      className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors duration-200 shadow-sm
                        ${disabled
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      onClick={() => handlePatientAccept(t)} // Pass original value; handler converts internally
                      disabled={busy || disabled}
                      title={disabled ? "This time has passed and cannot be accepted." : "Click to accept this time."}
                    >
                      Accept: {dateObj?.toLocaleString()}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No proposed times available. The provider may not have added them yet.</p>
            )}
          </div>
          
          <hr className="border-gray-300" />
          
          <div className="space-y-2">
            <h4 className="text-md font-semibold text-gray-800">Decline and Send a Note</h4>
            <p className="text-sm text-gray-700">If none of the times work for you, you can send a note to the provider:</p>
            <textarea
              value={declineNote}
              onChange={(e) => setDeclineNote(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-gray-800"
              placeholder="E.g., 'Sorry, I'm only available on weekends. Please propose a new time.'"
              rows={3}
            />
            <button 
              onClick={handlePatientDecline} 
              className="px-4 py-2 text-sm font-semibold bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={busy || !declineNote.trim()}
            >
              Send Note & Decline
            </button>
          </div>
        </div>
      )}

      {/* PROVIDER ACTIONS */}
      {/* Show Start/Join Session button */}
      {showStart && (
        <div className="p-3 bg-gray-50 border rounded-lg flex items-center justify-between">
          <div className="text-sm text-gray-800">Join window: opens 10 min before the scheduled time.</div>
          <button
            onClick={handleStartSession}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md font-semibold hover:bg-indigo-700 transition-colors duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!joinOpen || busy}
            title={joinOpen ? "Start session" : "Start enabled at join window"}
          >
            {joinOpen ? "Start / Join session" : "Start disabled (too early/late)"}
          </button>
        </div>
      )}

      {/* PATIENT join button */}
      {isPatient && consult.sessionStatus === "live" && (
        <div className="p-3 bg-green-50 border rounded">
          <div className="text-sm">Your consultation is live. Join now:</div>
          <button
            onClick={() => navigate(`/consultations/${consult.id}/video`)}
            className="mt-2 px-4 py-2 bg-green-600 text-white rounded"
          >
            Join session
          </button>
        </div>
      )}
      
      {/* Open Room button (visible if session is live but not necessarily joined) */}
      {consult.sessionStatus === "live" && isProviderOfThis && (
          <div className="p-3 bg-indigo-50 border rounded-lg flex items-center justify-between">
              <div className="text-sm text-indigo-800">The session is currently live.</div>
              <button onClick={() => navigate(`/consultations/${consult.id}/video`)} className="px-4 py-2 bg-indigo-600 text-white rounded-md font-semibold hover:bg-indigo-700 transition-colors duration-200 shadow-sm">
                  Open Room
              </button>
          </div>
      )}

      {/* End Session button */}
      {showEnd && (
        <div className="p-3 bg-gray-50 border rounded">
          <div className="text-sm">End the live session.</div>
          <button onClick={handleEndSession} className="mt-2 px-4 py-2 border rounded" disabled={busy}>End session</button>
        </div>
      )}

      {/* PROVIDER NOTES & PRESCRIPTION */}
      {(isProviderOfThis || isAdmin) && ( // Allow admin to see/edit notes too
        <div className="p-3 bg-gray-50 border rounded">
          <div className="text-sm font-medium">Provider notes & prescription</div>
          <textarea
            className="mt-2 w-full border rounded p-2"
            placeholder="Provider notes…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <textarea
            className="mt-2 w-full border rounded p-2"
            placeholder="Prescription…"
            value={prescriptionText}
            onChange={(e) => setPrescriptionText(e.target.value)}
          />
          <div className="mt-2">
            <button onClick={handleSaveProviderNotes} className="px-3 py-2 border rounded" disabled={busy}>Save notes</button>
          </div>
        </div>
      )}

      {/* ADMIN COMPLETE */}
      {showAdminComplete && (
        <div className="p-3 bg-green-50 border rounded">
          <div className="text-sm">Mark this consultation as completed after the session has ended.</div>
          <button onClick={handleAdminComplete} className="mt-2 px-4 py-2 bg-green-600 text-white rounded" disabled={busy}>
            Mark Completed
          </button>
        </div>
      )}

      {/* HISTORY (from Version 2) */}
      {consult.events?.length > 0 && (
        <div className="p-3 bg-white border rounded">
          <div className="font-semibold text-sm mb-1">History</div>
          <ul className="text-xs text-gray-700 space-y-1">
            {consult.events.slice().reverse().map((e, i) => (
              <li key={i}>• {e.type} — {e.note || ""} {e.at ? new Date(e.at).toLocaleString() : ""}</li>
            ))}
          </ul>
        </div>
      )}

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
