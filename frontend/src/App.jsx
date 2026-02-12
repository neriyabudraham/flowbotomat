import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import SignupPage from './pages/auth/SignupPage';
import LoginPage from './pages/auth/LoginPage';
import AuthCallbackPage from './pages/auth/AuthCallbackPage';
import VerifyPage from './pages/auth/VerifyPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
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
import GroupForwardsPage from './pages/GroupForwardsPage';
import BroadcastsPage from './pages/BroadcastsPage';
import ServicesPage from './pages/ServicesPage';
import StatusBotLandingPage from './pages/statusBot/StatusBotLandingPage';
import StatusBotDashboardPage from './pages/statusBot/StatusBotDashboardPage';
import StatusBotSubscribePage from './pages/statusBot/StatusBotSubscribePage';
import SystemAlertOverlay from './components/notifications/SystemAlertOverlay';
import SocketProvider from './components/providers/SocketProvider';
import useThemeStore from './store/themeStore';
import api from './services/api';

// Track referral code and persist in session
function ReferralTracker() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  
  useEffect(() => {
    const refCode = searchParams.get('ref');
    
    console.log('[ReferralTracker] URL ref code:', refCode, 'Current path:', location.pathname);
    
    if (refCode) {
      // Note: We now save referral code even if user has a token
      // The signup process will validate if the email is actually new
      // This fixes the issue where deleted users couldn't use referral links
      
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
      
      console.log('[ReferralTracker] Saved referral to localStorage:', {
        referral_code: refCode,
        referral_landing: location.pathname,
        referral_timestamp: now
      });
      
      if (shouldTrack) {
        // Mark as tracked
        sessionStorage.setItem('last_tracked_ref', refCode);
        sessionStorage.setItem('last_tracked_time', now.toString());
        
        console.log('[ReferralTracker] Calling track-click API...');
        
        // Track click on server and get discount info
        api.post('/payment/affiliate/track-click', {
          ref_code: refCode,
          landing_page: location.pathname,
          referrer_url: document.referrer
        }).then(res => {
          console.log('[ReferralTracker] Track-click response:', res.data);
          
          // Store the discount percentage from server
          if (res.data?.discount_percent) {
            localStorage.setItem('referral_discount_percent', res.data.discount_percent.toString());
          }
          // Store discount type and months
          if (res.data?.discount_type) {
            localStorage.setItem('referral_discount_type', res.data.discount_type);
          }
          if (res.data?.discount_months) {
            localStorage.setItem('referral_discount_months', res.data.discount_months.toString());
          }
          // Set expiry time based on server settings
          const expiryMinutes = res.data?.expiry_minutes || 60;
          const expiryTime = Date.now() + (expiryMinutes * 60 * 1000);
          localStorage.setItem('referral_expiry', expiryTime.toString());
          
          console.log('[ReferralTracker] Stored discount:', res.data?.discount_percent, 'Type:', res.data?.discount_type, 'Months:', res.data?.discount_months, 'Expiry minutes:', expiryMinutes);
        }).catch(err => {
          console.error('[ReferralTracker] Track-click failed:', err);
          // Even if API fails, set a default expiry
          if (!localStorage.getItem('referral_expiry')) {
            const expiryTime = Date.now() + (60 * 60 * 1000); // 60 minutes default
            localStorage.setItem('referral_expiry', expiryTime.toString());
          }
        });
      } else {
        console.log('[ReferralTracker] Skipping track - already tracked recently');
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
      <SocketProvider>
        <ReferralTracker />
        <SystemAlertOverlay />
        <div className="min-h-screen bg-gray-50 transition-colors">
          <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/affiliate-terms" element={<AffiliateTermsPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/verify" element={<VerifyPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/whatsapp" element={<WhatsappSetupPage />} />
          <Route path="/contacts" element={<ContactsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/bots" element={<BotsPage />} />
          <Route path="/bots/:botId" element={<BotEditorPage />} />
          <Route path="/group-forwards" element={<GroupForwardsPage />} />
          <Route path="/broadcasts" element={<BroadcastsPage />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/status-bot" element={<StatusBotLandingPage />} />
          <Route path="/status-bot/dashboard" element={<StatusBotDashboardPage />} />
          <Route path="/status-bot/subscribe" element={<StatusBotSubscribePage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/developers" element={<ApiPage />} />
          <Route path="/clients/:clientId/bots" element={<ClientBotsPage />} />
          </Routes>
        </div>
      </SocketProvider>
    </BrowserRouter>
  );
}

export default App;
