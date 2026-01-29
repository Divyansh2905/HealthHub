// src/components/AlertDialog.jsx
import React from 'react';

// A simple, reusable alert dialog component
export default function AlertDialog({ title, message, isOpen, onConfirm, onCancel, onClose, showConfirmButton = false, showCancelButton = false }) {
  if (!isOpen) return null; // Don't render if not open

  const handleClose = () => {
    onClose?.(); // Call onClose prop if provided
    onCancel?.(); // Also call onCancel if it's there and no explicit onClose is meant
  };

  const handleConfirm = () => {
    onConfirm?.(); // Call onConfirm prop if provided
    onClose?.(); // Close dialog after confirming
  };

  return (
    // Overlay for dimming background and preventing interaction
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full mx-4">
        {/* Dialog Title */}
        <h3 className="text-xl font-semibold text-gray-900 mb-4">
          {title || "Notification"}
        </h3>

        {/* Dialog Message */}
        <p className="text-sm text-gray-700 mb-6">
          {message}
        </p>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3">
          {showCancelButton && (
            <button
              onClick={handleClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50"
            >
              Cancel
            </button>
          )}
          {showConfirmButton ? (
            <button
              onClick={handleConfirm}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
            >
              Confirm
            </button>
          ) : (
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
            >
              Okay
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
