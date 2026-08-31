import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import './index.css';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Hub from './pages/Hub.jsx';
import InvitePage from './pages/InvitePage.jsx';
import GamePage from './pages/GamePage.jsx';
import BuildPage from './pages/BuildPage.jsx';
import { getToken } from './api.js';

function RequireAuth({ children }) {
  if (!getToken()) {
    const returnTo = encodeURIComponent(window.location.pathname);
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
  }
  return children;
}

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },
  { path: '/', element: <RequireAuth><Hub /></RequireAuth> },
  { path: '/invite/:token', element: <RequireAuth><InvitePage /></RequireAuth> },
  { path: '/w/:id/build', element: <RequireAuth><BuildPage /></RequireAuth> },
  { path: '/w/:id', element: <RequireAuth><GamePage /></RequireAuth> },
  { path: '*', element: <Navigate to="/" replace /> },
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
