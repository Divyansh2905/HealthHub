// src/App.jsx
import React from "react";
import { Routes, Route, useLocation } from "react-router-dom"; // Import useLocation

// Corrected import paths based on provided source code structure
import Home from "./pages/Home";
import Login from "./pages/Auth/Login";
import Signup from "./pages/Auth/Signup";
import EditProfile from "./pages/Profile/EditProfile";
import ProtectedRoute from './components/ProtectedRoute';
import Header from "./components/Header";
import CreateReport from "./pages/Report/CreateReport";
import MapView from "./pages/Map/MapView";
import ListReports from "./pages/Reports/ListReports";
import { ToastProvider } from "./components/ToastProvider";
import ReportDetail from "./pages/Reports/ReportDetail";
import { UsersProvider } from "./hooks/useUsers";
import ResourceHub from "./pages/ResourceHub/ResourceHub";
import ProviderDetail from "./pages/ResourceHub/ProviderDetail";
import MyReferrals from "./pages/Referrals/MyReferrals";
import BookConsult from "./pages/Consultation/BookConsult";
import ConsultDetail from "./pages/Consultation/ConsultDetail"; // CORRECTED: Changed from ConsultationDetail to ConsultDetail
import VideoCall from "./pages/Consultation/VideoCall";
import ProviderConsultations from "./pages/Consultation/ProviderConsultations";
import AdminDashboard from "./pages/Admin/Dashboard";
import StayHealthy from "./pages/Blog/StayHealthy";
import HealthSupport from "./pages/Support/HealthSupport";
import ManageEvents from "./pages/Events/ManageEvents";

export default function App(){
  const location = useLocation(); // Get current location
  const isHomePage = location.pathname === '/'; // Check if it's the home page

  return (
    <ToastProvider>
      <UsersProvider> {/* Wrap routes with UsersProvider for user context */}
        <div className="min-h-screen bg-slate-50 text-slate-800">
          <Header />
          {/*
            Conditionally apply styling to the main content area.
            For the home page, remove max-width and padding to allow it to be full-width.
            For other pages, keep the existing centered, padded layout.
          */}
          <main className={isHomePage ? "flex-grow" : "max-w-5xl mx-auto p-4 flex-grow"}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              {/* Protected Routes - only accessible when logged in */}
              <Route path="/profile/edit" element={<ProtectedRoute><EditProfile /></ProtectedRoute>} />
              <Route path="/report/new" element={<ProtectedRoute><CreateReport /></ProtectedRoute>} />
              {/* NEW: Protected route for MyReferrals */}
              <Route path="/my-referrals" element={<ProtectedRoute><MyReferrals /></ProtectedRoute>} />
              {/* Protected Reports pages — public users should not access the full list/detail */}
              <Route
                path="/reports"
                element={
                  // if unauthenticated, send to /map (public map remains)
                  <ProtectedRoute redirectTo="/map">
                    <ListReports />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reports/:id"
                element={
                  // detail is protected (citizen can open their own report; providers/admins can view all)
                  <ProtectedRoute redirectTo="/map">
                    <ReportDetail />
                  </ProtectedRoute>
                }
              />
              <Route path="/map" element={<MapView />} />
              <Route path="/providers" element={<ResourceHub />} />
              <Route path="/provider/:id" element={<ProviderDetail />} />
              <Route path="/consultations/new" element={<BookConsult />} />
              <Route path="/consultations/provider" element={<ProviderConsultations />} />
              <Route path="/consultations/:id" element={<ConsultDetail />} />
              <Route path="/consultations/:id/video" element={<VideoCall />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/blogs" element={<StayHealthy />} />
              <Route path="/support" element={<HealthSupport />} />
              <Route path="/events" element={<ManageEvents />} />


              {/* You might have other protected admin routes */}
              {/* <Route path="/admin" element={<ProtectedRoute requiresAdmin><AdminDashboard /></ProtectedRoute>} /> */}
            </Routes>
          </main>
        </div>
      </UsersProvider> {/* UsersProvider closing tag */}
    </ToastProvider>
  );
}
