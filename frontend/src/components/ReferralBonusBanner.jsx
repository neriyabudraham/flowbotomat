import { useState, useEffect } from 'react';
import { Gift, X, Sparkles, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import api from '../services/api';

export default function ReferralBonusBanner() {
  const { user } = useAuthStore();
  const [show, setShow] = useState(false);
  const [discountPercent, setDiscountPercent] = useState(10);
  const [timeLeft, setTimeLeft] = useState(0);

  // Format time as MM:SS or HH:MM:SS
  const formatTime = (seconds) => {
    if (seconds <= 0) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    checkShowBanner();
  }, [user]);

  // Countdown timer
  useEffect(() => {
    if (timeLeft <= 0 || !show) return;
    
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Expired
          setShow(false);
          localStorage.removeItem('referral_code');
          localStorage.removeItem('referral_discount_percent');
          localStorage.removeItem('referral_expiry');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [timeLeft, show]);
  
  const checkShowBanner = async () => {
    // Check if user arrived via referral
    const referralCode = localStorage.getItem('referral_code');
    if (!referralCode) {
      setShow(false);
      return;
    }

    // Check expiry time - if not set, it will be set when trackClick API responds
    let referralExpiry = localStorage.getItem('referral_expiry');
    if (!referralExpiry) {
      // Default: set expiry to 60 minutes from now if not set by API
      const expiryTime = Date.now() + (60 * 60 * 1000);
      localStorage.setItem('referral_expiry', expiryTime.toString());
      referralExpiry = expiryTime.toString();
    }
    
    const expiryTime = parseInt(referralExpiry);
    const now = Date.now();
    
    if (now >= expiryTime) {
      // Expired
      setShow(false);
      localStorage.removeItem('referral_code');
      localStorage.removeItem('referral_discount_percent');
      localStorage.removeItem('referral_expiry');
      return;
    }
    
    // If user is logged in
    if (user) {
      // If user already has paid subscription or has ever paid - don't show
      // (Free plan doesn't count as "has subscription")
      const hasPaidPlan = user.subscription_plan && user.subscription_plan !== 'Free';
      if (user.has_ever_paid || hasPaidPlan) {
        setShow(false);
        localStorage.removeItem('referral_code');
        localStorage.removeItem('referral_discount_percent');
        localStorage.removeItem('referral_expiry');
        return;
      }
      
      // Check if user already dismissed banner (stored on server)
      if (user.referral_banner_dismissed) {
        setShow(false);
        return;
      }
    }
    
    // Show banner with timer
    setShow(true);
    setTimeLeft(Math.floor((expiryTime - now) / 1000));
    
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
                <strong>מזל טוב!</strong> הגעת דרך חבר ואתה זכאי ל-{discountPercent}% הנחה!
              </span>
              {timeLeft > 0 && (
                <span className="flex items-center gap-1 bg-white/20 px-2 py-0.5 rounded-full text-sm font-mono">
                  <Clock className="w-3 h-3" />
                  {formatTime(timeLeft)}
                </span>
              )}
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
