import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export const ProtectedRoute = () => {
  const { token, loading } = useAuth();

  if (loading) return <div>Loading...</div>;

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};
