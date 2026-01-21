import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import SignupPage from './pages/auth/SignupPage';
import LoginPage from './pages/auth/LoginPage';
import VerifyPage from './pages/auth/VerifyPage';
import DashboardPage from './pages/DashboardPage';
import WhatsappSetupPage from './pages/WhatsappSetupPage';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/verify" element={<VerifyPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/whatsapp" element={<WhatsappSetupPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
