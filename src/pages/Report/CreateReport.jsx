// src/pages/Report/CreateReport.jsx
import React, { useEffect, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { addDoc, collection, serverTimestamp, setDoc, doc } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useAuth } from "../../hooks/useAuth";
import { useNavigate } from "react-router-dom";
import MapWrapper from "../../components/Map/MapWrapper";
import { useToast } from "../../components/ToastProvider";

const TYPES = [
  { value: "illness", label: "Illness" },
  { value: "outbreak", label: "Outbreak" },
  { value: "mental", label: "Mental Health" },
  { value: "other", label: "Other" },
];

// Define a maximum acceptable accuracy for automatically setting location.
// Locations worse than this (higher meter value) will be rejected as too inaccurate.
const MAX_ACCEPTABLE_ACCURACY_FOR_AUTO = 15000; // 15 kilometers

// --- DEFAULT COORDINATES FOR RUBY AREA, KOLKATA ---
const RUBY_AREA_KOLKATA = { lat: 22.51, lng: 88.40 }; // Approximate center for Ruby area

export default function CreateReport() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { type: "illness", title: "", description: "", tags: "", address: "", photoUrl: "" },
  });

  const [center, setCenter] = useState(null);
  const [selected, setSelected] = useState(null);
  // FIX: Declare useState for selectedAccuracy and selectedSource
  const [selectedAccuracy, setSelectedAccuracy] = useState(null);
  const [selectedSource, setSelectedSource] = useState(null); // 'auto' or 'manual'
  const [geoBusy, setGeoBusy] = useState(false);
  const geolocationWatchId = useRef(null); // To store watchPosition ID

  // Handler for map clicks, now correctly sets accuracy and source
  const handleMapSelect = (position) => {
    setSelected(position);
    setSelectedAccuracy(null); // When manually selecting, accuracy is not applicable/unknown
    setSelectedSource("manual");
  };

  // Initial location fetch when component mounts
  useEffect(() => {
    // Clear any previous watchPosition
    if (geolocationWatchId.current) {
      navigator.geolocation.clearWatch(geolocationWatchId.current);
      geolocationWatchId.current = null;
    }

    if (!center && "geolocation" in navigator) {
      // Try to get a high-accuracy position with more generous timeout
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          // `pos.coords.accuracy` is in meters. Smaller is better.
          const INITIAL_ACCURACY_THRESHOLD = 500; // A reasonable initial accuracy for map center
          if (pos.coords.accuracy <= INITIAL_ACCURACY_THRESHOLD) {
            setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          } else {
            console.warn(`[Geolocation] Initial location too inaccurate (${pos.coords.accuracy.toFixed(0)}m). Falling back to Ruby area.`);
            setCenter(RUBY_AREA_KOLKATA); // Fallback to Ruby area on initial load
          }
        },
        (err) => {
          console.error("[Geolocation] Initial fetch failed:", err.message);
          setCenter(RUBY_AREA_KOLKATA); // Fallback to Ruby area on error
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 } // 15s timeout, 1min cached age
      );
    } else if (!center) {
      // If geolocation is not available at all or initial fetch already failed
      setCenter(RUBY_AREA_KOLKATA); // Default fallback if no geolocation or initial fetch skipped
    }

    // Cleanup function: important for preventing memory leaks and stale watchers
    return () => {
      if (geolocationWatchId.current) {
        navigator.geolocation.clearWatch(geolocationWatchId.current);
      }
    };
  }, [center]); // Rerun if center is null, ensuring it gets set initially


  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      addToast({ type: "error", title: "Location Error", message: "Geolocation not available in your browser." });
      return;
    }

    setGeoBusy(true);
    setCenter(null); // Clear center to force a fresh lookup if needed
    setSelected(null); // Clear selected location
    setSelectedAccuracy(null); // Clear previous accuracy
    setSelectedSource(null); // Clear previous source

    // Clear any existing watch and try to get a single, high-accuracy current position
    if (geolocationWatchId.current) {
      navigator.geolocation.clearWatch(geolocationWatchId.current);
      geolocationWatchId.current = null;
    }

    // Attempt to get a high-accuracy position
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // --- Tier 1: Hard Reject for wildly inaccurate locations ---
        // Locations worse than MAX_ACCEPTABLE_ACCURACY_FOR_AUTO will be fully rejected.
        if (pos.coords.accuracy > MAX_ACCEPTABLE_ACCURACY_FOR_AUTO) {
          addToast({ type: "error", title: "Location Error", message: `Your location could not be accurately determined (${pos.coords.accuracy.toFixed(0)}m). Please select manually on the map.` });
          console.warn(`[Geolocation] Location rejected: wildly inaccurate (${pos.coords.accuracy}m).`);
          setCenter(RUBY_AREA_KOLKATA); // Fallback to Ruby area if wildly inaccurate
          setSelected(null); // Clear selected marker
          setSelectedAccuracy(null);
          setSelectedSource(null);
          setGeoBusy(false);
          return; // Exit early as location is unusable
        }

        // --- Tier 2 & 3: Acceptable but prefer higher accuracy ---
        const PREFERRED_ACCURACY_THRESHOLD = 500; // Prefer accuracy within 500 meters

        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCenter(p);
        setSelected(p); // Always set the selected point if it passes the hard reject
        setSelectedAccuracy(pos.coords.accuracy); // Set accuracy from geolocation
        setSelectedSource("auto"); // Set source as automatic

        if (pos.coords.accuracy <= PREFERRED_ACCURACY_THRESHOLD) {
          addToast({ type: "success", title: "Location Set", message: `Using your current location (accuracy: ${pos.coords.accuracy.toFixed(0)}m).` });
        } else {
          // Location is accepted (<= MAX_ACCEPTABLE_ACCURACY_FOR_AUTO) but not ideal (< PREFERRED_ACCURACY_THRESHOLD)
          addToast({ type: "warning", title: "Location Warning", message: `Your location has low precision (accuracy: ${pos.coords.accuracy.toFixed(0)}m). Consider adjusting manually on the map.` });
          console.warn(`[Geolocation] Location obtained but below preferred accuracy (${pos.coords.accuracy}m).`);
        }
        setGeoBusy(false);
      },
      (err) => {
        setGeoBusy(false);
        let errorMessage = "Unable to fetch location.";
        if (err.code === err.PERMISSION_DENIED) {
          errorMessage = "Location access denied. Please enable location services in your browser settings.";
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          errorMessage = "Location information is unavailable (e.g., no GPS/WiFi).";
        } else if (err.code === err.TIMEOUT) {
          errorMessage = "Location request timed out. Please try again.";
        }
        addToast({ type: "error", title: "Location Error", message: errorMessage });
        console.error("[Geolocation] Fetch failed:", err.message);
        setCenter(RUBY_AREA_KOLKATA); // Fallback to Ruby area on error
        setSelected(null);
        setSelectedAccuracy(null);
        setSelectedSource(null);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 } // 20s timeout, force fresh reading
    );
  };

  if (loading) return <div className="p-6">Loading...</div>;
  if (!user) return <div className="p-6">Please log in to create a report.</div>;

  const onSubmit = async (data) => {
    if (!selected) {
      setError("location", { type: "manual", message: "Please pick a location on the map or use your location." });
      // Added toast for location error for more prominent feedback
      addToast({ type: "error", title: "Missing Location", message: "Please pick a location on the map or use your location." });
      return;
    }
    if (data.photoUrl && !/^https?:\/\/\S+\.\S+/.test(data.photoUrl)) {
      setError("photoUrl", { type: "manual", message: "Please enter a valid http(s) URL or leave blank." });
      // Added toast for photoUrl error
      addToast({ type: "error", title: "Invalid Photo URL", message: "Please enter a valid http(s) URL or leave blank." });
      return;
    }

    const payload = {
      uid: user.uid,
      creatorRole: profile?.role || "citizen",
      type: data.type,
      title: data.title.trim(),
      description: data.description.trim(),
      tags: data.tags ? data.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      address: data.address?.trim() || null,
      location: selected,
      // FIX: Ensure these are correctly passed
      locationAccuracy: selectedAccuracy ?? null,
      locationSource: selectedSource ?? null, // Default to null if not set
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(), // Ensure consistent updatedAt for all new reports
      photoUrl: data.photoUrl?.trim() || null,
      notes: [], // FIX: Initialize notes as an empty array for new reports
    };

    try {
      const docRef = await addDoc(collection(db, "reports"), payload);

      // also write sanitized copy for public map
      await setDoc(doc(db, "publicReports", docRef.id), {
        reportId: docRef.id,
        title: payload.title,
        type: payload.type,
        status: payload.status,
        lat: payload.location?.lat || null,
        lng: payload.location?.lng || null,
        location: { lat: payload.location.lat, lng: payload.location.lng },
        approxArea: payload.address || null, // or a coarser area if you add one
        createdAt: serverTimestamp(),
      });

      addToast({ type: "success", title: "Report submitted", message: "Thank you for contributing." });
      navigate("/reports");
    } catch (e) {
      console.error(e);
      addToast({ type: "error", title: "Submission failed", message: "Please try again." });
    }

  };

  return (
    <div className="max-w-3xl mx-auto bg-white p-6 rounded shadow">
      <h2 className="text-xl font-semibold mb-4">Create Community Health Report</h2>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm mb-1">Category</label>
          <select {...register("type", { required: true })} className="w-full border p-2 rounded">
            {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm mb-1">Title</label>
          <input
            {...register("title", { required: "Title is required", minLength: { value: 4, message: "Min 4 characters" } })}
            className="w-full border p-2 rounded"
            placeholder="Short descriptive title"
          />
          {errors.title && <p className="text-red-600 text-sm mt-1">{errors.title.message}</p>}
        </div>

        <div>
          <label className="block text-sm mb-1">Description</label>
          <textarea
            {...register("description", { required: "Description is required", minLength: { value: 10, message: "Min 10 characters" } })}
            className="w-full border p-2 rounded"
            rows={4}
            placeholder="Describe symptoms, severity, people affected, etc."
          />
          {errors.description && <p className="text-red-600 text-sm mt-1">{errors.description.message}</p>}
        </div>

        <div>
          <label className="block text-sm mb-1">Tags (comma separated)</label>
          <input {...register("tags")} className="w-full border p-2 rounded" placeholder="fever, cough, community-name" />
        </div>

        <div>
          <label className="block text-sm mb-1">Address (optional)</label>
          <input {...register("address")} className="w-full border p-2 rounded" placeholder="House/Street/Area (manual entry)" />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm">Location</label>
            <button
              type="button"
              onClick={useMyLocation}
              className="px-3 py-1 border rounded hover:bg-gray-50 text-sm"
              disabled={geoBusy}
            >
              {geoBusy ? "Locating..." : "Use my location"}
            </button>
          </div>

          <MapWrapper
            center={center}
            selected={selected}
            onSelect={handleMapSelect} // FIX: Use the new handler function
            height="320px"
            zoomOnSelect
          />

          {errors.location && <p className="text-red-600 text-sm mt-1">{errors.location.message}</p>}
          <p className="text-xs text-gray-500 mt-1">
            Click on the map to set location (or use your location). If automatic detection is not precise, please select a point manually.
          </p>
        </div>

        <div>
          <label className="block text-sm mb-1">Photo URL (optional)</label>
          <input {...register("photoUrl")} className="w-full border p-2 rounded" placeholder="https://example.com/image.jpg" />
          {errors.photoUrl && <p className="text-red-600 text-sm mt-1">{errors.photoUrl.message}</p>}
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-60"
          >
            {isSubmitting ? "Submitting..." : "Submit report"}
          </button>
        </div>
      </form>
    </div>
  );
}