// src/pages/DashboardRoutes.js

import React from 'react';
import { Route, Routes } from 'react-router-dom';
import Dashboard from './Dashboard/dashboardd'; // Importing Dashboard layout

const DashboardRoutes = () => {
  return (
    <Dashboard>
      <Routes>
        
        {/* Default Route */}
        <Route path="/dashboard" exact>
          <h1>Welcome to the Dashboard</h1>
          <p>Select a section from the sidebar to get started.</p>
        </Route>
      </Routes>
    </Dashboard>
  );
};

export default DashboardRoutes;
