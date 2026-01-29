// src/pages/ResourceHub/ProviderDetail.jsx
import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, updateDoc, collection, addDoc, serverTimestamp, onSnapshot, getDoc, query, where, getDocs } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../components/ToastProvider";
import AlertDialog from "../../components/AlertDialog";

export default function ProviderDetail() {
  const { id } = useParams(); // provider uid
  const [provider, setProvider] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false); // Add submitting state
  const [referralReportId, setReferralReportId] = useState("");
  const { profile, user } = useAuth();
  const { addToast } = useToast();

  // State for AlertDialog
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
    if (!id) return;
    const ref = doc(db, "users", id);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setProvider(null);
      } else {
        setProvider({ uid: snap.id, ...snap.data() });
      }
      setLoading(false);
    }, (err) => {
      console.error("ProviderDetail snapshot error:", err);
      addToast({ type: "error", title: "Error", message: "Unable to load provider details." });
      setLoading(false);
    });

    return () => unsub();
  }, [id, addToast]);


  if (loading) return <div className="p-6">Loading provider details...</div>;
  if (!provider) return <div className="p-6">Provider not found.</div>;

  const isAdmin = profile?.role === "admin";
  const isUserAuthenticated = user !== null;
  const canCreateReferral = profile && (profile.role === "provider" || profile.role === "ngo" || profile.role === "admin");
  const isMyProfile = user && user.uid === provider.uid;


  const handleVerify = async () => {
    if (!isAdmin) {
      addToast({ type: "error", title: "Permission Denied", message: "Only administrators can toggle provider verification." });
      return;
    }
    showAlert(
      "Confirm Verification Status Change",
      `Are you sure you want to ${provider.verified ? "unverify" : "verify"} ${provider.displayName || provider.orgName}?`,
      async () => {
        try {
          const ref = doc(db, "users", provider.uid);
          await updateDoc(ref, { verified: !provider.verified, updatedAt: serverTimestamp() });
          addToast({ type: "success", title: "Success", message: `${provider.displayName || provider.orgName} is now ${!provider.verified ? "verified" : "unverified"}.` });
        } catch (err) {
          console.error(err);
          addToast({ type: "error", title: "Failed", message: "Could not toggle verification status. " + (err.message || "Unknown error.") });
        }
      }
    );
  };


