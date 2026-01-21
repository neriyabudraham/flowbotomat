import { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import AuthLayout from '../../components/molecules/AuthLayout';
import Input from '../../components/atoms/Input';
import Button from '../../components/atoms/Button';
import Alert from '../../components/atoms/Alert';

export default function VerifyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { verify, resendVerification, isLoading, error, clearError } = useAuthStore();
  
  const [code, setCode] = useState('');
  const [email, setEmail] = useState(location.state?.email || '');
  const [success, setSuccess] = useState('');

  // Auto-verify if token in URL
  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      handleVerifyToken(token);
    }
  }, [searchParams]);

  const handleVerifyToken = async (token) => {
    try {
      await verify(token, null, null);
      setSuccess('החשבון אומת בהצלחה!');
      setTimeout(() => navigate('/login'), 2000);
    } catch {}
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();
    try {
      await verify(null, code, email);
      setSuccess('החשבון אומת בהצלחה!');
      setTimeout(() => navigate('/login'), 2000);
    } catch {}
  };

  const handleResend = async () => {
    clearError();
    try {
      await resendVerification(email);
      setSuccess('קוד אימות חדש נשלח למייל');
    } catch {}
  };

  return (
    <AuthLayout title="אימות חשבון" subtitle="הזן את הקוד שקיבלת במייל">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}
        
        <Input
          label="אימייל"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@example.com"
          required
        />
        
        <Input
          label="קוד אימות"
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
          maxLength={6}
          required
        />
        
        <Button type="submit" isLoading={isLoading} className="w-full">
          אמת חשבון
        </Button>
        
        <button
          type="button"
          onClick={handleResend}
          className="w-full text-primary-500 hover:underline"
        >
          שלח קוד חדש
        </button>
      </form>
    </AuthLayout>
  );
}
