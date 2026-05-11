// src/components/Header.jsx
import React, { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import AlertDialog from "./AlertDialog";
import NotificationsBell from "./NotificationsBell";
import { FaPlus } from "react-icons/fa";

export default function Header() {
  const { user, profile, logout } = useAuth();
  const navigate = useNavigate();

  // State for custom alert dialog
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");

  // State for mobile menu
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (err) {
      console.error("Logout failed:", err);
      showAlert("Logout Error", "Logout failed. Please try again.");
    }
  };

  // Permissions
  const canManageReferrals =
    profile && (profile.role === "provider" || profile.role === "ngo");
  const canManageConsultations =
    profile && (profile.role === "provider" || profile.role === "ngo");

  const notCitizen = 
    profile && (profile.role === "provider" || profile.role === "ngo" || profile.role === "admin");

  // Manage dropdown
  const [manageOpen, setManageOpen] = useState(false);
  const manageDropdownRef = useRef(null);

  const [language, setLanguage] = useState(
    localStorage.getItem("language") || "en"
  );

  const [profileOpen, setProfileOpen] = useState(false);
  const profileDropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      // Manage dropdown
      if (
        manageDropdownRef.current &&
        !manageDropdownRef.current.contains(event.target)
      ) {
        setManageOpen(false);
      }

      // Profile dropdown
      if (
        profileDropdownRef.current &&
        !profileDropdownRef.current.contains(event.target)
      ) {
        setProfileOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    // Prevent multiple script injections
    if (window.googleTranslateScriptLoaded) return;

    window.googleTranslateScriptLoaded = true;

    window.googleTranslateElementInit = () => {
      if (!window.google?.translate) return;

      new window.google.translate.TranslateElement(
        {
          pageLanguage: "en",
          includedLanguages: "en,hi",
          autoDisplay: false,
        },
        "google_translate_element"
      );
    };

    const script = document.createElement("script");
    script.src =
      "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    script.async = true;

    document.body.appendChild(script);
  }, []);

  const handleNavLinkClick = () => {
    setIsMobileMenuOpen(false);
  };

  const changeLanguage = (lang) => {
    setLanguage(lang);

    localStorage.setItem("language", lang);

    setTimeout(() => {
      const select = document.querySelector(".goog-te-combo");

      if (!select) {
        console.error("Google Translate dropdown not found");
        return;
      }

      select.value = lang;
      select.dispatchEvent(new Event("change"));
    }, 100);
  };

  return (
    <header className="bg-white shadow-md sticky top-0 z-10 font-[Arial]">
      <div className="w-full px-4 md:px-[3rem] py-4 flex items-center justify-between">
        {/* Left: Logo */}
        <div className="flex-shrink-0">
          <Link
            to="/"
            className="flex items-center gap-2 text-2xl font-bold tracking-tight text-blue-700"
          >
            <img
              src="/healthhub_icon.svg"
              alt="HealthHub"
              className="h-8 w-8"
            />
            HealthHub
          </Link>
        </div>

        {/* Right: Desktop Nav + Mobile Toggle */}
        <div className="flex items-center gap-4 ml-auto">
          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 text-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle navigation"
          >
            {isMobileMenuOpen ? (
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : (
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            )}
          </button>

          {/* Desktop navigation */}
          <nav className="hidden md:flex items-center gap-4 text-base">
            <Link to="/" className="text-gray-700 font-medium hover:text-blue-600 transition-colors duration-200">
              Home
            </Link>
            {user && notCitizen && (
              <Link to="/reports" className="text-gray-700 font-medium hover:text-blue-600 transition-colors duration-200">
                Reports
              </Link>
            )}
            <Link to="/map" className="text-gray-700 font-medium hover:text-blue-600 transition-colors duration-200">
              Map
            </Link>
            <Link to="/providers" className="text-gray-700 font-medium hover:text-blue-600 transition-colors duration-200">
              Providers
            </Link>
            <Link to="/events" className="text-gray-700 font-medium hover:text-blue-600 transition-colors duration-200">
              Events
            </Link>
            <Link to="/blogs" className="text-gray-700 font-medium hover:text-blue-600 transition-colors duration-200">
              Learn
            </Link>
            <Link to="/support" className="text-gray-700 font-medium hover:text-blue-600 transition-colors duration-200">
              Support
            </Link>

            {/* Non-logged-in */}
            {!user && (
              <>
                <Link
                  to="/login"
                  className="px-3 py-1 border border-blue-600 text-blue-600 rounded-md hover:bg-blue-50"
                >
                  Login
                </Link>
                <Link
                  to="/signup"
                  className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Sign up
                </Link>
              </>
            )}

              {/* Hidden Google Translate Element */}
              <div
                id="google_translate_element"
                style={{
                  position: "absolute",
                  left: "-9999px",
                  top: "-9999px",
                }}
              ></div>

              <div className="notranslate flex items-center bg-gray-100 rounded-full p-1">
                <button
                  onClick={() => changeLanguage("en")}
                  className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 ${
                    language === "en"
                      ? "bg-white shadow-sm text-blue-600"
                      : "text-gray-600 hover:text-blue-600"
                  }`}
                >
                  EN
                </button>

                <button
                  onClick={() => changeLanguage("hi")}
                  className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 ${
                    language === "hi"
                      ? "bg-white shadow-sm text-blue-600"
                      : "text-gray-600 hover:text-blue-600"
                  }`}
                >
                  हिं
                </button>
              </div>

            {/* Logged-in */}
            {user && (
              <div className="flex items-center gap-3">
                <div className="text-slate-700 text-sm">
                  <div className="font-semibold">
                    {profile?.displayName || user.email}
                  </div>
                  <div className="text-xs text-gray-500">
                    {(profile && profile.role) || "Citizen"}
                  </div>
                </div>

                <Link
                  to="/report/new"
                  className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  New Report
                </Link>

                {(canManageReferrals || canManageConsultations) && (
                  <div className="relative" ref={manageDropdownRef}>
                    <button
                      type="button"
                      className="flex items-center gap-1 px-3 py-1 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none"
                      onClick={() => setManageOpen((open) => !open)}
                    >
                      Manage
                      <svg
                        className="w-4 h-4 ml-1"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {manageOpen && (
                      <div className="absolute right-0 mt-2 w-44 bg-white border border-gray-200 rounded-md shadow-lg z-20">
                        <div className="flex flex-col py-2">
                          {canManageReferrals && (
                            <Link
                              to="/my-referrals"
                              className="px-4 py-2 hover:bg-purple-50 text-purple-700"
                              onClick={() => setManageOpen(false)}
                            >
                              My Referrals
                            </Link>
                          )}
                          {canManageConsultations && (
                            <Link
                              to="/consultations/provider"
                              className="px-4 py-2 hover:bg-purple-50 text-purple-700"
                              onClick={() => setManageOpen(false)}
                            >
                              My Consultations
                            </Link>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <NotificationsBell />

                <div className="relative" ref={profileDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setProfileOpen((open) => !open)}
                    className="flex items-center gap-2 px-3 py-1 border border-gray-300 rounded-full bg-white hover:bg-gray-50"
                  >
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">
                      {(profile?.displayName || user.email || "U")
                        .charAt(0)
                        .toUpperCase()}
                    </div>

                    <svg
                      className="w-4 h-4 text-gray-600"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>

                  {profileOpen && (
                    <div className="absolute right-0 mt-2 w-52 bg-white border border-gray-200 rounded-xl shadow-lg z-30 overflow-hidden">
                      
                      {/* User Info */}
                      <div className="px-4 py-3 border-b border-gray-100">
                        <div className="font-semibold text-sm text-gray-800">
                          {profile?.displayName || user.email}
                        </div>

                        <div className="text-xs text-gray-500 mt-1">
                          {(profile && profile.role) || "Citizen"}
                        </div>
                      </div>

                      {/* Profile */}
                      <Link
                        to="/profile/edit"
                        onClick={() => setProfileOpen(false)}
                        className="block px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        Profile
                      </Link>

                      {/* My Reports (for Citizens only) */}
                      {profile?.role === "citizen" && (
                        <Link
                          to="/reports"
                          onClick={() => setProfileOpen(false)}
                          className="block px-4 py-3 text-sm text-fuchsia-800 hover:bg-gray-50"
                        >
                          My Reports
                        </Link>
                      )}

                      {/* Admin */}
                      {profile?.role === "admin" && (
                        <Link
                          to="/admin"
                          onClick={() => setProfileOpen(false)}
                          className="block px-4 py-3 text-sm text-purple-700 hover:bg-purple-50"
                        >
                          Admin Dashboard
                        </Link>
                      )}

                      {/* Logout */}
                      <button
                        onClick={() => {
                          setProfileOpen(false);
                          handleLogout();
                        }}
                        className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50"
                      >
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </nav>
        </div>
      </div>

      {/* Mobile dropdown (unchanged except extra routes) */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-white shadow-lg pb-4 pt-2">
          <nav className="flex flex-col items-center gap-3">
            <Link to="/" onClick={handleNavLinkClick}>Home</Link>
            {user && <Link to="/reports" onClick={handleNavLinkClick}>Reports</Link>}
            <Link to="/map" onClick={handleNavLinkClick}>Map</Link>
            <Link to="/providers" onClick={handleNavLinkClick}>Providers</Link>
            <Link to="/events" onClick={handleNavLinkClick}>Events</Link>
            <Link to="/blogs" onClick={handleNavLinkClick}>Learn</Link>
            <Link to="/support" onClick={handleNavLinkClick}>Support</Link>

            {!user && (
              <>
                <Link to="/login" onClick={handleNavLinkClick}>Login</Link>
                <Link to="/signup" onClick={handleNavLinkClick}>Sign up</Link>
              </>
            )}

            {user && (
              <div className="flex flex-col items-center gap-3 w-full">
                <div className="text-base text-slate-700 mt-2 text-center">
                  <div className="font-semibold">
                    {profile?.displayName || user.email}
                  </div>
                  <div className="text-xs text-gray-500">
                    {(profile && profile.role) || "Citizen"}
                  </div>
                </div>

                <Link to="/report/new" onClick={handleNavLinkClick}>
                  New Report
                </Link>

                {(canManageReferrals || canManageConsultations) && (
                  <div className="flex flex-col w-3/4 items-center">
                    <button
                      type="button"
                      className="flex items-center justify-center gap-1 px-3 py-1 bg-purple-600 text-white rounded-md hover:bg-purple-700 w-full"
                      onClick={() => setManageOpen((open) => !open)}
                    >
                      Manage
                      <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                      </svg>
                    </button>
                    {manageOpen && (
                      <div className="mt-2 w-full bg-white border border-gray-200 rounded-md shadow-lg z-20">
                        <div className="flex flex-col py-1">
                          {canManageReferrals && (
                            <Link to="/my-referrals" onClick={handleNavLinkClick}>
                              My Referrals
                            </Link>
                          )}
                          {canManageConsultations && (
                            <Link to="/consultations/provider" onClick={handleNavLinkClick}>
                              My Consultations
                            </Link>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <NotificationsBell mobile={true} />

                <Link to="/profile/edit" onClick={handleNavLinkClick}>
                  Profile
                </Link>
                {profile?.role === "admin" && (
                  <Link to="/admin" onClick={handleNavLinkClick}>Admin</Link>
                )}
                <button
                  onClick={() => {
                    handleLogout();
                    handleNavLinkClick();
                  }}
                >
                  Logout
                </button>
              </div>
            )}
          </nav>
        </div>
      )}

      {/* Custom Alert Dialog */}
      <AlertDialog
        title={alertTitle}
        message={alertMessage}
        isOpen={isAlertOpen}
        onClose={closeAlert}
      />
      
        <style>
          {`
            .goog-te-banner-frame.skiptranslate {
              display: none !important;
            }

            body {
              top: 0px !important;
            }

            .goog-logo-link {
              display: none !important;
            }

            .goog-te-gadget {
              color: transparent !important;
              font-size: 0 !important;
            }

            iframe.goog-te-banner-frame {
              display: none !important;
            }

            .skiptranslate {
              display: none !important;
            }
            
            .notranslate {
              translate: no;
            }

            .goog-text-highlight {
              background-color: transparent !important;
              box-shadow: none !important;
            }

            font {
              background-color: transparent !important;
              box-shadow: none !important;
            }

            .goog-te-spinner-pos,
            .goog-te-balloon-frame,
            #goog-gt-tt,
            .goog-tooltip,
            .goog-tooltip:hover {
              display: none !important;
            }

            .VIpgJd-ZVi9od-aZ2wEe-wOHMyf {
              display: none !important;
            }

          `}
        </style>
    </header>
  );
}
