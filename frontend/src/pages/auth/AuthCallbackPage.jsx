import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useAuthStore from '../../store/authStore';

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setTokens } = useAuthStore();

  useEffect(() => {
    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');
    const redirect = searchParams.get('redirect');
    
    if (accessToken && refreshToken) {
      // Store tokens
      setTokens(accessToken, refreshToken);
      // Redirect to specified path or dashboard
      navigate(redirect || '/dashboard', { replace: true });
    } else {
      // No tokens, redirect to login
      navigate('/login', { replace: true });
    }
  }, [searchParams, setTokens, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50" dir="rtl">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600">מתחבר...</p>
      </div>
    </div>
  );
}
