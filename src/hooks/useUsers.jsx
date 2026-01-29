// src/hooks/useUsers.jsx
import React, { useEffect, useState, useContext, createContext, useMemo } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "../firebase/config"; // Ensure db is imported from config

const UsersContext = createContext(null);

export function UsersProvider({ children }) {
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  useEffect(() => {
    // Fetch all users to map UIDs to display names
    const q = query(collection(db, "users"));
    const unsub = onSnapshot(q, (snap) => {
      const usersList = [];
      snap.forEach((doc) => {
        const data = doc.data();
        usersList.push({
          uid: doc.id,
          displayName: data.displayName || data.email || "Unknown User", // Fallback to email or generic
          role: data.role || "citizen",
        });
      });
      setUsers(usersList);
      setLoadingUsers(false);
    }, (error) => {
      console.error("Error fetching all user profiles:", error);
      // Even on error, set loading to false to unblock UI, but users will be empty
      setLoadingUsers(false); 
    });

    return () => unsub(); // Cleanup subscription
  }, []); // Run once on mount

  // Create a map for quick lookups: uid -> {displayName, role}
  const usersMap = useMemo(() => {
    return users.reduce((acc, user) => {
      acc[user.uid] = user;
      return acc;
    }, {});
  }, [users]);

  const value = useMemo(() => ({ users, usersMap, loadingUsers }), [users, usersMap, loadingUsers]);

  return (
    <UsersContext.Provider value={value}>
      {children}
    </UsersContext.Provider>
  );
}

export const useUsers = () => {
  const context = useContext(UsersContext);
  if (!context) {
    throw new Error("useUsers must be used within a UsersProvider");
  }
  return context;
};
