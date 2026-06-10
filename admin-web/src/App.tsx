import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Visits from './pages/Visits';
import VisitDetail from './pages/VisitDetail';
import Manage from './pages/Manage';

function PrivateRoutes() {
  const { session, role, ready } = useAuth();

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-gray-400">იტვირთება...</div>
      </div>
    );
  }

  if (!session || role !== 'admin') {
    return <Navigate to="/login" replace />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="visits" element={<Visits />} />
        <Route path="visits/:id" element={<VisitDetail />} />
        <Route path="manage" element={<Manage />} />
      </Route>
    </Routes>
  );
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { session, role, ready } = useAuth();
  if (!ready) return null;
  if (session && role === 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />
          <Route path="/*" element={<PrivateRoutes />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
