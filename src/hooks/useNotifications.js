// src/hooks/useNotifications.js
import { useEffect, useState } from "react";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "./useAuth";

/**
 * useNotifications - returns realtime notifications for current user
 */
export default function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }
    const q = query(collection(db, "notifications"), where("toUid", "==", user.uid), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setNotifications(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error("notifications snapshot err", err);
      setNotifications([]);
    });
    return () => unsub();
  }, [user?.uid]);

  return notifications;
}