const handleCreateReferral = async () => {
  if (!user) {
    addToast({ type: "error", title: "Login required", message: "Please login to create a referral." });
    return;
  }
  const reportIdTrim = referralReportId.trim();
  if (!reportIdTrim) {
    addToast({ type: "error", title: "Missing report ID", message: "Enter the report ID to refer." });
    return;
  }

  // build payload
  const payload = {
    fromUid: user.uid,
    fromName: profile?.displayName || profile?.orgName || user.displayName || user.email || user.uid,
    toProviderId: provider.uid,
    toName: provider?.displayName || provider?.orgName || provider?.email || provider?.uid,
    reportId: reportIdTrim,
    reportTitle: (await getDoc(doc(db, "reports", reportIdTrim))).data()?.title || "",
    status: "pending",
    createdAt: serverTimestamp(),
  };


  // LOG payload for debugging — check console for these values
  console.log("Referral payload (about to add):", payload);
  console.log("Auth user.uid:", user.uid);

  try {
    const repRef = doc(db, "reports", reportIdTrim);
    const repSnap = await getDoc(repRef);
    if (!repSnap.exists()) {
      addToast({ type: "error", title: "Report not found", message: "Please check the Report ID." });
      return;
    }

    const rep = repSnap.data();
    if (rep.assignedTo) {
      addToast({ type: "warning", title: "Already assigned", message: "This report is already assigned. No new referrals allowed." });
      return;
    }

    await addDoc(collection(db, "referrals"), payload);
    
    // notify recipient provider
    await addDoc(collection(db, "notifications"), {
      toUid: provider.uid,            // the recipient provider uid
      fromUid: user.uid,
      title: "New referral received",
      body: `${profile?.displayName || user.email} referred a report to you.`,
      link: `/my-referrals`,          // or provider detail
      read: false,
      createdAt: serverTimestamp()
    });

    addToast({ type: "success", title: "Referred", message: "Referral sent." });
    setReferralReportId("");
  } catch (err) {
    console.error("create referral error:", err);
    addToast({ type: "error", title: "Failed", message: err.code + " — " + (err.message || "") });
  }
};



  return (
    <div className="max-w-4xl mx-auto bg-white p-6 rounded shadow-lg">
      <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
        <div className="flex-shrink-0 w-24 h-24 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center border-2 border-blue-200">
          {provider.photoURL ? (
            <img src={provider.photoURL} alt={provider.displayName || provider.orgName} className="w-full h-full object-cover" />
          ) : (
            <div className="text-3xl text-gray-500 font-semibold uppercase">
              {(provider.displayName || provider.orgName || "P")[0]}
            </div>
          )}
        </div>

        <div className="flex-1 text-center md:text-left">
          <div className="flex flex-col md:flex-row items-center md:justify-between gap-2 mb-2">
            <div>
              <h2 className="text-3xl font-bold text-gray-900">{provider.displayName || provider.orgName}</h2>
              <div className="text-base text-gray-600">{provider.orgName || provider.title || "Health Provider"}</div>
              <div className="text-sm text-blue-700 font-medium mt-1">{(provider.services || []).join(" • ") || "No services listed"}</div>
            </div>

            <div className="flex flex-col items-center md:items-end mt-2 md:mt-0">
              {provider.verified ? (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                  <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                  Verified
                </span>
              ) : (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-600">
                  Not Verified
                </span>
              )}
              {isAdmin && (
                <button
                  onClick={handleVerify}
                  className="mt-2 px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-semibold hover:bg-indigo-700 transition-colors duration-200 shadow-md"
                >
                  {provider.verified ? "Unverify" : "Verify"}
                </button>
              )}
            </div>
          </div>

          <p className="mt-4 text-base text-gray-700 leading-relaxed">{provider.bio || "No detailed description provided by this organization yet."}</p>

          <div className="mt-5 space-y-2 text-gray-700">
            <div><strong>Contact:</strong> {provider.phone || "N/A"}</div>
            <div><strong>Address:</strong> {provider.address || "N/A"}</div>
            {provider.website && (
              <div>
                <strong>Website:</strong>{" "}
                <a href={provider.website} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                  {provider.website}
                </a>
              </div>
            )}
            {provider.languages && provider.languages.length > 0 && (
              <div><strong>Languages:</strong> {provider.languages.join(", ")}</div>
            )}
          </div>

          {/* Referral widget */}
          <div className="mt-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h3 className="font-semibold text-lg text-gray-800 mb-3">Refer a Report to this Provider</h3>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <input
                value={referralReportId}
                onChange={(e) => setReferralReportId(e.target.value)}
                className="flex-grow px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-800"
                placeholder="Paste Report ID here"
                disabled={!canCreateReferral || isMyProfile || isSubmitting}
              />
              <button
                onClick={handleCreateReferral}
                className="px-5 py-2 bg-blue-600 text-white rounded-md font-semibold hover:bg-blue-700 transition-colors duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!canCreateReferral || isMyProfile || isSubmitting}
              >
                {isSubmitting ? "Referring..." : "Refer"}
              </button>
            </div>
            {!isUserAuthenticated && (
                <p className="text-sm text-red-500 mt-2">
                  You must be logged in to refer a report.
                </p>
            )}
            {isUserAuthenticated && !canCreateReferral && (
                <p className="text-sm text-red-500 mt-2">
                  Only Providers, NGOs, or Admins can create referrals.
                </p>
            )}
             {isUserAuthenticated && isMyProfile && (
                <p className="text-sm text-gray-500 mt-2">
                  You are viewing your own profile. Use "Assign to me" on the report details page to assign reports to yourself.
                </p>
            )}
          </div>

          <div className="mt-8 text-center md:text-left">
            <Link to="/providers" className="text-base text-blue-600 hover:underline">← Back to Resource Hub</Link>
          </div>
        </div>
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