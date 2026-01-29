// src/pages/Consultation/ProviderConsultations.jsx
import React, { useEffect, useState, useMemo } from "react";
import { collection, query, where, orderBy, onSnapshot, doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useAuth } from "../../hooks/useAuth";
import { Link } from "react-router-dom";
import { useUsers } from "../../hooks/useUsers"; // Import useUsers

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

export default function ProviderConsultations() {
    const { user, profile } = useAuth();
    // useUsers provides a map of all users for display names
    const { usersMap, loadingUsers } = useUsers(); 

    const [consultations, setConsultations] = useState([]);
    const [loadingConsultations, setLoadingConsultations] = useState(true);
    // State to store report data (e.g., titles) keyed by reportId
    const [reportsData, setReportsData] = useState({}); 
    const [loadingReportsData, setLoadingReportsData] = useState(false);


    // Determine if the current user has a provider or NGO role
    const isWorker = profile?.role === "provider" || profile?.role === "ngo";

    // Effect to fetch consultations relevant to the current worker (provider/NGO)
    useEffect(() => {
        // If user is not logged in or not a worker, stop loading and clear consultations
        if (!user || !isWorker) {
            setLoadingConsultations(false);
            setConsultations([]);
            return;
        }

        setLoadingConsultations(true);
        // Create a query to get consultations where the current user is the providerUid
        const q = query(
            collection(db, "consultations"),
            where("providerUid", "==", user.uid),
            orderBy("createdAt", "desc") // Order by creation date, newest first
        );

        // Set up real-time listener for consultations
        const unsub = onSnapshot(q, (snap) => {
            setConsultations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoadingConsultations(false);
        }, (err) => {
            console.error("Consultations snapshot error:", err);
            // Even on error, set loading to false to unblock UI
            setLoadingConsultations(false);
        });

        // Cleanup function for the snapshot listener
        return () => unsub();
    }, [user, isWorker]); // Rerun when user or worker status changes

    // Effect to fetch associated report data for displayed consultations
    useEffect(() => {
        // If there are no consultations, no reports to fetch
        if (!consultations.length) {
            setReportsData({});
            setLoadingReportsData(false);
            return;
        }

        setLoadingReportsData(true);
        // Extract unique report IDs from the fetched consultations
        const uniqueReportIds = [...new Set(consultations.map(c => c.reportId).filter(Boolean))];
        
        const fetchReports = async () => {
            const newReportsData = {};
            for (const reportId of uniqueReportIds) {
                // Only fetch reports that are not already in our `reportsData` state
                // This prevents unnecessary re-fetches if a report's data is already available
                if (!reportsData[reportId]) { 
                    try {
                        const reportSnap = await getDoc(doc(db, "reports", reportId));
                        if (reportSnap.exists()) {
                            newReportsData[reportId] = reportSnap.data();
                        }
                    } catch (err) {
                        console.error(`Error fetching report ${reportId}:`, err);
                    }
                } else {
                    // If data already exists, reuse it to avoid overwriting and unnecessary state updates
                    newReportsData[reportId] = reportsData[reportId]; 
                }
            }
            // Update the reportsData state by merging new data with existing data
            setReportsData(prev => ({ ...prev, ...newReportsData }));
            setLoadingReportsData(false);
        };

        fetchReports();
    }, [consultations]); // Rerun this effect when the list of consultations changes

    // Memoized grouping and sorting of consultations for efficient rendering
    const groups = useMemo(() => {
        // Create a mutable copy of consultations for sorting
        const sortedConsultations = [...consultations];

        return {
            // Live consultations: where the sessionStatus is "live"
            live: sortedConsultations.filter(c => c.sessionStatus === "live"),
            
            // Upcoming consultations: confirmed and scheduled for the future
            upcoming: sortedConsultations.filter(c => 
                c.status === "confirmed" && 
                c.sessionStatus !== "live" && // Not currently live
                c.sessionStatus !== "ended" && // Not ended
                toDateObject(c.scheduledAt)?.getTime() > Date.now() // Scheduled time is in the future
            ).sort((a,b) => (toDateObject(a.scheduledAt)?.getTime() || 0) - (toDateObject(b.scheduledAt)?.getTime() || 0)), // Sort by scheduled time, earliest first
            
            // Proposed consultations: still in the "proposed" state
            proposed: sortedConsultations.filter(c => c.status === "proposed"),
            
            // Past consultations: ended, completed, cancelled, or confirmed but in the past
            past: sortedConsultations.filter(c => 
                c.sessionStatus === "ended" || 
                c.status === "completed" || 
                c.status === "cancelled" || 
                (c.status === "confirmed" && toDateObject(c.scheduledAt)?.getTime() <= Date.now()) // Confirmed but scheduled time has passed
            ).sort((a,b) => (toDateObject(b.scheduledAt || b.createdAt)?.getTime() || 0) - (toDateObject(a.scheduledAt || a.createdAt)?.getTime() || 0)), // Sort by scheduled/created time, newest first
        };
    }, [consultations]); // Recalculate groups when consultations change

    // Render message if user is not a worker (provider/NGO)
    if (!isWorker) {
        return (
            <div className="min-h-[300px] flex items-center justify-center bg-white p-6 rounded-lg shadow-sm">
                <p className="text-lg text-gray-700">Only health providers and NGOs can view this page.</p>
            </div>
        );
    }

    // Overall loading state: true if any of the data sources are still loading
    const overallLoading = loadingConsultations || loadingUsers || loadingReportsData;

    // Render loading spinner and message if data is still loading
    if (overallLoading) {
        return (
            <div className="min-h-[300px] flex items-center justify-center bg-white p-6 rounded-lg shadow-sm">
                <div className="flex flex-col items-center">
                    <svg className="animate-spin h-8 w-8 text-blue-600 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="text-gray-700">Loading consultations and related data...</p>
                </div>
            </div>
        );
    }

    // Function to render an individual consultation card
    const renderConsultationCard = (c) => {
        const report = reportsData[c.reportId]; // Get associated report data
        const patientName = usersMap[c.patientUid]?.displayName || usersMap[c.patientUid]?.email || "Unknown Patient";
        const creatorName = usersMap[c.creatorUid]?.displayName || usersMap[c.creatorUid]?.email || "Unknown Creator";
        const scheduledDate = toDateObject(c.scheduledAt);
        const proposedTimes = c.proposedTimes?.map(t => toDateObject(t)).filter(Boolean) || [];

        return (
            <li key={c.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow duration-200">
                <div className="flex justify-between items-start mb-2">
                    <div>
                        {/* Link to the detailed consultation page */}
                        <Link to={`/consultations/${c.id}`} className="text-lg font-semibold text-blue-700 hover:underline">
                            Consultation ID: {c.id.substring(0, 8)}...
                        </Link>
                        <div className="text-sm text-gray-600">
                            Status: <span className="font-medium capitalize">{c.status}</span>
                            {c.sessionStatus && ` • Session: ${c.sessionStatus}`}
                        </div>
                    </div>
                    {/* Conditional button to join/view session if it's confirmed and not ended */}
                    {c.status === "confirmed" && c.sessionStatus !== "ended" && scheduledDate && (
                         <Link
                            to={`/consultations/${c.id}/video`}
                            className="px-3 py-1 bg-green-600 text-white rounded-md text-sm font-semibold hover:bg-green-700 transition-colors duration-200"
                        >
                            {c.sessionStatus === "live" ? "Join Now" : "View Session"}
                        </Link>
                    )}
                </div>

                <div className="text-sm text-gray-700 mt-1">
                    <p><strong>For Report:</strong> {report?.title || `ID: ${c.reportId}`}</p>
                    <p><strong>Patient:</strong> {patientName}</p>
                    <p><strong>Proposed by:</strong> {creatorName}</p>
                </div>

                {scheduledDate && (
                    <div className="text-sm text-gray-700 mt-2">
                        <strong>Scheduled:</strong> {scheduledDate.toLocaleString()}
                    </div>
                )}
                {c.status === "proposed" && proposedTimes.length > 0 && (
                    <div className="text-sm text-gray-700 mt-2">
                        <strong>Proposed Times:</strong>
                        <ul className="list-disc list-inside ml-2">
                            {proposedTimes.map((t, i) => <li key={i}>{t.toLocaleString()}</li>)}
                        </ul>
                    </div>
                )}

                {/* Display notes and prescription if available, with truncation */}
                {c.notes && <div className="text-sm text-gray-600 mt-2 line-clamp-2"><strong>Notes:</strong> {c.notes}</div>}
                {c.prescriptionText && <div className="text-sm text-gray-600 mt-2 line-clamp-2"><strong>Prescription:</strong> {c.prescriptionText}</div>}
                {c.lastRejectionNote && <div className="text-sm text-red-500 mt-2"><strong>Patient Note:</strong> {c.lastRejectionNote}</div>}

                <div className="mt-4 text-right">
                    <Link to={`/consultations/${c.id}`} className="text-blue-600 hover:underline text-sm font-medium">
                        View Details →
                    </Link>
                </div>
            </li>
        );
    };

    return (
        <div className="max-w-6xl mx-auto p-4 space-y-8 bg-white rounded-lg shadow-lg">
            <h2 className="text-3xl font-bold text-gray-900 text-center mb-6">My Consultations</h2>
            <p className="text-center text-gray-600 mb-8">
                Here you can view and manage all consultations where you are assigned as a provider or NGO.
            </p>

            {/* Iterate through each group (live, upcoming, proposed, past) */}
            {Object.keys(groups).map((k) => (
                <section key={k} className="bg-gray-50 p-4 rounded-lg shadow-sm border border-gray-200">
                    <h3 className="text-xl font-semibold capitalize text-gray-800 border-b pb-2 mb-4">
                        {k.replace(/([A-Z])/g, ' $1').trim()} ({groups[k].length})
                    </h3>
                    {!groups[k].length ? (
                        // Display empty state message if no consultations in this group
                        <div className="text-center text-gray-500 py-6">
                            No {k.toLowerCase().replace(/_/g, ' ')} consultations at the moment.
                            {k === "proposed" && <p className="text-sm mt-1">You need to propose new times to patients.</p>}
                            {k === "upcoming" && <p className="text-sm mt-1">Get ready for your next session!</p>}
                            {k === "live" && <p className="text-sm mt-1">Start a session for a confirmed consultation when it's time.</p>}
                        </div>
                    ) : (
                        // Render the list of consultations for this group
                        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {groups[k].map(renderConsultationCard)}
                        </ul>
                    )}
                </section>
            ))}
        </div>
    );
}

