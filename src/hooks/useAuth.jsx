// --- File: src/hooks/useAuth.jsx ---
import React, { useEffect, useState, useContext, createContext } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
// Import 'db' from config, and all auth functions (including 'auth' instance) from authApi
import { db } from "../firebase/config";
import * as authApi from "../firebase/auth"; // Imports all functions including 'auth' from your auth.js file

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const authState = useProvideAuth();
  return <AuthContext.Provider value={authState}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

function useProvideAuth() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null); // Firestore user doc
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen to auth state changes using the 'auth' instance from authApi
    const unsub = onAuthStateChanged(authApi.auth, async (currentUser) => {
      if (!currentUser) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      setUser(currentUser);
      try {
        const docRef = doc(db, "users", currentUser.uid);
        const snap = await getDoc(docRef);
        setProfile(snap.exists() ? snap.data() : null);
        console.log(`[useAuth] Fetched profile for user: ${currentUser.email}`);
      } catch (err) {
        console.error("[useAuth] Failed to fetch user profile:", err);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []); // Empty dependency array ensures this effect runs once on mount

  // Authentication actions, wrapping the functions from your firebase/auth.js
  const signup = async (credentials) => {
    console.log("[useAuth] Calling signupWithEmail...");
    const newUser = await authApi.signupWithEmail(credentials);
    // Profile fetch is handled by onAuthStateChanged listener, which fires after signup
    return newUser;
  };

  const login = async (credentials) => {
    console.log("[useAuth] Calling loginWithEmail...");
    const res = await authApi.loginWithEmail(credentials);
    // Profile fetch is handled by onAuthStateChanged listener, which fires after login
    return res;
  };

  // NEW: Google login that handles new user roles
  const googleLogin = async (roleIfNew) => {
    console.log("[useAuth] Calling signInWithGoogleAndMaybeCreate.");
    // NEW: call the smarter API that returns `needsRole` for brand-new Google users
    const result = await authApi.signInWithGoogleAndMaybeCreate(roleIfNew);
    // onAuthStateChanged will still refresh `user` and `profile` after writes
    return result; // { user, profile, created, needsRole }
  };


  const logout = async () => {
    console.log("[useAuth] Calling signOut...");
    await authApi.signOut();
    setUser(null);
    setProfile(null);
  };

  return {
    user,
    profile,
    loading,
    signup,
    login,
    googleLogin,
    logout,
    setProfile,
    // Expose sendPasswordReset and getSignInMethods from authApi
    sendPasswordReset: authApi.sendPasswordReset,
    getSignInMethods: authApi.getSignInMethods,
  };
}
