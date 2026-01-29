// --- File: src/pages/Auth/Signup.jsx ---
import React, { useState } from "react"; // FIX: Corrected import syntax
import { useForm } from "react-hook-form";
import { useAuth } from "../../hooks/useAuth";
import { useNavigate, Link } from "react-router-dom";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { FcGoogle } from "react-icons/fc";
import AlertDialog from "../../components/AlertDialog"; // Import AlertDialog
import RolePickerDialog from "../../components/RolePickerDialog";
import { getAuth } from "firebase/auth"; // Import getAuth for user deletion

const schema = yup.object({
  displayName: yup.string().min(2, "Please enter your full name").required("Name required"),
  email: yup.string().email("Enter a valid email").required("Email required"),
  password: yup.string().min(6, "Password must be at least 6 characters").required("Password required"),
  role: yup.string().oneOf(["citizen", "provider", "ngo"], "Please select a valid role").required("Role required"),
  phone: yup.string().nullable().matches(/^\+?[0-9\s-]{7,15}$/, "Enter a valid phone number").notRequired().transform(value => value === '' ? null : value), // Transform empty string to null for optional field
});

export default function Signup() {
  const { signup, googleLogin, setProfile } = useAuth();
  const navigate = useNavigate();

  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
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
    formState: { errors, isSubmitting }
  } = useForm({
    resolver: yupResolver(schema),
    defaultValues: { role: "citizen" }
  });

  const friendlyError = (err) => {
    if (!err) return "Something went wrong. Please try again.";
    
    // Check if it's an error object with a 'code' property
    if (err.code) {
      switch (err.code) {
        case "auth/email-already-in-use":
          return "That email is already registered. Please login or use a different email.";
        case "auth/invalid-email":
          return "Invalid email address.";
        case "auth/weak-password":
          return "Password is too weak. Please use a stronger password (at least 6 characters).";
        case "auth/pending-credential":
          return "An account with this email already exists but is linked to a different provider. Please try signing up with that provider or linking accounts.";
        case "auth/network-request-failed":
          return "Network error. Please check your internet connection and try again.";
        case "auth/too-many-requests":
          return "Too many signup attempts. Please try again later.";
        default:
          console.warn(`[Signup] Unhandled Firebase error code: ${err.code}`, err);
          return err.message || "An unexpected error occurred. Please try again.";
      }
    }
    // Fallback for non-Firebase errors or generic JS errors
    return err.message || "An unexpected error occurred. Please try again.";
  };

  const onSubmit = async (data) => {
  try {
    await signup({
      email: data.email,
      password: data.password,
      displayName: data.displayName,
      role: data.role,
      phone: data.phone,
    });
    const { createProfileForCurrentUser } = await import("../../firebase/auth");
    const newProfile = await createProfileForCurrentUser(data.role);
    if (setProfile) setProfile(newProfile); // Update profile state in useAuth
    navigate("/profile/edit");
  } catch (err) {
    console.error("[Signup] Signup Error:", err);
    showAlert("Signup Error", friendlyError(err));
  }
};

  const handleRoleConfirm = async (role) => {
    try {
      setBusy(true);
      // finish the profile creation WITHOUT another Google popup:
      // call the new helper we added in auth.js
      const { createProfileForCurrentUser } = await import("../../firebase/auth");
      const newProfile = await createProfileForCurrentUser(role);
      setProfile(newProfile); // Update profile state in useAuth
      navigate("/profile/edit"); // Redirect to profile edit after role selection
      setNeedsRole(false);
      setPendingGoogleUser(null);
      // now continue exactly as your existing success path does
      // (e.g., router.push(dashboardForRole(role)) or let your routing guard redirect)
    } catch (e) {
      console.error(e);
      // surface a toast if you like
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
    } finally {
      setNeedsRole(false);
      setPendingGoogleUser(null);
    }
  };

  const handleGoogle = async () => {
    try {
      setBusy(true);
      const res = await googleLogin(); // no role yet
      if (res?.needsRole) {
        setPendingGoogleUser(res.user); // store for UX if needed
        setNeedsRole(true);             // open dialog
        return;
      }
      navigate("/profile/edit");
    } catch (err) {
      console.error("[Login] Google Login Error:", err);
      showAlert("Google Login Error", friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white p-6 shadow-lg rounded-xl">
      <h2 className="text-2xl font-bold text-center mb-6 text-gray-800">Create your HealthHub account</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
          <input
            {...register("displayName")}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            placeholder="John Doe"
          />
          {errors.displayName && <p className="text-red-500 text-xs mt-1">{errors.displayName.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            {...register("email")}
            type="email"
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            placeholder="your.email@example.com"
          />
          {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input
            type="password"
            {...register("password")}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            placeholder="••••••••"
          />
          {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
          <select
            {...register("role")}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white"
          >
            <option value="citizen">Citizen</option>
            <option value="provider">Provider</option>
            <option value="ngo">NGO</option>
          </select>
          {errors.role && <p className="text-red-500 text-xs mt-1">{errors.role.message}</p>}
          <div className="mt-4 text-xs text-gray-600 space-y-1 mb-2 border-amber-600 border rounded-md p-2 bg-yellow-50">
            
            <div><strong>Note:</strong></div>
            <div><strong>• Citizen</strong> — Someone reporting an issue or seeking help for themselves or family.</div>
            <div><strong>• Provider</strong> — Medical facility, clinic, doctor or official responder who can accept and resolve reports.</div>
            <div><strong>• NGO</strong> — Non-profit organisation coordinating community response and resources.</div>
            <div><strong>Choose the role that best fits your needs. A role once chosen cannot be changed later!</strong></div>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone (optional)</label>
          <input
            {...register("phone")}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            placeholder="+1 (555) 123-4567"
          />
          {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition duration-150 ease-in-out"
        >
          {isSubmitting ? "Creating Account..." : "Sign up"}
        </button>

        <div className="relative flex py-5 items-center">
          <div className="flex-grow border-t border-gray-300"></div>
          <span className="flex-shrink mx-4 text-gray-400 text-sm">OR</span>
          <div className="flex-grow border-t border-gray-300"></div>
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          className="w-full flex justify-center items-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 ease-in-out"
        >
          <FcGoogle className="mr-2" size={20} />
          <span>Sign up with Google</span>
        </button>

        {needsRole && (
          <RolePickerDialog
            open={needsRole}
            onConfirm={handleRoleConfirm}
            onCancel={handleRoleCancel}
          />
        )}

      </form>

      <p className="mt-6 text-center text-sm text-gray-600">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-blue-600 hover:text-blue-800 hover:underline">
          Login
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
