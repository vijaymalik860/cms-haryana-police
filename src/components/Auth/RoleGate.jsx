import React from 'react';
import { useAuth } from '../../hooks/useAuth';

export const RoleGate = ({ allowedRoles = [], children, fallback = null }) => {
  const { profile, loading } = useAuth();

  if (loading) return null;

  if (!profile || !allowedRoles.includes(profile.role)) {
    return fallback;
  }

  return <>{children}</>;
};
