// src/pages/Auth/Login.jsx
import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, Link } from "react-router-dom";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { FcGoogle } from "react-icons/fc";
import { useAuth } from "../../hooks/useAuth";
import AlertDialog from "../../components/AlertDialog"; // Import AlertDialog
import RolePickerDialog from "../../components/RolePickerDialog";

// Import the specific function for Google sign-in and profile creation
import { signInWithGoogleAndMaybeCreate, createProfileForCurrentUser } from "../../firebase/auth";
import { getAuth } from "firebase/auth"; // Import getAuth for user deletion
import { useToast } from "../../components/ToastProvider"; // Ensure useToast is imported


// Update schema to make password optional for reset flow
const schema = yup.object({
  email: yup.string().email("Enter a valid email").required("Email required"),
  password: yup.string().nullable().notRequired(), // Password is not required for reset form
});

export default function Login() {
  // Destructure 'addToast' from useToast to use it
  const { login, sendPasswordReset, setProfile } = useAuth(); // ADD setProfile here
  const { addToast } = useToast(); // Ensure addToast is available
  const navigate = useNavigate();
  // FIX: Correctly declared useState variables
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetMessage, setResetMessage] = useState(null);
  const [isResetting, setIsResetting] = useState(false);

  // State for custom alert dialog
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [alertTitle, setAlertTitle] = useState(""); // FIX: Corrected useState declaration
  const [alertMessage, setAlertMessage] = useState("");

  const [busy, setBusy] = useState(false);
  const [needsRole, setNeedsRole] = useState(false);
  const [pendingGoogleUser, setPendingGoogleUser] = useState(null);

  const showAlert = (title, message) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setIsAlertOpen(true);
  };

  const closeAlert = () => {
    setIsAlertOpen(false);
    setAlertTitle("");
    setAlertMessage("");
  };

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    getValues,
  } = useForm({
    resolver: yupResolver(schema), // This activates yup validation
  });

  // Helper function to provide user-friendly error messages based on error code
  const friendlyError = (err) => {
    if (!err) return "Something went wrong. Please try again.";
    
    // Check if it's an error object with a 'code' property
    if (err.code) {
      switch (err.code) {
        case "auth/wrong-password":
        case "auth/invalid-credential": // Firebase sometimes uses this for wrong password
          return "Wrong email or password.";
        case "auth/user-not-found":
          return "No account found with that email address.";
        case "auth/invalid-email":
          return "Invalid email address.";
        case "auth/pending-credential":
          return err.message; // From Google linking flow
        case "auth/social-only-login":
          return "This account is registered with a social provider (like Google). Please sign in using that provider."; // Custom error for email/pass login attempt on social-only account
        case "auth/social-only-reset":
          return "This email is registered with Google. Please reset password via Google or use Google Sign-In."; // Custom error for password reset attempt on social-only account
        case "auth/account-not-found": // Specifically for password reset
          return "No account found with that email address. Password reset email will only be sent to registered accounts.";
        case "auth/network-request-failed":
          return "Network error. Please check your internet connection and try again.";
        case "auth/too-many-requests":
          return "Too many requests. Please try again later.";
        default:
          console.warn(`[Login] Unhandled Firebase error code: ${err.code}`, err);
          return err.message || "An unexpected error occurred. Please try again.";
      }
    }
    // Fallback for non-Firebase errors or generic JS errors
    return err.message || "An unexpected error occurred. Please try again.";
  };

  const onSubmit = async (data) => {
    if (!showResetForm) {
      try {
        const res = await login({ email: data.email, password: data.password });
        if (res?.linked) {
          showAlert("Account Linked!", "Your Google account has been linked. You can now log in with Google as well.");
        }
        navigate("/");
      } catch (err) {
        console.error("[Login] Login Error:", err);
        showAlert("Login Error", friendlyError(err));
      }
    } else {
      handleResetPassword(); // If in reset mode, submit triggers reset
    }
  };

  // Corrected Google Sign-in Handler
  const handleGoogle = async () => {
    setBusy(true); // Assumes you have a setLoading state
    try {
      const { user, profile, needsRole } = await signInWithGoogleAndMaybeCreate();
      
      // Check if the user is new and needs to select a role
      if (needsRole) {
        // Store the user temporarily if you need their object in RolePickerDialog
        setPendingGoogleUser(user); 
        setNeedsRole(true); // Trigger the RolePickerDialog
        // addToast({ type: "info", title: "Welcome!", message: "Please select your role to continue." });
        // The dialog itself will handle prompting the user.
      } else {
        // If a profile exists or was created with a default role
        if (profile) { // Ensure profile exists before accessing
          addToast({ type: "success", title: "Sign-in successful!", message: `Welcome back, ${profile.displayName || user.email}.` });
        } else {
          addToast({ type: "success", title: "Sign-in successful!", message: `Welcome back, ${user.email}.` });
        }
        navigate("/"); // Or your main application page
      }
      
    } catch (error) {
      console.error("Google sign-in failed:", error);
      // Ensure 'addToast' is available here too
      addToast({ type: "error", title: "Sign-in Failed", message: friendlyError(error) });
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async () => {
    const emailToReset = getValues("email");
    if (!emailToReset) {
      showAlert("Input Error", "Please enter your email to reset password.");
      return;
    }

    setIsResetting(true);
    setResetMessage(null);

    try {
      // sendPasswordReset now consistently returns {success:true, message:string} or THROWS AN ERROR
      const res = await sendPasswordReset(emailToReset); // Passed email string directly
      if (res.success) { // This condition will only be true on successful email send
        setResetMessage(res.message);
        showAlert("Password Reset", res.message);
        setShowResetForm(false); // Hide reset form on success
      }
      // No else block here for errors, as sendPasswordReset now throws errors which are caught below
    } catch (err) {
      // This catch block will handle ALL errors thrown from sendPasswordReset in auth.js
      console.error("[Login] Password Reset Error:", err);
      const errorMessage = friendlyError(err);
      setResetMessage(`Error: ${errorMessage}`);
      showAlert("Password Reset Error", errorMessage);
    } finally {
      setIsResetting(false);
    }
  };


  const handleRoleConfirm = async (role) => {
    try {
      setBusy(true);
      // finish the profile creation WITHOUT another Google popup:
      // We already have `createProfileForCurrentUser` imported
      const newProfile = await createProfileForCurrentUser(role); // Get the new profile data
      
      // IMPORTANT: Update the profile state in useAuth immediately
      setProfile(newProfile); 

      setNeedsRole(false);
      setPendingGoogleUser(null);
      // After role is confirmed and profile created, navigate to dashboard
      addToast({ type: "success", title: "Profile Complete!", message: `Your role as ${role} has been set.` });
      navigate("/"); // Navigate to home or a role-specific dashboard
    } catch (e) {
      console.error("Error setting user role:", e);
      addToast({ type: "error", title: "Error", message: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  };

  const handleRoleCancel = async () => {
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (user) {
        // Delete the half-created Google account if role not selected
        await user.delete();
        await auth.signOut(); // Ensure user is signed out after deletion
        addToast({ type: "info", title: "Account Deleted", message: "Your Google account was deleted since no role was selected." });
        navigate("/login"); // Redirect to login page after deletion
      }
    } catch (err) {
      console.error("Error deleting uncompleted Google signup:", err);
      // If deletion fails, at least sign out the user to prevent them from being stuck
      try {
        const auth = getAuth();
        await auth.signOut();
      } catch (signOutErr) {
        console.error("Failed to sign out after deletion error:", signOutErr);
      }
      addToast({ type: "error", title: "Error Deleting Account", message: "Could not fully delete the incomplete account. Please try again later or contact support." });
    } finally {
      setNeedsRole(false);
      setPendingGoogleUser(null);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white p-6 shadow-lg rounded-xl">
      <h2 className="text-2xl font-bold text-center mb-6 text-gray-800">
        {showResetForm ? "Reset Password" : "Login to HealthHub"}
      </h2>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            {...register("email")}
            type="email"
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            disabled={isSubmitting || isResetting}
            placeholder="your.email@example.com"
          />
          {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
        </div>

        {!showResetForm && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              {...register("password")}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="••••••••"
            />
            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
            <button
              type="button"
              onClick={() => { setShowResetForm(true); setResetMessage(null); }}
              className="text-sm text-blue-600 hover:text-blue-800 hover:underline mt-2 block text-right"
            >
              Forgot Password?
            </button>
          </div>
        )}

        {showResetForm ? (
          <button
            type="button"
            onClick={handleResetPassword}
            disabled={isResetting || isSubmitting}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition duration-150 ease-in-out"
          >
            {isResetting ? "Sending Reset Email..." : "Send Reset Email"}
          </button>
        ) : (
          <button
            type="submit"
            disabled={isSubmitting || isResetting}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition duration-150 ease-in-out"
          >
            {isSubmitting ? "Logging In..." : "Login"}
          </button>
        )}

        {resetMessage && (
          <p className={`text-center text-sm mt-3 ${resetMessage.includes("sent successfully") ? "text-green-600" : "text-red-500"}`}>
            {resetMessage}
          </p>
        )}

        {showResetForm && (
          <button
            type="button"
            onClick={() => { setShowResetForm(false); setResetMessage(null); }}
            className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 mt-2 transition duration-150 ease-in-out"
          >
            Back to Login
          </button>
        )}

        <div className="relative flex py-5 items-center">
          <div className="flex-grow border-t border-gray-300"></div>
          <span className="flex-shrink mx-4 text-gray-400 text-sm">OR</span>
          <div className="flex-grow border-t border-gray-300"></div>
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={busy} // Disable button while busy
          className="w-full flex justify-center items-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 ease-in-out"
        >
          <FcGoogle className="mr-2" size={20} />
          <span>Login with Google</span>
        </button>
        {needsRole && (
          <RolePickerDialog
            open={needsRole}
            onConfirm={handleRoleConfirm}
            onCancel={handleRoleCancel}
            // Pass the pendingGoogleUser to the RolePickerDialog if needed for profile creation
            // pendingUser={pendingGoogleUser}
          />
        )}
      </form>

      <p className="mt-6 text-center text-sm text-gray-600">
        Don't have an account?{" "}
        <Link to="/signup" className="font-medium text-blue-600 hover:text-blue-800 hover:underline">
          Sign up
        </Link>
      </p>

      <AlertDialog
        title={alertTitle}
        message={alertMessage}
        isOpen={isAlertOpen}
        onClose={closeAlert}
      />
    </div>
  );
}
