// --- File: src/firebase/auth.js ---
// This file contains core Firebase authentication and profile management logic.
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile,
  linkWithCredential,
  sendPasswordResetEmail,
  fetchSignInMethodsForEmail,
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { app, db } from "./config"; // Import 'app' and 'db' from config

// Initialize Firebase Auth instance here as the single source
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider(); // Google Auth Provider initialized here

// Set auth persistence to local browser storage
setPersistence(auth, browserLocalPersistence)
  .then(() => {
    console.log("[AUTH] Auth persistence set to LOCAL.");
  })
  .catch((err) => {
    console.warn("[AUTH] Error setting auth persistence:", err?.message || err);
  });

// Helper function to create or update user profile in Firestore with all expected fields
const createOrUpdateUserProfile = async (user, initialRole = "citizen", initialPhone = null) => {
  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);

  // Default profile data to ensure all fields are always present
  const defaultProfileData = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || null, // Use displayName from auth user, or null
    role: initialRole,
    phone: initialPhone,
    bio: null,
    services: [], // Initialize as empty array
    address: null,
    languages: [], // Initialize as empty array
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    verified: false,
  };

  if (!userSnap.exists()) {
    // Create new profile if it doesn't exist, merging with potential initial data
    await setDoc(userRef, { ...defaultProfileData }, { merge: true });
    console.log(`[AUTH] New user profile created for ${user.email}`);
  } else {
    // Update existing profile fields, ensuring displayName and email are up-to-date
    const updateData = {
      email: user.email,
      updatedAt: serverTimestamp(),
    };
    // Only update displayName if it's provided and different (e.g., from Google login)
    if (user.displayName && user.displayName !== userSnap.data().displayName) {
      updateData.displayName = user.displayName;
    }
    await setDoc(userRef, updateData, { merge: true });
    console.log(`[AUTH] Existing user profile updated for ${user.email}`);
  }
};

/**
 * Handles user signup with email and password.
 * Also creates a Firestore user profile document.
 * @param {object} payload - { email, password, displayName, role, phone }
 * @returns {Promise<User>} The Firebase User object.
 * @throws {Error} Firebase auth error or custom error.
 */
export const signupWithEmail = async ({ email, password, displayName, role = "citizen", phone = null }) => {
  try {
    const res = await createUserWithEmailAndPassword(auth, email, password);
    const user = res.user;

    if (displayName) {
      await updateProfile(user, { displayName });
    }

    await createOrUpdateUserProfile(user, role, phone);
    console.log(`[AUTH] User signed up with email: ${user.email}`);
    return user;
  } catch (err) {
    console.error("[AUTH] Signup with email failed:", err);
    throw err; // Re-throw to be handled by UI
  }
};

/*
 * Handles user login with email and password.
 * Includes logic for account linking with pending Google credentials.
 * @param {object} payload - { email, password }
 * @returns {Promise<{user: User, linked: boolean}>} Object containing Firebase User and a linked status.
 * @throws {Error} Specific Firebase auth error or custom error.
 */
export const loginWithEmail = async ({ email, password }) => {
  try {
    const res = await signInWithEmailAndPassword(auth, email, password);
    const user = res.user;

    // Handle account linking if a pending Google credential exists
    const pending = sessionStorage.getItem("healthhub_pending_credential");
    if (pending) {
      try {
        const { idToken, accessToken } = JSON.parse(pending);
        const cred = GoogleAuthProvider.credential(idToken, accessToken);
        await linkWithCredential(user, cred);
        console.log(`[AUTH] Google account linked to ${user.email}`);
      } catch (linkErr) {
        console.warn("[AUTH] Linking pending credential failed:", linkErr);
      } finally {
        sessionStorage.removeItem("healthhub_pending_credential");
        sessionStorage.removeItem("healthhub_pending_email");
      }
    }

    await createOrUpdateUserProfile(user); // Ensure Firestore profile exists/is updated
    console.log(`[AUTH] User logged in with email: ${user.email}`);
    return { user, linked: !!pending, errorType: null };
  } catch (err) {
    console.error("[AUTH] Login with email failed:", err);
    // Intercept common Firebase login errors to provide more specific messages
    if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential" || err.code === "auth/wrong-password") {
      try {
        console.log(`[AUTH_DEBUG] Login failed, attempting to fetch sign-in methods for ${email}.`);
        const signInMethods = await fetchSignInMethodsForEmail(auth, email);
        console.log(`[AUTH_DEBUG] Sign-in methods returned for ${email} (for login check):`, signInMethods);

        if (signInMethods.length === 0) {
          const error = new Error("No account found with that email address.");
          error.code = "auth/user-not-found";
          throw error;
        }
        if (!signInMethods.includes("password")) {
          const error = new Error("This account is registered with a social provider (like Google). Please sign in using that provider.");
          error.code = "auth/social-only-login";
          throw error;
        }
        // If it reaches here, it means the user has a password provider, but credentials were wrong.
        const error = new Error("Wrong email or password.");
        error.code = "auth/wrong-password";
        throw error;
      } catch (innerErr) {
        console.error("[AUTH] Secondary login method check failed:", innerErr);
        throw innerErr; // Re-throw the specific inner error
      }
    }
    throw err; // Re-throw any other unexpected Firebase errors
  }
};

/*
 * Handles user sign-in/signup with Google.
 * @returns {Promise<User>} The Firebase User object.
 * @throws {Error} Firebase auth error (e.g., auth/account-exists-with-different-credential).
 */
// export const signInWithGoogle = async () => {
//   try {
//     const res = await signInWithPopup(auth, googleProvider);
//     const user = res.user;

