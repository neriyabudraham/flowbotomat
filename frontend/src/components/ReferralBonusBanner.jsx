import { useState, useEffect } from 'react';
import { Gift, X, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ReferralBonusBanner() {
  const [show, setShow] = useState(false);
  const [discountPercent, setDiscountPercent] = useState(10);

  useEffect(() => {
    // Check if user arrived via referral
    const referralCode = localStorage.getItem('referral_code');
    const wasDismissed = localStorage.getItem('referral_banner_dismissed');
    
    if (referralCode && !wasDismissed) {
      setShow(true);
      // Get discount percentage from referral settings (default 10%)
      const savedDiscount = localStorage.getItem('referral_discount_percent');
      if (savedDiscount) {
        setDiscountPercent(parseInt(savedDiscount) || 10);
      }
    }
  }, []);

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem('referral_banner_dismissed', 'true');
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
