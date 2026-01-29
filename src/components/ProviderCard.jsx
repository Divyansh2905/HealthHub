// src/components/ProviderCard.jsx
import React from "react";
import { Link } from "react-router-dom";

/**
 * ProviderCard props:
 * - provider: profile object (from users collection)
 */
export default function ProviderCard({ provider }) {
  if (!provider) return null;
  const name = provider.displayName || provider.orgName || provider.email || "Unknown";
  const services = (provider.services || []).join(" • "); // Use a bullet for better visual separation
  const rating = provider.ratings?.avg || null;

  return (
    // Wrap the entire card content with a Link component
    <Link 
      to={`/provider/${provider.uid}`} 
      className="block w-full text-inherit no-underline" // Ensure the link takes up full block and doesn't change text color
    >
      <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col sm:flex-row items-start gap-4 shadow-sm hover:shadow-md transition-shadow duration-200 cursor-pointer">
        {/* Profile Image/Initial */}
        <div className="flex-shrink-0 w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center overflow-hidden border border-blue-200">
          {provider.photoURL ? (
            <img src={provider.photoURL} alt={name} className="w-full h-full object-cover" />
          ) : (
            <div className="text-xl text-blue-600 font-semibold">
              {name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 w-full">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div>
              <div className="font-semibold text-lg text-gray-900">{name}</div>
              <div className="text-sm text-gray-600">
                {provider.orgName || provider.title || (provider.role === 'provider' ? 'Health Provider' : 'Organization')}
              </div>
            </div>

            <div className="flex flex-col items-start sm:items-end gap-1 mt-2 sm:mt-0">
              {provider.verified && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                  Verified
                </span>
              )}
              {rating && <div className="text-sm text-gray-700">{rating.toFixed(1)} ★</div>}
            </div>
          </div>

          <div className="text-sm text-gray-700 mt-2 line-clamp-2">
            {services || provider.bio || "No services or description listed."}
          </div>

          <div className="mt-3 flex items-center gap-3">
            {/* The entire card is now clickable, so no explicit "View" button needed */}
            {provider.website && (
              <a
                href={provider.website}
                target="_blank"
                rel="noreferrer"
                // Prevent link from triggering parent Link
                onClick={(e) => e.stopPropagation()} 
                className="text-blue-600 hover:underline text-sm font-medium"
              >
                Website
              </a>
            )}
            {!provider.website && (
              <span className="text-gray-400 text-sm">No website</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
