// src/pages/Referrals/MyReferrals.jsx
import React, { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  serverTimestamp,
  runTransaction,
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../components/ToastProvider";
import { Link } from "react-router-dom";

export default function MyReferrals() {
  const { user, profile } = useAuth();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [received, setReceived] = useState([]);
  const [sent, setSent] = useState([]);
  const [tab, setTab] = useState("received");
  // Determine if the current user has a provider or NGO role
  const isWorker = profile?.role === "provider" || profile?.role === "ngo";

  useEffect(() => {
    if (!user || !isWorker) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const rQ = query(
      collection(db, "referrals"),
      where("toProviderId", "==", user.uid),
      orderBy("createdAt", "desc")
    );
    const sQ = query(
      collection(db, "referrals"),
      where("fromUid", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubR = onSnapshot(rQ, (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() })); // FIXED mapping
      setReceived(arr);
      setLoading(false);
    }, (err) => {
      console.error("received snapshot error:", err);
      addToast({ type: "error", title: "Load failed", message: "Could not load received referrals." });
      setLoading(false);
    });

    const unsubS = onSnapshot(sQ, (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() })); // FIXED mapping
      setSent(arr);
      setLoading(false);
    }, (err) => {
      console.error("sent snapshot error:", err);
      addToast({ type: "error", title: "Load failed", message: "Could not load sent referrals." });
      setLoading(false);
    });

    return () => { try { unsubR(); } catch(e){}; try { unsubS(); } catch(e){}; };
  }, [user]);

  // ACCEPT - Do both report assign + referral update atomically using transaction
  const acceptReferral = async (referral) => {
    if (!user) return;
    if (!referral || !referral.id) {
      addToast({ type: "error", title: "Invalid referral", message: "Referral missing." });
      return;
    }
    // Confirm
    if (!window.confirm(`Accept referral for report "${referral.reportTitle || referral.reportId}"? This will assign the report to you.`)) return;

    const reportRef = doc(db, "reports", referral.reportId);
    const referralRef = doc(db, "referrals", referral.id);

    try {
      await runTransaction(db, async (tx) => {
        const rSnap = await tx.get(reportRef);
        if (!rSnap.exists()) throw new Error("report-not-found");

        const reportData = rSnap.data();
        // Prevent accepting if assigned to someone else already
        if (reportData.assignedTo && reportData.assignedTo !== user.uid) {
          throw new Error("already-assigned");
        }

        // Prepare report updates
        const reportUpdates = {
          assignedTo: user.uid,
          updatedAt: serverTimestamp(),
        };
        if (!reportData.status || reportData.status === "pending") {
          reportUpdates.status = "in_review";
        }

        // Perform updates atomically
        tx.update(reportRef, reportUpdates);
        tx.update(referralRef, {
          status: "accepted",
          respondedAt: serverTimestamp(),
          responseNotes: `Accepted by ${profile?.displayName || user.email || user.uid}`,
        });
      });

      // notify original sender that referral accepted
      await addDoc(collection(db, "notifications"), {
        toUid: referral.fromUid,
        fromUid: user.uid, // the acceptor
        title: "Referral accepted",
        body: `Your referral for report ${referral.reportId} was accepted.`,
        link: `/reports/${referral.reportId}`,
        read: false,
        createdAt: serverTimestamp()
      });

      addToast({ type: "success", title: "Referral Accepted", message: "Report assigned to you." });
      

    } catch (err) {
      console.error("acceptReferral error:", err);
      if (err.message === "already-assigned") {
        addToast({ type: "error", title: "Already assigned", message: "This report is already assigned to someone else. Cannot accept." });
      } else if (err.message === "report-not-found") {
        addToast({ type: "error", title: "Report missing", message: "Referenced report no longer exists." });
      } else if (err.code === "permission-denied") {
        addToast({ type: "error", title: "Permission denied", message: "You may not have permission to assign this report." });
      } else {
        addToast({ type: "error", title: "Accept failed", message: err.message || "Could not accept referral." });
      }
    }
  };

  // DECLINE/REJECT (recipient)
  const declineReferral = async (referral, reason = "") => {
    if (!user) return;
    if (!referral || !referral.id) return;
    if (!window.confirm(`Decline referral for "${referral.reportTitle || referral.reportId}"?`)) return;

    try {
      const referralRef = doc(db, "referrals", referral.id);
      await updateDoc(referralRef, {
        status: "rejected",
        respondedAt: serverTimestamp(),
        responseNotes: `Rejected by ${profile?.displayName || user.email || user.uid}. ${reason}`,
      });

      await addDoc(collection(db, "notifications"), {
      toUid: referral.fromUid,
      fromUid: user.uid,
      title: "Referral declined",
      body: `Referral for report ${referral.reportId} was declined.`,
      link: `/reports/${referral.reportId}`,
      read: false,
      createdAt: serverTimestamp()
    });


      addToast({ type: "info", title: "Referral rejected", message: "You rejected the referral." });
    } catch (err) {
      console.error("declineReferral error:", err);
      if (err.code === "permission-denied") {
        addToast({ type: "error", title: "Permission denied", message: "You may not have rights to reject this referral." });
      } else {
        addToast({ type: "error", title: "Failed", message: err.message || "Could not reject referral." });
      }
    }
  };

  // WITHDRAW/CANCEL (sender). This requires updating rules to allow the sender to set status 'cancelled'
  const withdrawReferral = async (referral) => {
    if (!user) return;
    if (!referral || !referral.id) return;
    if (referral.fromUid !== user.uid) {
      addToast({ type: "error", title: "Not allowed", message: "Only the sender can withdraw this referral." });
      return;
    }
    if (referral.status !== "pending") {
      addToast({ type: "warning", title: "Cannot withdraw", message: "Only pending referrals can be withdrawn." });
      return;
    }
    if (!window.confirm(`Withdraw referral for "${referral.reportTitle || referral.reportId}"?`)) return;

    try {
      const ref = doc(db, "referrals", referral.id);
      await updateDoc(ref, {
        status: "cancelled",
        respondedAt: serverTimestamp(),
        responseNotes: `Withdrawn by sender (${user.uid})`,
      });

      // notify referral recipient
      await addDoc(collection(db, "notifications"), {
        toUid: referral.toProviderId,
        fromUid: user.uid,
        title: "Referral withdrawn",
        body: `Referral for report ${referral.reportId} was withdrawn by the sender.`,
        link: `/reports/${referral.reportId}`,
        read: false,
        createdAt: serverTimestamp()
      });

      addToast({ type: "success", title: "Withdrawn", message: "Referral withdrawn." });
    } catch (err) {
      console.error("withdrawReferral error:", err);
      if (err.code === "permission-denied") {
        addToast({ type: "error", title: "Permission denied", message: "Cannot withdraw via client. Admin intervention required." });
      } else {
        addToast({ type: "error", title: "Failed", message: err.message || "Could not withdraw referral." });
      }
    }
  };

  // Render message if user is not a worker (provider/NGO)
  if (!isWorker) {
      return (
          <div className="min-h-[300px] flex items-center justify-center bg-white p-6 rounded-lg shadow-sm">
              <p className="text-lg text-gray-700">Only health providers and NGOs can view this page.</p>
          </div>
      );
  }

  const renderReferralRow = (r) => {
    const fromMe = r.fromUid === user.uid;
    const isRecipient = r.toProviderId === user.uid;
    const status = r.status || "pending";
    return (
      <div key={r.id} className="bg-white border rounded p-3 flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="font-medium">{r.reportTitle || r.reportId}</div>
          <div className="text-xs text-gray-600">Report id: {r.reportId}</div>
          <div className="text-xs text-gray-500 mt-1">From: {r.fromName || r.fromUid} • To: {r.toName || r.toProviderId}</div>
          <div className="text-xs text-gray-400 mt-1">Status: <span className="font-medium">{status}</span></div>
        </div>

        <div className="flex flex-col gap-2 w-40">
          { isRecipient && status === "pending" && (
            <>
              <button onClick={() => acceptReferral(r)} className="px-3 py-1 bg-indigo-600 text-white rounded text-sm">Accept</button>
              <button onClick={() => declineReferral(r)} className="px-3 py-1 bg-red-600 text-white rounded text-sm">Decline</button>
            </>
          ) }

          { fromMe && status === "pending" && (
            <button onClick={() => withdrawReferral(r)} className="px-3 py-1 border rounded text-sm">Withdraw</button>
          ) }

          <Link to={`/reports/${r.reportId}`} className="text-sm text-blue-600 hover:underline text-center">Open Report</Link>
        </div>
      </div>
    );
  };

  if (!user) return <div className="p-6">Please login to view referrals.</div>;

  const listToShow = tab === "received" ? received : sent;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Referrals</h2>
        <div className="text-sm text-gray-600">Manage referrals</div>
      </div>

      <div className="bg-white p-3 rounded border flex items-center gap-3">
        <button onClick={() => setTab("received")} className={`px-3 py-1 rounded ${tab === "received" ? "bg-indigo-600 text-white" : "border"}`}>Received</button>
        <button onClick={() => setTab("sent")} className={`px-3 py-1 rounded ${tab === "sent" ? "bg-indigo-600 text-white" : "border"}`}>Sent</button>
      </div>

      <div className="space-y-3">
        {loading && <div className="p-6 text-center text-gray-500">Loading referrals.</div>}
        {!loading && listToShow.length === 0 && <div className="p-6 text-center text-gray-500">No referrals.</div>}
        {!loading && listToShow.map(renderReferralRow)}
      </div>
    </div>
  );
}
