// src/pages/Consultation/JitsiRoom.jsx
import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useAuth } from "../../hooks/useAuth";

export default function JitsiRoom() {
  const { id } = useParams();
  const { profile } = useAuth();
  const [consult, setConsult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(
      doc(db, "consultations", id),
      (snap) => {
        if (snap.exists()) setConsult({ id: snap.id, ...snap.data() });
        else setConsult(null);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [id]);

  if (loading) return <div className="p-6">Loading…</div>;
  if (!consult) return <div className="p-6">Consultation not found.</div>;

  if (consult.sessionStatus !== "live") {
    return (
      <div className="p-6 max-w-xl mx-auto bg-white rounded shadow">
        <div className="text-sm">
          Session isn’t live yet.{" "}
          <Link to={`/consultations/${consult.id}`} className="text-blue-600 underline">
            Go back
          </Link>
        </div>
      </div>
    );
  }

  const displayName = profile?.displayName || profile?.name || "Guest";

  // 👇 Use 8x8.vc instead of meet.jit.si
  const roomName = consult.jitsiRoom || id;
  const url = `https://8x8.vc/healthhub/${encodeURIComponent(roomName)}#userInfo.displayName="${encodeURIComponent(displayName)}"`;

  return (
    <div className="max-w-5xl mx-auto p-4">
      <h2 className="text-lg font-semibold mb-2">Video session</h2>
      <iframe
        title="Telemedicine"
        src={url}
        allow="camera; microphone; fullscreen; display-capture"
        style={{ width: "100%", height: "70vh", border: 0, borderRadius: 8 }}
      />
      <div className="mt-3 text-sm">
        <Link to={`/consultations/${consult.id}`} className="text-blue-600 underline">
          Back to consultation
        </Link>
      </div>
    </div>
  );
}
