import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom';
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
import ApiPage from './pages/ApiPage';
import AffiliateTermsPage from './pages/AffiliateTermsPage';
import useThemeStore from './store/themeStore';
import api from './services/api';

// Track referral code and persist in session
function ReferralTracker() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  
  useEffect(() => {
    const refCode = searchParams.get('ref');
    
    if (refCode) {
      // Check if we already tracked this ref code recently (prevent double tracking)
      const lastTrackedRef = sessionStorage.getItem('last_tracked_ref');
      const lastTrackedTime = sessionStorage.getItem('last_tracked_time');
      const now = Date.now();
      
      // Only track if different ref or more than 5 minutes passed
      const shouldTrack = lastTrackedRef !== refCode || 
        !lastTrackedTime || 
        (now - parseInt(lastTrackedTime)) > 5 * 60 * 1000;
      
      // Save to localStorage for persistence across pages
      localStorage.setItem('referral_code', refCode);
      localStorage.setItem('referral_landing', location.pathname);
      localStorage.setItem('referral_timestamp', now.toString());
      
      if (shouldTrack) {
        // Mark as tracked
        sessionStorage.setItem('last_tracked_ref', refCode);
        sessionStorage.setItem('last_tracked_time', now.toString());
        
        // Track click on server
        api.post('/payment/affiliate/track-click', {
          ref_code: refCode,
          landing_page: location.pathname,
          referrer_url: document.referrer
        }).catch(err => console.log('Referral tracking failed:', err));
      }
    }
  }, [searchParams, location.pathname]);
  
  return null;
}

function App() {
  const { initTheme } = useThemeStore();
  
  useEffect(() => {
    initTheme();
  }, [initTheme]);

  return (
    <BrowserRouter>
      <ReferralTracker />
      <div className="min-h-screen bg-gray-50 transition-colors">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/affiliate-terms" element={<AffiliateTermsPage />} />
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
          <Route path="/developers" element={<ApiPage />} />
          <Route path="/clients/:clientId/bots" element={<ClientBotsPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
