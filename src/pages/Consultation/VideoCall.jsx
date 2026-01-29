// src/pages/Consultation/VideoCall.jsx
import React, { useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  doc, getDoc, setDoc, onSnapshot, collection, addDoc, deleteDoc, getDocs, updateDoc
} from "firebase/firestore";
// Corrected import paths
import { db } from "../../firebase/config"; // Corrected path: ../../../ to reach src/
import { useAuth } from "../../hooks/useAuth"; // Corrected path: ../../../ to reach src/
import { useToast } from "../../components/ToastProvider"; // Corrected path: ../../../ to reach src/
// Replaced lucide-react imports with react-icons imports
import { FaMicrophone, FaMicrophoneSlash, FaVideo, FaVideoSlash, FaRedo } from 'react-icons/fa';


const STUN_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" }
];

export default function VideoCall() {
  const { id } = useParams(); // consultation id used as room id
  const { profile, user } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // RTCPeerConnection and streams
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);

  // refs for pending remote ICE candidates buffer (until remoteDescription is set)
  const pendingRemoteCandidatesRef = useRef([]);

  // firestore snapshot unsub refs
  const roomSnapshotUnsub = useRef(null);
  const callerCandidatesUnsub = useRef(null);
  const calleeCandidatesUnsub = useRef(null);

  const [consult, setConsult] = useState(null);
  const [loading, setLoading] = useState(true);

  const [roomId, setRoomId] = useState(id || null);
  const [isCaller, setIsCaller] = useState(false);
  const [joined, setJoined] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [connectionState, setConnectionState] = useState("idle"); // idle | connecting | connected | disconnected | failed

  // Permission & participant helper
  const isProviderRole = profile?.role === "provider" || profile?.role === "ngo";
  const isPatientRole = !!(consult && user?.uid === consult.patientUid);

  // load consultation + permission check
  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!id || !user) {
        setLoading(false);
        return;
      }
      try {
        const csnap = await getDoc(doc(db, "consultations", id));
        if (!csnap.exists()) {
          addToast({ type: "error", title: "Not found", message: "Consultation not found." });
          setLoading(false);
          return;
        }
        const cdata = csnap.data();
        if (!mounted) return;
        setConsult({ id: csnap.id, ...cdata });

        const isParticipant = (user.uid === cdata.providerUid || user.uid === cdata.patientUid || user.uid === cdata.creatorUid);
        const isAdmin = profile?.role === "admin";
        if (!isParticipant && !isAdmin) {
          addToast({ type: "error", title: "Access denied", message: "You are not a participant." });
          setLoading(false);
          return;
        }

        // patient may only join when sessionStatus === 'live'
        if (user.uid === cdata.patientUid && cdata.sessionStatus !== "live") {
          addToast({ type: "info", title: "Session not live", message: "Provider will start the session when ready." });
        }

        setLoading(false);
      } catch (err) {
        console.error("load consult err", err);
        addToast({ type: "error", title: "Failed", message: "Could not load consultation." });
        setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [id, user, profile, addToast]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // do NOT mark consultation ended here; this is a UI-unmount
      cleanupLocal(false).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------
     Helper: prepare local PC & media
     --------------------------- */
  async function preparePeerConnection() {
    // create peer connection if not present
    if (!pcRef.current) {
      pcRef.current = new RTCPeerConnection({ iceServers: STUN_SERVERS });

      // remote track handler
      pcRef.current.ontrack = (evt) => {
        // set remote stream
        if (remoteVideoRef.current && evt.streams && evt.streams[0]) {
          remoteVideoRef.current.srcObject = evt.streams[0];
        }
      };

      pcRef.current.oniceconnectionstatechange = () => {
        const st = pcRef.current?.iceConnectionState;
        setConnectionState(mapIceState(st));
        if (st === "disconnected" || st === "failed") {
          addToast({ type: "warning", title: "Connection", message: `ICE state: ${st}.` });
        } else if (st === "connected") {
          addToast({ type: "success", title: "Connection", message: "Call connected." });
        }
      };
    }

    // getUserMedia
    if (!localStreamRef.current) {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      // attach tracks to pc
      stream.getTracks().forEach(t => pcRef.current.addTrack(t, stream));
      setMicOn(Boolean(stream.getAudioTracks().find(t=>t.enabled)));
      setCamOn(Boolean(stream.getVideoTracks().find(t=>t.enabled)));
    }
  }

  function mapIceState(st) {
    if (!st) return "idle";
    if (st === "connected") return "connected";
    if (st === "completed") return "connected";
    if (st === "checking") return "connecting";
    if (st === "disconnected") return "disconnected";
    if (st === "failed") return "failed";
    return st;
  }

  /* ---------------------------
     Clear candidate docs helper
     --------------------------- */
  async function clearRoomCandidates(roomRef) {
    // remove all docs in callerCandidates & calleeCandidates
    try {
      const callerSnap = await getDocs(collection(roomRef, "callerCandidates"));
      for (const d of callerSnap.docs) {
        await deleteDoc(doc(roomRef, `callerCandidates/${d.id}`));
      }
      const calleeSnap = await getDocs(collection(roomRef, "calleeCandidates"));
      for (const d of calleeSnap.docs) {
        await deleteDoc(doc(roomRef, `calleeCandidates/${d.id}`));
      }
    } catch (err) {
      // Not fatal; just warn
      console.warn("clearRoomCandidates:", err);
    }
  }

  /* ---------------------------
     Caller (provider) creates / (re)creates offer
     --------------------------- */
  async function createRoomAsCaller() {
    if (!consult) return;
    try {
      await preparePeerConnection();
    } catch (err) {
      addToast({ type: "error", title: "Media", message: "Cannot access camera/mic." });
      return;
    }

    setIsCaller(true);
    setJoined(true);
    setConnectionState("connecting");

    const roomRef = doc(db, "rooms", roomId);

    // Ensure we clear old candidates (so stale ICE candidates don't confuse reconnect)
    await clearRoomCandidates(roomRef);

    // wire up local ICE --> callerCandidates subcollection
    const callerCandidatesColRef = collection(roomRef, "callerCandidates");
    pcRef.current.onicecandidate = (event) => {
      if (event.candidate) {
        addDoc(callerCandidatesColRef, event.candidate.toJSON()).catch(err => console.error("add caller cand err", err));
      }
    };

    // create offer
    const offer = await pcRef.current.createOffer();
    await pcRef.current.setLocalDescription(offer);

    // write offer to room doc (merge to preserve other fields)
    await setDoc(roomRef, {
      offer: { type: offer.type, sdp: offer.sdp },
      createdAt: Date.now(),
      createdBy: user.uid
    }, { merge: true });

    // snapshot listener for answer changes (and to accept new answers if patient re-answers)
    if (roomSnapshotUnsub.current) roomSnapshotUnsub.current(); // remove old listener if any
    roomSnapshotUnsub.current = onSnapshot(roomRef, async (snap) => {
      const data = snap.data();
      if (!data) return;
      if (data.answer) {
        try {
          const newAnswer = new RTCSessionDescription(data.answer);
          // if remote description is not set OR SDP differs, (re)set it
          const currentRemote = pcRef.current?.currentRemoteDescription;
          if (!currentRemote || (currentRemote && currentRemote.sdp !== newAnswer.sdp)) {
            await pcRef.current.setRemoteDescription(newAnswer);
            // flush any pending remote ICE candidates after remote desc set
            flushPendingRemoteCandidates();
            setConnectionState(mapIceState(pcRef.current?.iceConnectionState));
            addToast({ type: "info", title: "Signaling", message: "Answer applied." });
          }
        } catch (err) {
          console.error("apply answer err:", err);
        }
      }
    }, (err) => console.error("room snapshot (caller) err", err));

    // listen for calleeCandidates and add to pc (buffer if remoteDescription not yet set)
    if (calleeCandidatesUnsub.current) calleeCandidatesUnsub.current();
    calleeCandidatesUnsub.current = onSnapshot(collection(roomRef, "calleeCandidates"), (snap) => {
      snap.docChanges().forEach(async (chg) => {
        if (chg.type === "added") {
          const c = chg.doc.data();
          const cand = new RTCIceCandidate(c);
          if (pcRef.current && pcRef.current.currentRemoteDescription) {
            try { await pcRef.current.addIceCandidate(cand); }
            catch (e) { console.warn("addIceCandidate (caller) err", e); }
          } else {
            pendingRemoteCandidatesRef.current.push(cand);
          }
        }
      });
    }, (err) => console.error("calleeCandidates listener (caller) err", err));
  }

  /* ---------------------------
     Callee (patient) joins room and answers
     --------------------------- */
  async function joinRoomAsCallee() {
    if (!consult) return;
    try {
      await preparePeerConnection();
    } catch (err) {
      addToast({ type: "error", title: "Media", message: "Cannot access camera/mic." });
      return;
    }

    setIsCaller(false);
    setJoined(true);
    setConnectionState("connecting");

    const roomRef = doc(db, "rooms", roomId);
    const roomSnap = await getDoc(roomRef);
    if (!roomSnap.exists()) {
      addToast({ type: "error", title: "No room", message: "Provider hasn't started the call yet." });
      setJoined(false);
      return;
    }

    const roomData = roomSnap.data();
    if (!roomData.offer) {
      addToast({ type: "error", title: "No offer", message: "No offer found." });
      setJoined(false);
      return;
    }

    // listen for callerCandidates (incoming ICE)
    if (callerCandidatesUnsub.current) callerCandidatesUnsub.current();
    callerCandidatesUnsub.current = onSnapshot(collection(roomRef, "callerCandidates"), (snap) => {
      snap.docChanges().forEach(async (chg) => {
        if (chg.type === "added") {
          const c = chg.doc.data();
          const cand = new RTCIceCandidate(c);
          if (pcRef.current && pcRef.current.currentRemoteDescription) {
            try { await pcRef.current.addIceCandidate(cand); }
            catch (e) { console.warn("addIceCandidate (callee) err", e); }
          } else {
            pendingRemoteCandidatesRef.current.push(cand);
          }
        }
      });
    }, (err) => console.error("callerCandidates (callee) err", err));

    // onicecandidate: add local candidates to calleeCandidates subcollection
    const calleeCandidatesColRef = collection(roomRef, "calleeCandidates");
    pcRef.current.onicecandidate = (event) => {
      if (event.candidate) {
        addDoc(calleeCandidatesColRef, event.candidate.toJSON()).catch(err => console.error("add callee cand err", err));
      }
    };

    // set remote description from offer
    try {
      const offerDesc = new RTCSessionDescription(roomData.offer);
      await pcRef.current.setRemoteDescription(offerDesc);
    } catch (err) {
      console.error("setRemoteDescription (callee) err", err);
      addToast({ type: "error", title: "Signaling", message: "Failed to apply remote offer." });
      setJoined(false);
      return;
    }

    // create and set local answer
    const answer = await pcRef.current.createAnswer();
    await pcRef.current.setLocalDescription(answer);

    // write answer to room (merge)
    await setDoc(roomRef, {
      answer: { type: answer.type, sdp: answer.sdp }
    }, { merge: true });

    // listen for future offers updates (provider may recreate an offer when rejoining)
    if (roomSnapshotUnsub.current) roomSnapshotUnsub.current();
    roomSnapshotUnsub.current = onSnapshot(roomRef, async (snap) => {
      const data = snap.data();
      if (!data) return;

      // If provider recreates a new offer that is different from current remoteDescription,
      // handle it by setting remoteDescription and producing a new answer.
      if (data.offer) {
        const currentRemote = pcRef.current?.currentRemoteDescription;
        const newOfferSdp = data.offer.sdp;
        if (!currentRemote || (currentRemote && currentRemote.sdp !== newOfferSdp)) {
          try {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.offer));
            // create and set new local answer
            const newAns = await pcRef.current.createAnswer();
            await pcRef.current.setLocalDescription(newAns);
            await setDoc(roomRef, { answer: { type: newAns.type, sdp: newAns.sdp } }, { merge: true });
            // flush any buffered remote ICE candidates
            flushPendingRemoteCandidates();
            /*addToast({ type: "info", title: "Reconnected", message: "Re-answered provider's new offer." });*/
          } catch (err) {
            console.error("handle new offer (callee) err", err);
          }
        }
      }
    }, (err) => console.error("room snapshot (callee) err", err));

    // also flush any existing callerCandidates that arrived earlier (but will be handled by snapshot above)
    // pending candidates will be flushed once remoteDescription set
    flushPendingRemoteCandidates();
  }

  /* ---------------------------
     Flush buffered remote candidates
     --------------------------- */
  async function flushPendingRemoteCandidates() {
    const buf = pendingRemoteCandidatesRef.current || [];
    if (!buf.length) return;
    for (const cand of buf) {
      try {
        await pcRef.current.addIceCandidate(cand);
      } catch (err) {
        console.warn("flush candidate err", err);
      }
    }
    pendingRemoteCandidatesRef.current = [];
  }

  /* ---------------------------
     Local cleanup (close pc, stop tracks, optionally delete room & update consult)
     - updateConsultationStatus = true causes sessionStatus to be set to 'ended' (provider end)
     - delete room + candidates only when provider ends permanently
     --------------------------- */
  async function cleanupLocal(updateConsultationStatus = false) {
    // stop local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
    }

    // close peer connection
    if (pcRef.current) {
      try { pcRef.current.close(); } catch (e) { /* ignore */ }
      pcRef.current = null;
    }

    // clear remote video
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

    // unsubscribe Firestore listeners
    if (roomSnapshotUnsub.current) try { roomSnapshotUnsub.current(); } catch (e){};
    roomSnapshotUnsub.current = null;
    if (callerCandidatesUnsub.current) try { callerCandidatesUnsub.current(); } catch (e) {};
    callerCandidatesUnsub.current = null;
    if (calleeCandidatesUnsub.current) try { calleeCandidatesUnsub.current(); } catch (e) {};
    calleeCandidatesUnsub.current = null;

    // If we need to delete room data (only do this when provider explicitly ends consultation)
    if (isCaller && updateConsultationStatus && roomId) {
      const roomRef = doc(db, "rooms", roomId);
      try {
        // delete candidate docs
        const callerSnap = await getDocs(collection(roomRef, "callerCandidates"));
        for (const d of callerSnap.docs) await deleteDoc(doc(roomRef, `callerCandidates/${d.id}`));
        const calleeSnap = await getDocs(collection(roomRef, "calleeCandidates"));
        for (const d of calleeSnap.docs) await deleteDoc(doc(roomRef, `calleeCandidates/${d.id}`));
        // delete room doc
        await deleteDoc(roomRef);
      } catch (err) {
        console.warn("cleanupLocal: failed to fully delete room:", err);
      }
    }

    // Optionally update consultation sessionStatus to 'ended' when provider ends
    if (isCaller && updateConsultationStatus && consult?.id) {
      try {
        await updateDoc(doc(db, "consultations", consult.id), {
          sessionStatus: "ended",
          updatedAt: Date.now()
        });
      } catch (err) {
        console.warn("cleanupLocal: failed to update consultation status", err);
      }
    }

    setIsCaller(false);
    setJoined(false);
    setConnectionState("idle");
    pendingRemoteCandidatesRef.current = [];
  }

  /* ---------------------------
     UI actions
     --------------------------- */
  async function handleStartCall() {
    if (!isProviderRole) {
      addToast({ type: "error", title: "Not allowed", message: "Only provider/NGO can start the session." });
      return;
    }
    // set consult.sessionStatus to live, then create room
    try {
      await updateDoc(doc(db, "consultations", consult.id), {
        sessionStatus: "live",
        sessionStartedAt: Date.now(),
        updatedAt: Date.now()
      });
      await createRoomAsCaller();
      addToast({ type: "success", title: "Call ready", message: "Room created. Waiting for patient." });
    } catch (err) {
      console.error("handleStartCall err", err);
      addToast({ type: "error", title: "Failed", message: "Could not start session." });
    }
  }

  async function handleJoinCall() {
    if (!isPatientRole) {
      addToast({ type: "error", title: "Not allowed", message: "Only the patient can join here." });
      return;
    }
    try {
      await joinRoomAsCallee();
      addToast({ type: "success", title: "Joining", message: "Joining the call..." });
    } catch (err) {
      console.error("handleJoinCall err", err);
      addToast({ type: "error", title: "Failed", message: "Could not join call." });
    }
  }

  async function handleLeave() {
    // temporary leave: cleanup local only, do not end consultation
    await cleanupLocal(false);
    addToast({ type: "info", title: "Left", message: "You left the call. You can rejoin while session is live." });
    navigate(`/consultations/${id}`);
  }

  async function handleEndConsultation() {
    // provider ends consultation permanently: cleanup and delete room
    if (!isProviderRole) {
      addToast({ type: "error", title: "Permission denied", message: "Only provider can end the consultation." });
      return;
    }
    // confirm
    if (!window.confirm("End consultation for everyone? This will end the session and remove the room.")) return;
    // perform full cleanup and mark consultation ended
    await cleanupLocal(true);
    addToast({ type: "success", title: "Ended", message: "Consultation ended." });
    navigate(`/consultations/${id}`);
  }

  function toggleMic() {
    if (!localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach(t => {
      t.enabled = !t.enabled;
      setMicOn(t.enabled);
    });
  }
  function toggleCam() {
    if (!localStreamRef.current) return;
    localStreamRef.current.getVideoTracks().forEach(t => {
      t.enabled = !t.enabled;
      setCamOn(t.enabled);
    });
  }

  /* ---------------------------
     UI
     --------------------------- */
  if (loading) return <div className="p-6 text-center">Loading video call…</div>;
  if (!consult) return <div className="p-6 text-center text-red-600">Consultation not available or access denied.</div>;

  return (
    <div className="max-w-5xl mx-auto p-4 bg-white rounded shadow-lg">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl font-semibold">Video — Consultation {consult.id}</h2>
          <div className="text-sm text-gray-600 mt-1">
            Session status: <span className="font-medium">{consult.sessionStatus || 'not-started'}</span>
            {" • "}Connection: <span className={`font-medium ${connectionState === 'connected' ? 'text-green-600' : connectionState === 'connecting' ? 'text-yellow-600' : 'text-red-600'}`}>{connectionState}</span>
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <Link to={`/consultations/${id}`} className="text-sm text-blue-600 hover:underline">Back to consultation</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-50 p-2 rounded relative">
          <div className="text-sm font-medium mb-1">You</div>
          <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-auto rounded bg-black" />
          <div className="absolute bottom-3 left-3 flex gap-2">
            <button onClick={toggleMic} className={`p-2 rounded-full ${micOn ? 'bg-white text-blue-600' : 'bg-gray-700 text-white'}`} title={micOn ? 'Mute' : 'Unmute'}>
              {micOn ? <FaMicrophone size={18} /> : <FaMicrophoneSlash size={18} />}
            </button>
            <button onClick={toggleCam} className={`p-2 rounded-full ${camOn ? 'bg-white text-blue-600' : 'bg-gray-700 text-white'}`} title={camOn ? 'Turn camera off' : 'Turn camera on'}>
              {camOn ? <FaVideo size={18} /> : <FaVideoSlash size={18} />}
            </button>
          </div>
        </div>

        <div className="bg-gray-50 p-2 rounded">
          <div className="text-sm font-medium mb-1">Remote</div>
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-auto rounded bg-black" />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 items-center justify-center">
        {!joined && isProviderRole && consult.sessionStatus !== "ended" && (
          <button onClick={handleStartCall} className="px-6 py-3 bg-indigo-600 text-white rounded-md font-semibold hover:bg-indigo-700">Start Call (Provider)</button>
        )}
        {!joined && isPatientRole && consult.sessionStatus === "live" && (
          <button onClick={handleJoinCall} className="px-6 py-3 bg-green-600 text-white rounded-md font-semibold hover:bg-green-700">Join Call (Patient)</button>
        )}
        {joined && (
          <button onClick={handleLeave} className="px-6 py-3 border border-gray-300 rounded-md text-gray-700">Leave</button>
        )}

        {isProviderRole && consult.sessionStatus !== "ended" && (
          <button onClick={handleEndConsultation} className="px-6 py-3 bg-red-600 text-white rounded-md font-semibold hover:bg-red-700">End Consultation (Provider)</button>
        )}

        {/* Reconnect hint / manual refresh */}
        {connectionState !== "connected" && joined && (
          <button onClick={() => {
            // simple manual rejoin: cleanup local and then re-run join/create depending on role
            (async () => {
              await cleanupLocal(false);
              if (isProviderRole) await createRoomAsCaller();
              else if (isPatientRole) await joinRoomAsCallee();
            })();
          }} className="px-4 py-2 border rounded flex items-center gap-2">
            <FaRedo size={16} /> Reconnect
          </button>
        )}
      </div>
    </div>
  );
}
