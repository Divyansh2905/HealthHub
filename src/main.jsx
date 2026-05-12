import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import "leaflet/dist/leaflet.css"; // important for map styling
import "./components/Map/leafletSetup";
import { AuthProvider } from "./hooks/useAuth";
import { UsersProvider } from "./hooks/useUsers";

createRoot(document.getElementById("root")).render(
  // <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        {/* Wrap App with UsersProvider to make user data available globally */}
        <UsersProvider>
          <App />
        </UsersProvider>
      </AuthProvider>
    </BrowserRouter>
  // </React.StrictMode>
);

console.log("Firebase initialized");

