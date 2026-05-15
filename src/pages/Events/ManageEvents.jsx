// src/pages/Events/ManageEvents.jsx
import React, { useState, useEffect, useRef } from "react";
import {
  collection,
  addDoc,
  onSnapshot,
  serverTimestamp,
  doc,
  deleteDoc
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../components/ToastProvider";
import MapWrapper from "../../components/Map/MapWrapper";

const EVENT_TYPES = ["Vaccination Camp", "Blood Donation", "Health Awareness", "Other"];
const RUBY_AREA_KOLKATA = { lat: 22.51, lng: 88.40 };

export default function ManageEvents() {
  const { user, profile } = useAuth();
  const { addToast } = useToast();

  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState(EVENT_TYPES[0]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState(1); // duration in days
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedEvent, setExpandedEvent] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Location
  const [center, setCenter] = useState(null);
  const [selected, setSelected] = useState(null);
  const [selectedAccuracy, setSelectedAccuracy] = useState(null);
  const [selectedSource, setSelectedSource] = useState(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const geolocationWatchId = useRef(null);

  // Fetch events (only future/ongoing)
  useEffect(() => {
    const q = collection(db, "events");
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        try {
          const now = new Date();
          const liveEvents = snapshot.docs
            .map(d => ({ id: d.id, ...d.data() })) // <- fixed mapping
            .filter(event => {
              // guard: event.date/time/duration may be missing
              if (!event.date || !event.time) return false;
              const eventStart = new Date(`${event.date}T${event.time}`);
              const dur = Number(event.duration) || 1;
              const eventEnd = new Date(eventStart.getTime() + (dur * 24 * 60 * 60 * 1000));
              return now < eventEnd; // only future/ongoing events
            });
          setEvents(liveEvents);
          setLoadingEvents(false);
        } catch (err) {
          console.error("ManageEvents: snapshot parse error", err);
          setLoadingEvents(false);
        }
      },
      (err) => {
        console.error("ManageEvents: onSnapshot error", err);
        addToast({ type: "error", title: "Events load failed", message: err.message });
        setLoadingEvents(false);
      }
    );
    return () => unsub();
  }, [addToast]);

  const handleMapSelect = (position) => {
    setSelected(position);
    setSelectedAccuracy(null);
    setSelectedSource("manual");
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      addToast({ type: "error", title: "Location Error", message: "Geolocation not available." });
      return;
    }
    setGeoBusy(true);
    if (geolocationWatchId.current) navigator.geolocation.clearWatch(geolocationWatchId.current);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setSelected({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setSelectedAccuracy(pos.coords.accuracy);
        setSelectedSource("auto");
        addToast({ type: "success", title: "Location Set", message: `Accuracy: ${pos.coords.accuracy.toFixed(0)}m` });
        setGeoBusy(false);
      },
      (err) => {
        setCenter(RUBY_AREA_KOLKATA);
        setGeoBusy(false);
        addToast({ type: "error", title: "Location Error", message: err.message });
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Basic validation
    if (!title.trim()) return addToast({ type: "error", title: "Validation", message: "Title required" });
    if (!description.trim()) return addToast({ type: "error", title: "Validation", message: "Description required" });
    if (!selected) return addToast({ type: "error", title: "Validation", message: "Pick location" });
    if (!date) return addToast({ type: "error", title: "Validation", message: "Date required" });
    if (!time) return addToast({ type: "error", title: "Validation", message: "Time required" });
    if (!duration || duration < 1) return addToast({ type: "error", title: "Validation", message: "Duration must be at least 1 day" });

    // Prevent past dates/times
    const now = new Date();
    const eventDateTime = new Date(`${date}T${time}`);
    if (eventDateTime <= now) {
      return addToast({ type: "error", title: "Invalid Input", message: "Event date and time must be in the future." });
    }

    setIsSubmitting(true);

    try {
      await addDoc(collection(db, "events"), {
        uid: user.uid,
        creatorRole: profile?.role || "citizen",
        type,
        title: title.trim(),
        description: description.trim(),
        date,
        time,
        duration,
        location: selected,
        locationAccuracy: selectedAccuracy ?? null,
        locationSource: selectedSource ?? null,
        createdAt: serverTimestamp(),
      });
      addToast({ type: "success", title: "Event Created", message: "Event posted." });
      // reset
      setTitle(""); setDescription(""); setDate(""); setTime(""); setSelected(null); setCenter(null); setDuration(1);
      setShowForm(false);
    } catch (err) {
      console.error(err);
      addToast({ type: "error", title: "Error", message: "Could not save event" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (deletingId) return;
    if (!window.confirm("Are you sure you want to delete this event?")) return;
    try {
      setDeletingId(id);
      await deleteDoc(doc(db, "events", id));
      addToast({ type: "success", title: "Deleted", message: "Event deleted." });
    } catch (err) {
      console.error(err);
      addToast({ type: "error", title: "Error", message: "Could not delete event" });
    } finally {
      setDeletingId(null);
    }
  };

  const renderCountdown = (event) => {
    const now = new Date();
    const eventStart = new Date(`${event.date}T${event.time}`);
    const eventEnd = new Date(eventStart.getTime() + (Number(event.duration || 1) * 24 * 60 * 60 * 1000));
    const remainingTime = eventEnd - now;
    const remainingDays = Math.ceil(remainingTime / (1000 * 60 * 60 * 24));

    if (remainingDays <= 0) return <p style={{ fontWeight: 'bold', color: '#777' }}>Event expired</p>;

    return (
      <p style={{ fontWeight: 'bold', color: remainingDays > 1 ? 'green' : 'red' }}>
        {remainingDays} day{remainingDays > 1 ? 's' : ''} left
      </p>
    );
  };

  // Filter events by search term (title/description)
  const visibleEvents = events.filter(e => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.trim().toLowerCase();
    return (e.title || "").toLowerCase().includes(q) || (e.description || "").toLowerCase().includes(q);
  });

  return (
    <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', padding: '2rem', maxWidth: '1000px', margin: '0 auto', backgroundColor: '#f9f9f9' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#2d89ef', textAlign: 'center', marginBottom: '1.5rem' }}>Community Events</h1>

      {user && ["admin", "ngo"].includes(profile?.role) && (
        <button onClick={() => setShowForm(!showForm)}
          style={{ backgroundColor: '#2d89ef', color: '#fff', fontSize: '1rem', fontWeight: 'bold', border: 'none', borderRadius: '8px', padding: '0.7rem 1.5rem', cursor: 'pointer', marginBottom: '1rem' }}>
          {showForm ? 'Cancel' : 'Create Event'}
        </button>
      )}

      {/* Event Form */}
      {showForm && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem' }}>
          <form onSubmit={handleSubmit} style={{
            backgroundColor: '#fff',
            padding: '2rem',
            borderRadius: '16px',
            width: '520px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
          }}>
            <h2 style={{ color: '#2d89ef', marginBottom: '1rem', textAlign: 'center' }}>Create New Event</h2>

            {/* Type */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontWeight: 'bold' }}>Event Type</label>
              <select value={type} onChange={e => setType(e.target.value)} style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid #ccc' }}>
                {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Title */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontWeight: 'bold' }}>Title *</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} required placeholder="Event title" style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid #ccc' }} />
            </div>

            {/* Description */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontWeight: 'bold' }}>Description *</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} required rows="4" placeholder="Event details" style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid #ccc', resize: 'none' }} />
            </div>

            {/* Date & Time */}
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontWeight: 'bold' }}>Date *</label>
                <input type="date" value={date} min={new Date().toISOString().split("T")[0]} onChange={e => setDate(e.target.value)} required style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid #ccc' }} />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontWeight: 'bold' }}>Time *</label>
                <input type="time" value={time} onChange={e => setTime(e.target.value)} required style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid #ccc' }} />
              </div>
            </div>

            {/* Duration */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontWeight: 'bold' }}>Duration (days) *</label>
              <input type="number" min="1" value={duration} onChange={e => setDuration(Number(e.target.value))} required style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid #ccc' }} />
            </div>

            {/* Location */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontWeight: 'bold' }}>Location *</label>
                <button type="button" onClick={useMyLocation} disabled={geoBusy} style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: geoBusy ? '#999' : '#2d89ef',
                  color: '#fff',
                  fontWeight: 'bold',
                  cursor: geoBusy ? 'not-allowed' : 'pointer',
                  transition: '0.3s'
                }}>
                  {geoBusy ? 'Locating...' : 'Use My Location'}
                </button>
              </div>
              <MapWrapper center={center || RUBY_AREA_KOLKATA} selected={selected} onSelect={handleMapSelect} height="180px" zoomOnSelect />
              <p style={{ fontSize: '0.75rem', color: '#555', marginTop: '0.3rem' }}>Click on map or use your location</p>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button type="submit" disabled={isSubmitting} style={{
                flex: 1,
                padding: '0.7rem',
                borderRadius: '10px',
                backgroundColor: isSubmitting ? '#999' : '#2d89ef',
                color: '#fff',
                fontWeight: 'bold',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                transition: '0.3s'
              }}>
                {isSubmitting ? "Submitting..." : "Submit"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} style={{
                flex: 1,
                padding: '0.7rem',
                borderRadius: '10px',
                backgroundColor: '#ccc',
                color: '#000',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: '0.3s'
              }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Search */}
      <input type="text" placeholder="Search events..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ width: '100%', padding: '0.8rem', marginBottom: '1rem', borderRadius: '10px', border: '1px solid #ccc' }} />

      {/* Mini Map */}
      {events.length > 0 && (
        <div style={{ marginBottom: '1rem', borderRadius: '12px', overflow: 'hidden', height: '250px' }}>
          <MapWrapper
            center={RUBY_AREA_KOLKATA}
            events={events.map(e => ({ id: e.id, lat: e.location?.lat, lng: e.location?.lng, title: e.title }))}
            height="100%"
          />
        </div>
      )}

      {/* Event Cards */}
      {loadingEvents ? (
        <div style={{ minHeight: '20vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <svg style={{ height: 40, width: 40}} viewBox="0 0 24 24" fill="none" stroke="#1F51FF" strokeWidth="2">
              <circle cx="12" cy="12" r="10" style={{ opacity: 0.25 }} />
              <path d="M4 12a8 8 0 018-8" strokeLinecap="round" style={{ transformOrigin: 'center', animation: 'spin 1s linear infinite' }} />
            </svg>
            <p style={{ marginTop: 12, color: '#555' }}>Loading events…</p>
            <style>{"@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }"}</style>
          </div>
        </div>
      ) : visibleEvents.length > 0 ? visibleEvents.map((event, index) => (
        <div key={event.id} style={{ padding: '1rem', borderRadius: '12px', boxShadow: '0 6px 18px rgba(0,0,0,0.08)', borderLeft: '6px solid #2d89ef', marginBottom: '0.8rem', backgroundColor: '#fff' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#2d89ef' }}>{event.title}</h2>
          <p style={{ fontSize: '0.95rem', color: '#555' }}>{(event.description || "").length > 100 ? (event.description || "").slice(0, 100) + "..." : event.description}</p>
          <p style={{ fontSize: '0.85rem', color: '#777' }}>📅 {event.date} ⏰ {event.time}</p>
          {renderCountdown(event)}
          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => setExpandedEvent(expandedEvent === index ? null : index)} style={{ padding: '0.5rem 1rem', background: '#2d89ef', color: '#fff', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}>
              {expandedEvent === index ? "Show Less" : "Read More"}
            </button>
            {["admin", "ngo"].includes(profile?.role) && (
              <button onClick={() => handleDelete(event.id)} disabled={deletingId === event.id} style={{ padding: '0.5rem 1rem', background: deletingId === event.id ? '#c0392b' : '#e74c3c', color: '#fff', borderRadius: '6px', border: 'none', cursor: deletingId === event.id ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}>
                {deletingId === event.id ? "Deleting..." : "Delete"}
              </button>
            )}
          </div>

          {expandedEvent === index && (
            <div style={{ marginTop: '0.75rem' }}>
              <div style={{ fontSize: '0.9rem', color: '#444' }}>{event.description}</div>
              {event.location && (
                <div style={{ marginTop: '0.5rem' }}>
                  <small style={{ color: '#666' }}>Location: {event.location.lat}, {event.location.lng}</small>
                </div>
              )}
            </div>
          )}
        </div>
      )) : (
        <p style={{ color: '#777', textAlign: 'center' }}>No events found.</p>
      )}
    </div>
  );
}

