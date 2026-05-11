// src/pages/home.jsx
import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { FaCalendarAlt, FaHeartbeat, FaUserAlt, FaUserMd, FaUserShield, FaInfoCircle } from "react-icons/fa";
import { MdReport, MdHealthAndSafety } from "react-icons/md";
import telemedicineImg from "./telemedicine.webp"; 
import { useAuth } from "../hooks/useAuth"; 

const services = [
  { id: 1, icon: <MdReport />, title: "Report Health Issue", path: "/report/new" },
  { id: 2, icon: <FaCalendarAlt />, title: "Upcoming Events", path: "/events" },
  { id: 3, icon: <FaHeartbeat />, title: "Health Support", path: "/support" },
  { id: 4, icon: <MdHealthAndSafety />, title: "Learn How to Stay Healthy", path: "/blogs" },
];

export default function Home() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth(); 

  const handleServiceClick = (servicePath) => {
    if (authLoading) return;

    if (servicePath === "/report/new") {
      if (user) {
        navigate(servicePath);
      } else {
        navigate("/login");
      }
    } else {
      navigate(servicePath);
    }
  };

  return (
    <div className="flex flex-col min-h-screen font-sans bg-gray-50">
      <div className="flex-grow">
        
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-b-3xl shadow-xl flex flex-col md:flex-row items-center justify-between p-6 md:p-12 pt-16 mx-auto w-full max-w-7xl">
          <div className="md:w-1/2 text-center md:text-left mb-8 md:mb-0">
            <h1 className="text-4xl md:text-6xl font-extrabold leading-tight mb-4 drop-shadow-lg">
              Your Health, <br />
              Connected
            </h1>
            <p className="text-lg md:text-xl font-light opacity-90">
              One Hub for All Community Health Services. Report, connect, and learn for a healthier tomorrow.
            </p>
          </div>

          <div className="md:w-1/2 flex justify-center items-center p-4">
            <img
              src={telemedicineImg}
              alt="Community Health Graphic"
              className="rounded-xl shadow-2xl transition-transform transform hover:scale-105 duration-300 ease-in-out w-full max-w-md h-auto"
            />
          </div>
        </div>

        {/* NEW: Interactive Demo Guide for Evaluators */}
        <div className="container mx-auto px-4 mt-12 mb-4 max-w-6xl">
          <div className="bg-white rounded-2xl shadow-lg border border-blue-100 overflow-hidden">
            <div className="bg-blue-50 px-6 py-4 border-b border-blue-100 flex items-center gap-3">
              <FaInfoCircle className="text-blue-600 text-2xl" />
              <h2 className="text-xl md:text-2xl font-bold text-gray-800">How to Experience HealthHub</h2>
            </div>
            <div className="p-6 md:p-8">
              <p className="text-gray-600 mb-8 text-lg">
                This platform features <strong>Role-Based Access Control</strong>. To fully experience the real-time ecosystem, we recommend opening two browser windows (one in Incognito mode) to simulate interactions between different stakeholders.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Role 1: Citizen */}
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 transition-all hover:shadow-md hover:border-purple-300">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="bg-purple-100 p-3 rounded-full text-purple-600">
                      <FaUserAlt className="text-xl" />
                    </div>
                    <h3 className="font-bold text-xl text-gray-800">The Citizen</h3>
                  </div>
                  <p className="text-gray-600 leading-relaxed">
                    Log in as a citizen to report local health hazards, view interactive heatmaps, and request telemedicine appointments.
                  </p>
                </div>

                {/* Role 2: Healthcare Provider */}
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 transition-all hover:shadow-md hover:border-blue-300">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="bg-blue-100 p-3 rounded-full text-blue-600">
                      <FaUserMd className="text-xl" />
                    </div>
                    <h3 className="font-bold text-xl text-gray-800">The Provider or NGO</h3>
                  </div>
                  <p className="text-gray-600 leading-relaxed">
                    Log into a second window as a Provider/NGO. Watch real-time notifications appear from citizens, accept reports, and initiate WebRTC calls.
                  </p>
                </div>

                {/* Role 3: Administrator */}
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 transition-all hover:shadow-md hover:border-red-300">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="bg-red-100 p-3 rounded-full text-red-500">
                      <FaUserShield className="text-xl" />
                    </div>
                    <h3 className="font-bold text-xl text-gray-800">The Admin</h3>
                  </div>
                  <p className="text-gray-600 leading-relaxed">
                    Admins have exclusive access to the global dashboard to monitor system-wide metrics, oversee platform security, and manage providers.
                  </p>
                </div>

              </div>
            </div>
          </div>
        </div>

        {/* Services Section */}
        <div className="container mx-auto px-4 py-12 max-w-7xl">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-800 text-center mb-10">Our Services</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {services.map((service) => (
              <div
                key={service.id}
                className="bg-white rounded-xl shadow-md hover:shadow-xl p-8 text-center transition-all duration-300 transform hover:-translate-y-2 cursor-pointer flex flex-col items-center justify-center space-y-4 border border-gray-100"
                onClick={() => handleServiceClick(service.path)}
              >
                <div className="text-5xl text-blue-600 mb-2">{service.icon}</div>
                <p className="font-semibold text-xl text-gray-800">{service.title}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8 text-center text-sm shadow-inner mt-30">
        <div className="container mx-auto px-4">
          <p className="text-gray-400 text-xl">Built with ❤️ for HackHeritage 3.0 at the Heritage Institute of Technology, Kolkata.</p>
          <div className="flex justify-center space-x-6 mt-4">
            <p className="text-gray-400 text-base">&copy; {new Date().getFullYear()} HealthHub. All rights reserved.</p>
            <span className="text-gray-600">|</span>
            <p className="text-gray-400 text-base hover:text-white transition-colors duration-200">Privacy Policy</p>
            <span className="text-gray-600">|</span>
            <p className="text-gray-400 text-base hover:text-white transition-colors duration-200">Terms of Service</p>
          </div>
        </div>
      </footer>
    </div>
  );
}