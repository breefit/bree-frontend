import { Navigate } from 'react-router-dom';
import { useAdminAuth } from '@/context/AdminAuthContext';

/**
 * ProtectedAdminRoute
 * 
 * Guards admin routes using an httpOnly admin auth cookie.
 * Verifies the session with GET /api/admin/me before allowing access.
 */

const ProtectedAdminRoute = ({ children }) => {
  const { admin, loading, error, verifyAdmin } = useAdminAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-bree-text-secondary">Verifying admin session…</p>
      </div>
    );
  }

  // The session check failed for a non-auth reason (network / 5xx). Only a
  // 401/404 means "signed out", so offer a retry instead of redirecting.
  if (!admin && error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-bree-text-secondary">
          Couldn't verify your admin session. Check your connection and try again.
        </p>
        <button
          onClick={verifyAdmin}
          className="px-4 py-2 rounded-xl text-sm font-medium bg-bree-primary text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!admin) {
    return <Navigate to="/admin/login" replace />;
  }

  return children;
};

export default ProtectedAdminRoute;