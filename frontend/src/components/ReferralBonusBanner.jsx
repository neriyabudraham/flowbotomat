import { useState, useEffect } from 'react';
import { Gift, X, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import api from '../services/api';

export default function ReferralBonusBanner() {
  const { user } = useAuthStore();
  const [show, setShow] = useState(false);
  const [discountPercent, setDiscountPercent] = useState(10);

  useEffect(() => {
    checkShowBanner();
  }, [user]);
  
  const checkShowBanner = async () => {
    // Check if user arrived via referral
    const referralCode = localStorage.getItem('referral_code');
    if (!referralCode) {
      setShow(false);
      return;
    }
    
    // If user is logged in
    if (user) {
      // If user already has subscription or has ever paid - don't show
      if (user.has_ever_paid || user.subscription_plan_id) {
        setShow(false);
        // Clear referral data - not eligible
        localStorage.removeItem('referral_code');
        localStorage.removeItem('referral_discount_percent');
        return;
      }
      
      // Check if user already dismissed banner (stored on server)
      if (user.referral_banner_dismissed) {
        setShow(false);
        return;
      }
    }
    
    // Show banner
    setShow(true);
    const savedDiscount = localStorage.getItem('referral_discount_percent');
    if (savedDiscount) {
      setDiscountPercent(parseInt(savedDiscount) || 10);
    }
  };

  const handleDismiss = async () => {
    setShow(false);
    
    // If logged in, save dismiss on server
    if (user) {
      try {
        await api.post('/user/dismiss-referral-banner');
      } catch (err) {
        console.error('Failed to dismiss banner:', err);
      }
    } else {
      // Not logged in - just use localStorage temporarily
      localStorage.setItem('referral_banner_dismissed_temp', 'true');
    }
  };

  if (!show) return null;

  return (
    <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 text-white">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-white/20 rounded-lg">
              <Gift className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-2 text-sm md:text-base">
              <Sparkles className="w-4 h-4 text-yellow-300" />
              <span>
                <strong>מזל טוב!</strong> הגעת דרך חבר ואתה זכאי ל-{discountPercent}% הנחה על המנוי הראשון!
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link 
              to="/pricing"
              className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 bg-white text-purple-600 rounded-lg text-sm font-bold hover:bg-purple-50 transition-colors"
            >
              לצפייה בתוכניות
            </Link>
            <button
              onClick={handleDismiss}
              className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
