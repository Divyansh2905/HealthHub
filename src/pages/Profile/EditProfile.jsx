// src/pages/Profile/EditProfile.jsx
import React, { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useAuth } from "../../hooks/useAuth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useNavigate } from "react-router-dom";
import { useToast } from "../../components/ToastProvider";

/**
 * Role-specific fields:
 * - citizen: emergency contact, basic address
 * - provider: clinicName, licenseNumber, services, workingHours, facilityAddress
 * - ngo: orgName, registrationId, serviceAreas, contactPerson, website
 *
 * The form auto-fills from profile (Firestore) and falls back to auth user data.
 */

export default function EditProfile(){
  const { user, profile, setProfile, loading } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast(); // Ensure addToast is available

  // show loading until auth state finished
  useEffect(() => {
    // nothing — hook provides loading
  }, []);

  // Build defaults based on profile or user info
  const defaults = useMemo(() => {
    return {
      displayName: profile?.displayName || user?.displayName || "",
      phone: profile?.phone || "",
      bio: profile?.bio || "",
      services: (profile?.services || []).join(", "),
      address: profile?.address || "",
      languages: (profile?.languages || []).join(", "),
      // role-specific default fields
      emergencyContact: profile?.emergencyContact || "",
      clinicName: profile?.clinicName || "",
      licenseNumber: profile?.licenseNumber || "",
      facilityAddress: profile?.facilityAddress || "",
      orgName: profile?.orgName || "",
      registrationId: profile?.registrationId || "",
      serviceAreas: (profile?.serviceAreas || []).join(", "),
      contactPerson: profile?.contactPerson || "",
      website: profile?.website || "",
      skills: (profile?.skills || []).join(", "),
      availability: profile?.availability || "",
      city: profile?.city || "",
    };
  }, [profile, user]);

  const { register, handleSubmit, reset, watch, formState } = useForm({
    defaultValues: defaults,
  });

  // re-populate form when profile (or defaults) changes
  useEffect(() => {
    reset(defaults);
  }, [defaults, reset]);

  if (loading) return <div className="p-6">Loading user...</div>;
  if (!user) return <div className="p-6">Please login to edit profile.</div>;

  const role = profile?.role || "citizen";

  const onSubmit = async (data) => {
    const userRef = doc(db, "users", user.uid);

    // Build payload from common fields
    const payload = {
      uid: user.uid,
      displayName: data.displayName || null,
      phone: data.phone || null,
      bio: data.bio || null,
      services: data.services ? data.services.split(",").map(s => s.trim()).filter(Boolean) : [],
      address: data.address || null,
      languages: data.languages ? data.languages.split(",").map(s => s.trim()).filter(Boolean) : [],
      updatedAt: serverTimestamp(),
      // keep role (prevent client-side role escalation)
      role: profile?.role || "citizen",
    };

    // Merge role-specific fields
    if (role === "citizen") {
      payload.emergencyContact = data.emergencyContact || null;
    } else if (role === "provider") {
      payload.clinicName = data.clinicName || null;
      payload.licenseNumber = data.licenseNumber || null;
      payload.facilityAddress = data.facilityAddress || null;
      payload.services = data.services ? data.services.split(",").map(s => s.trim()).filter(Boolean) : payload.services;
      payload.workingHours = data.workingHours || null;
    } else if (role === "ngo") {
      payload.orgName = data.orgName || null;
      payload.registrationId = data.registrationId || null;
      payload.serviceAreas = data.serviceAreas ? data.serviceAreas.split(",").map(s => s.trim()).filter(Boolean) : [];
      payload.contactPerson = data.contactPerson || null;
      payload.website = data.website || null;
    }

    // Write to firestore
    await setDoc(userRef, payload, { merge: true });
    // Update local profile context so UI updates immediately
    setProfile({ ...(profile || {}), ...payload });
    addToast({ type: "success", title: "Profile Updated", message: "Your profile has been updated successfully." });
    navigate("/");
  };

  return (
    <div className="max-w-3xl mx-auto bg-white p-6 rounded shadow">
      <h2 className="text-xl font-semibold mb-4">Edit Profile ({role})</h2>

      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        {/* Common fields */}
        <div>
          <label className="block text-sm">Display name</label>
          <input {...register("displayName")} className="w-full border p-2 rounded" required />
        </div>

        <div>
          <label className="block text-sm">Phone</label>
          <input {...register("phone")} className="w-full border p-2 rounded" />
        </div>

        <div>
          <label className="block text-sm">Address</label>
          <input {...register("address")} className="w-full border p-2 rounded" />
        </div>

        <div>
          <label className="block text-sm">Bio</label>
          <textarea {...register("bio")} className="w-full border p-2 rounded" />
        </div>

        {/* Role-specific UI sections */}
        {role === "citizen" && (
          <div className="p-3 border rounded">
            <h3 className="font-medium mb-2">Citizen details</h3>
            <div>
              <label className="block text-sm">Emergency contact (phone)</label>
              <input {...register("emergencyContact")} className="w-full border p-2 rounded" />
            </div>
          </div>
        )}

        {role === "provider" && (
          <div className="p-3 border rounded space-y-3">
            <h3 className="font-medium">Provider details</h3>
            <div>
              <label className="block text-sm">Clinic / Facility name</label>
              <input {...register("clinicName")} className="w-full border p-2 rounded" />
            </div>
            <div>
              <label className="block text-sm">License / Registration number</label>
              <input {...register("licenseNumber")} className="w-full border p-2 rounded" />
            </div>
            <div>
              <label className="block text-sm">Facility address</label>
              <input {...register("facilityAddress")} className="w-full border p-2 rounded" />
            </div>
            <div>
              <label className="block text-sm">Services (comma separated)</label>
              <input {...register("services")} className="w-full border p-2 rounded" />
            </div>
            <div>
              <label className="block text-sm">Working hours / availability</label>
              <input {...register("workingHours")} className="w-full border p-2 rounded" placeholder="e.g., Mon-Fri 9am-5pm" />
            </div>
          </div>
        )}

        {role === "ngo" && (
          <div className="p-3 border rounded space-y-3">
            <h3 className="font-medium">NGO / Organization details</h3>
            <div>
              <label className="block text-sm">Organization name</label>
              <input {...register("orgName")} className="w-full border p-2 rounded" />
            </div>
            <div>
              <label className="block text-sm">Registration / ID</label>
              <input {...register("registrationId")} className="w-full border p-2 rounded" />
            </div>
            <div>
              <label className="block text-sm">Service areas (comma separated - e.g., Immunization, Counseling)</label>
              <input {...register("serviceAreas")} className="w-full border p-2 rounded" />
            </div>
            <div>
              <label className="block text-sm">Contact person</label>
              <input {...register("contactPerson")} className="w-full border p-2 rounded" />
            </div>
            <div>
              <label className="block text-sm">Website / page (optional)</label>
              <input {...register("website")} className="w-full border p-2 rounded" />
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Save profile</button>
          <button type="button" onClick={() => navigate("/")} className="px-4 py-2 border rounded">Cancel</button>
        </div>
      </form>
    </div>
  );
}
