import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import SignupPage from './pages/auth/SignupPage';
import LoginPage from './pages/auth/LoginPage';
import VerifyPage from './pages/auth/VerifyPage';
import DashboardPage from './pages/DashboardPage';
import WhatsappSetupPage from './pages/WhatsappSetupPage';
import ContactsPage from './pages/ContactsPage';
import SettingsPage from './pages/SettingsPage';
import BotsPage from './pages/BotsPage';
import BotEditorPage from './pages/BotEditorPage';
import TemplatesPage from './pages/TemplatesPage';
import AdminPage from './pages/AdminPage';
import NotificationsPage from './pages/NotificationsPage';
import ClientBotsPage from './pages/ClientBotsPage';
import PricingPage from './pages/PricingPage';
import CheckoutPage from './pages/CheckoutPage';
import PrivacyPage from './pages/PrivacyPage';
import useThemeStore from './store/themeStore';

function App() {
  const { initTheme } = useThemeStore();
  
  useEffect(() => {
    initTheme();
  }, [initTheme]);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 transition-colors">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/verify" element={<VerifyPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/whatsapp" element={<WhatsappSetupPage />} />
          <Route path="/contacts" element={<ContactsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/bots" element={<BotsPage />} />
          <Route path="/bots/:botId" element={<BotEditorPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/clients/:clientId/bots" element={<ClientBotsPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
