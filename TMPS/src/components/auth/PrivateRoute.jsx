// src/routes/PrivateRoute.jsx
import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import LoadingSpinner from '../common/LoadingSpinner';

const isDev = import.meta?.env?.MODE !== 'production';

const PrivateRoute = ({ children, allowedRoles = [], redirectTo = '/login' }) => {
  const { user, loading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (isDev) {
    console.log('🔍 PrivateRoute - user:', user);
    console.log('🔍 PrivateRoute - loading:', loading);
    console.log('🔍 PrivateRoute - isAuthenticated:', isAuthenticated);
    console.log('🔍 PrivateRoute - allowedRoles:', allowedRoles);
    console.log('🔍 PrivateRoute - current location:', location.pathname);
  }

  // Still determining auth
  if (loading) {
    if (isDev) console.log('🔍 PrivateRoute - showing loading spinner');
    return <LoadingSpinner message="Checking authentication..." />;
  }

  // Not logged in
  if (!isAuthenticated) {
    if (isDev) console.log('🔍 PrivateRoute - not authenticated, redirecting to login');
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  // Role-based access (if specified)
  const role = user?.role ?? '';
  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    if (isDev) console.log('🔍 PrivateRoute - role not allowed, redirecting to role dashboard');
    const dashboardPath = role ? `/${role}/dashboard` : '/';
    return <Navigate to={dashboardPath} replace />;
  }

  if (isDev) console.log('🔍 PrivateRoute - access granted, rendering children/outlet');

  // Support both children and <Outlet /> usage
  return children ?? <Outlet />;
};

export default PrivateRoute;
