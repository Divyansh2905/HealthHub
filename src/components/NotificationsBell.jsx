// src/components/NotificationsBell.jsx
import React, { useState, useRef, useEffect } from "react";
import useNotifications from "../hooks/useNotifications";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useNavigate } from "react-router-dom";

/**
 * NotificationsBell - bell with unread count and dropdown.
 * - Closes when clicking outside or pressing Escape.
 */
export default function NotificationsBell() {
  const notifications = useNotifications();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const containerRef = useRef(null);

  const unread = notifications.filter((n) => !n.read).length;

  const handleOpenItem = async (n) => {
    try {
      if (!n.read) {
        await updateDoc(doc(db, "notifications", n.id), { read: true });
      }
    } catch (err) {
      console.error("mark notif read", err);
    } finally {
      setOpen(false);
      if (n.link) navigate(n.link);
    }
  };

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    function onDocClick(e) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("touchstart", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("touchstart", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button onClick={() => setOpen((s) => !s)} className="relative p-2">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && <span className="absolute -top-0 -right-0 inline-flex items-center justify-center px-1 py-0.5 text-xs font-bold leading-none text-white bg-red-600 rounded-full">{unread}</span>}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border rounded shadow z-50">
          <div className="p-2 text-sm font-semibold">Notifications</div>
          <div className="max-h-64 overflow-auto">
            {notifications.length === 0 && <div className="p-3 text-sm text-gray-500">No notifications</div>}
            {notifications.map((n) => (
              <div key={n.id} className={`p-3 border-t hover:bg-gray-50 cursor-pointer ${n.read ? "" : "bg-gray-50"}`} onClick={() => handleOpenItem(n)}>
                <div className="font-medium text-sm">{n.title}</div>
                <div className="text-xs text-gray-600">{n.body}</div>
                <div className="text-xs text-gray-400 mt-1">{n.createdAt?.toDate ? n.createdAt.toDate().toLocaleString() : ""}</div>
              </div>
            ))}
          </div>
          <div className="p-2 text-center text-xs text-gray-500">Powered by HealthHub</div>
        </div>
      )}
    </div>
  );
}
