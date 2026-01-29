// --- src/components/RolePickerDialog.jsx ---
import React, { useState } from "react";

export default function RolePickerDialog({ open, onCancel, onConfirm }) {
  const [role, setRole] = useState("");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-semibold mb-4">Choose your role</h2>

        <div className="space-y-3">
          {/* Use the exact copy you already show on Signup */}
          <label className={`block border rounded-xl p-3 cursor-pointer ${role==='citizen'?'ring-2 ring-blue-500':''}`}>
            <input
              type="radio"
              name="role"
              value="citizen"
              checked={role === "citizen"}
              onChange={(e) => setRole(e.target.value)}
              className="mr-2"
            />
            <span className="font-medium">Citizen</span>
            <p className="text-sm text-gray-600">
              Access public health resources, book appointments, and manage your records.
            </p>
          </label>

          <label className={`block border rounded-xl p-3 cursor-pointer ${role==='provider'?'ring-2 ring-blue-500':''}`}>
            <input
              type="radio"
              name="role"
              value="provider"
              checked={role === "provider"}
              onChange={(e) => setRole(e.target.value)}
              className="mr-2"
            />
            <span className="font-medium">Provider</span>
            <p className="text-sm text-gray-600">
              Offer consultations, manage schedules, and interact with citizens.
            </p>
          </label>

          <label className={`block border rounded-xl p-3 cursor-pointer ${role==='ngo'?'ring-2 ring-blue-500':''}`}>
            <input
              type="radio"
              name="role"
              value="ngo"
              checked={role === "ngo"}
              onChange={(e) => setRole(e.target.value)}
              className="mr-2"
            />
            <span className="font-medium">NGO</span>
            <p className="text-sm text-gray-600">
              Non-profit organisation coordinating community response and resources.
            </p>
          </label>
        </div>

        <div className="mt-6 flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 rounded-xl border">Cancel</button>
          <button
            onClick={() => role && onConfirm(role)}
            disabled={!role}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
