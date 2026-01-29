// src/pages/Consultation/BookConsult.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { collection, addDoc, serverTimestamp, doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../components/ToastProvider";

function toLocalInputValue(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function isFuture(iso, minutesAhead = 5) {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t > Date.now() + minutesAhead * 60_000;
}

export default function BookConsult() {
  const [search] = useSearchParams();
  const reportId = search.get("reportId");
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { addToast } = useToast();

  const [report, setReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(Boolean(reportId));
  const [proposedAt, setProposedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const minLocal = useMemo(() => toLocalInputValue(new Date(Date.now() + 5 * 60_000)), []);

  useEffect(() => {
    if (!reportId) return setLoadingReport(false);
    setLoadingReport(true);
    (async () => {
      try {
        const rSnap = await getDoc(doc(db, "reports", reportId));
        if (!rSnap.exists()) {
          addToast({ type: "error", title: "Report not found", message: "The specified report does not exist." });
          setReport(null);
        } else {
          setReport({ id: rSnap.id, ...rSnap.data() });
        }
      } catch (err) {
        console.error("load report", err);
        addToast({ type: "error", title: "Failed", message: "Could not load report." });
      } finally {
        setLoadingReport(false);
      }
    })();
  }, [reportId]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!user) {
      addToast({ type: "error", title: "Login required", message: "Please login to create a consultation." });
      return;
    }
    if (!reportId) {
      addToast({ type: "error", title: "Missing report", message: "No report specified." });
      return;
    }
    if (report?.status === "resolved") {
      addToast({ type: "error", title: "Report resolved", message: "You cannot propose a consultation on a resolved report." });
      return;
    }
    if (!proposedAt) {
      addToast({ type: "error", title: "Missing time", message: "Please propose a date and time." });
      return;
    }

    const proposedIso = new Date(proposedAt).toISOString();
    if (!isFuture(proposedIso)) {
      addToast({ type: "error", title: "Invalid time", message: "Pick a time at least 5 minutes in the future." });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        reportId,
        creatorUid: user.uid,
        creatorName: profile?.displayName || user.email || "Unknown",
        providerUid: (profile?.role === "provider" || profile?.role === "ngo") ? user.uid : null,
        patientUid: report?.uid || null,
        proposedTimes: [proposedIso],
        scheduledAt: null,
        status: "proposed",
        notes: notes || "",
        jitsiRoom: null,
        events: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, "consultations"), payload);

      if (payload.patientUid) {
        await addDoc(collection(db, "notifications"), {
          toUid: payload.patientUid,
          fromUid: user.uid,
          title: "Consultation proposed",
          body: `${payload.creatorName} proposed a consultation for your report.`,
          link: `/consultations/${docRef.id}`,
          read: false,
          createdAt: serverTimestamp(),
        });
      }

      addToast({ type: "success", title: "Consultation created", message: "Proposed consult created and patient notified." });
      navigate(`/consultations/${docRef.id}`);
    } catch (err) {
      console.error("create consultation", err);
      addToast({ type: "error", title: "Failed", message: err.message || "Could not create consultation." });
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingReport) return <div className="p-6">Loading report…</div>;

  return (
    <div className="max-w-3xl mx-auto p-4 bg-white rounded shadow-sm">
      <h2 className="text-xl font-semibold">Propose a Consultation</h2>

      {report && (
        <div className="mt-2 text-sm text-gray-600">
          For report: <strong>{report.title || report.type || report.id}</strong>
          {report.status === "resolved" && (
            <div className="mt-2 text-red-600">This report is resolved. Proposals are disabled.</div>
          )}
        </div>
      )}

      <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
        <label className="block text-sm">
          Proposed time
          <input
            type="datetime-local"
            value={proposedAt}
            onChange={(e) => setProposedAt(e.target.value)}
            min={minLocal}
            className="mt-1 block w-full border rounded p-2"
            required
            disabled={report?.status === "resolved"}
          />
        </label>

        <label className="block text-sm">
          Notes (optional)
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 block w-full border rounded p-2"
            disabled={report?.status === "resolved"}
          />
        </label>

        <div className="flex gap-2">
          <button disabled={submitting || report?.status === "resolved"} type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded">
            {submitting ? "Submitting…" : "Propose Consultation"}
          </button>
          <button type="button" onClick={() => window.history.back()} className="px-4 py-2 border rounded">Cancel</button>
        </div>
      </form>
    </div>
  );
}