// src/pages/home.jsx
import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { FaCalendarAlt, FaHeartbeat } from "react-icons/fa";
import { MdReport, MdHealthAndSafety } from "react-icons/md";
import telemedicineImg from "./telemedicine.webp"; // Assumes telemedicine.webp is in src/pages/
import { useAuth } from "../hooks/useAuth"; // Assumes useAuth.js is in src/hooks/


// Data for services - directly integrated
const services = [
  // This path is correct for creating a new report
  { id: 1, icon: <MdReport />, title: "Report Health Issue", path: "/report/new" },
  { id: 2, icon: <FaCalendarAlt />, title: "Upcoming Events", path: "/events" },
  { id: 3, icon: <FaHeartbeat />, title: "Health Support", path: "/support" },
  { id: 4, icon: <MdHealthAndSafety />, title: "Learn How to Stay Healthy", path: "/blogs" },
];

export default function Home() {
  const navigate = useNavigate();
  // Get user and loading state from the authentication hook
  const { user, loading: authLoading } = useAuth(); 

  // Function to handle service card clicks with an authentication check
  const handleServiceClick = (servicePath) => {
    // If authentication state is still being determined, do nothing
    if (authLoading) return;

    // Special handling for the "Report Health Issue" service
    if (servicePath === "/report/new") {
      if (user) {
        // Log the navigation path for debugging
        console.log("Logged-in user: Navigating to", servicePath);
        navigate(servicePath);
      } else {
        // Log the navigation path for debugging
        console.log("Non-logged-in user: Navigating to /login");
        navigate("/login");
      }
    } else {
      // For all other services, navigate directly as planned
      console.log("Navigating to non-report path:", servicePath);
      navigate(servicePath);
    }
  };

  return (
    <div className="flex flex-col min-h-screen font-sans bg-gray-50">
      {/* Main content area */}
      <div className="flex-grow">
        {/* Hero Section */}
        {/* Added mt-16 to create space from the header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-b-3xl shadow-xl flex flex-col md:flex-row items-center justify-between p-6 md:p-12 pt-16 mx-auto w-full max-w-7xl">
          {/* Text Section */}
          <div className="md:w-1/2 text-center md:text-left mb-8 md:mb-0">
            <h1 className="text-4xl md:text-6xl font-extrabold leading-tight mb-4 drop-shadow-lg">
              Your Health, <br />
              Connected
            </h1>
            <p className="text-lg md:text-xl font-light opacity-90">
              One Hub for All Community Health Services. Report, connect, and learn for a healthier tomorrow.
            </p>
          </div>

          {/* Image/Graphic Section - Replaced Map */}
          <div className="md:w-1/2 flex justify-center items-center p-4">
            {/* Replace this placeholder with your actual health community graphic */}
            <img
              src={telemedicineImg}
              alt="Community Health Graphic"
              className="rounded-xl shadow-2xl transition-transform transform hover:scale-105 duration-300 ease-in-out w-full max-w-md h-auto"
            />
          </div>
        </div>

        {/* Services Section */}
        <div className="container mx-auto px-4 py-8">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-800 text-center mb-8">Our Services</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {services.map((service) => (
              <div
                key={service.id}
                className="bg-white rounded-xl shadow-lg p-6 text-center transition-transform transform hover:scale-105 hover:shadow-xl cursor-pointer flex flex-col items-center justify-center space-y-3 border border-gray-100"
                // Call the new handleServiceClick function on click
                onClick={() => handleServiceClick(service.path)}
              >
                <div className="text-5xl text-blue-600 mb-2">{service.icon}</div>
                <p className="font-semibold text-lg text-gray-800">{service.title}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer (Optional) */}
      <footer className="bg-gray-900 text-white py-6 text-center text-sm mt-12 shadow-inner">
        <div className="container mx-auto px-4">
          <p>&copy; {new Date().getFullYear()} Health Hub. All rights reserved.</p>
          <div className="flex justify-center space-x-4 mt-3">
            <Link to="/privacy" className="text-gray-300 hover:text-blue-300 transition-colors duration-200">Privacy Policy</Link>
            <span className="text-gray-500">|</span>
            <Link to="/terms" className="text-gray-300 hover:text-blue-300 transition-colors duration-200">Terms of Service</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