//     await createOrUpdateUserProfile(user);
//     console.log(`[AUTH] User signed in with Google: ${user.email}`);
//     return user;
//   } catch (err) {
//     console.error("[AUTH] Sign in with Google failed:", err);
//     if (err.code === "auth/account-exists-with-different-credential") {
//       const pendingCred = GoogleAuthProvider.credentialFromError(err);
//       const email = err.customData?.email || err.email || null;
//       const idToken = pendingCred?.idToken || null;
//       const accessToken = pendingCred?.accessToken || null;

//       sessionStorage.setItem(
//         "healthhub_pending_credential",
//         JSON.stringify({ idToken, accessToken, providerId: pendingCred?.providerId || "google.com" })
//       );
//       if (email) sessionStorage.setItem("healthhub_pending_email", email);

//       const friendly = new Error(
//         "An account already exists with the same email using a different sign-in method. Please sign in using your original method (for example, email/password). After that, we will link the Google login to your account."
//       );
//       friendly.code = "auth/pending-credential";
//       throw friendly;
//     }
//     throw err;
//   }
// };

/*
 * Signs out the current user.
 * @returns {Promise<void>}
 * @throws {Error} Firebase auth error.
 */
export const signOut = async () => {
  try {
    await fbSignOut(auth);
    console.log("[AUTH] User signed out.");
  } catch (err) {
    console.error("[AUTH] Sign out failed:", err);
    throw err;
  }
};

/*
 * Sends a password reset email to the specified email address.
 * Pre-checks if the account exists and is an email/password account.
 * @param {string} email - The email address to send the reset link to.
 * @returns {Promise<{ success: true, message: string }>} On successful email send.
 * @throws {Error} Specific Firebase auth error or custom error.
 */
export const sendPasswordReset = async (email) => { // Expects a string email
  console.log(`[AUTH_DEBUG] Initiating password reset for email: "${email}"`);
  try {
    console.log(`[AUTH_DEBUG] Fetching sign-in methods for email: "${email}"`);
    const signInMethods = await fetchSignInMethodsForEmail(auth, email);
    console.log(`[AUTH_DEBUG] Sign-in methods returned for "${email}":`, signInMethods);

    if (signInMethods.length === 0) {
      // If no sign-in methods are returned, it means no account exists with that email OR Firebase config/API key is wrong.
      const error = new Error("No account found with that email address. Password reset email will only be sent to registered accounts.");
      error.code = "auth/account-not-found"; // Consistent Firebase-like code
      console.warn(`[AUTH_DEBUG] No sign-in methods found for "${email}". Throwing error.`);
      throw error;
    }

    if (signInMethods.includes(GoogleAuthProvider.PROVIDER_ID) && !signInMethods.includes('password')) {
      // Account exists, but only with Google (or other social, no password provider)
      const error = new Error("This email is registered with Google. Please reset password via Google or use Google Sign-In.");
      error.code = "auth/social-only-reset"; // Custom code
      console.warn(`[AUTH_DEBUG] "${email}" is a social-only account. Throwing error.`);
      throw error;
    }

    // If a password provider exists, and no other issues, proceed to send the reset email
    await sendPasswordResetEmail(auth, email);
    console.log(`[AUTH_DEBUG] Password reset email successfully sent to "${email}".`);
    return { success: true, message: "Password reset email sent successfully. Check your inbox." };

  } catch (error) {
    // Catch any errors during the process (e.g., network issues, Firebase errors)
    console.error(`[AUTH_DEBUG] Error during password reset for "${email}":`, error);
    throw error; // Re-throw the error as-is so Login.jsx's catch block can handle it with friendlyError
  }
};

/*
 * Helper to fetch sign-in methods for an email.
 * @param {string} email
 * @returns {Promise<string[]>} Array of sign-in method IDs.
 * @throws {Error} Firebase auth error.
 */
export async function getSignInMethods(email) {
  try {
    return await fetchSignInMethodsForEmail(auth, email);
  } catch (error) {
    console.error("[AUTH] Error fetching sign-in methods:", error);
    throw error; // Re-throw error for handling upstream
  }
}

export async function getUserProfile(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}


/**
 * Idempotently creates the users/{uid} profile with a fixed role.
 * This is used immediately after a new Google sign-in when no profile exists yet.
 */
export async function createProfileForCurrentUser(role) {
  const { currentUser } = auth;
  if (!currentUser) throw new Error("Not authenticated");
  if (!role) throw new Error("Role is required");

  const ref = doc(db, "users", currentUser.uid);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    // Do not mutate role if profile already exists
    return existing.data();
  }

  const profile = {
    uid: currentUser.uid,
    email: currentUser.email || null,
    name: currentUser.displayName || "",
    photoURL: currentUser.photoURL || "",
    // --- fix the role at creation time ---
    role,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    // keep any defaults you use elsewhere:
    status: "active",
    // ...add other default fields you rely on
  };

  await setDoc(ref, profile);
  return profile;
}

/**
 * Google sign-in that:
 * - signs in with popup,
 * - checks if a users/{uid} doc exists,
 * - if it doesn't and `roleIfNew` is provided, creates it,
 * - otherwise returns a flag to tell the UI to ask for a role.
 */
export async function signInWithGoogleAndMaybeCreate(roleIfNew) {
  const res = await signInWithPopup(auth, googleProvider);
  const { user } = res;

  const existingProfile = await getUserProfile(user.uid);
  if (existingProfile) {
    return { user, profile: existingProfile, created: false, needsRole: false };
  }

  if (!existingProfile) {
    if (roleIfNew) {
      const profile = await createProfileForCurrentUser(roleIfNew);
      return { user, profile, created: true, needsRole: false };
    }
    // New Google user, but no role yet — UI should prompt
    return { user, profile: null, created: false, needsRole: true };
  }
}
  
