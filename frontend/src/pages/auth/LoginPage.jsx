import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import AuthLayout from '../../components/molecules/AuthLayout';
import Input from '../../components/atoms/Input';
import Button from '../../components/atoms/Button';
import Alert from '../../components/atoms/Alert';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isLoading, error, clearError } = useAuthStore();
  const [form, setForm] = useState({ email: '', password: '' });

  // Get return URL from location state
  const returnTo = location.state?.returnTo || '/dashboard';

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();
    try {
      await login(form.email, form.password);
      navigate(returnTo);
    } catch (err) {
      if (err.response?.data?.code === 'NOT_VERIFIED') {
        navigate('/verify', { state: { email: form.email, returnTo } });
      }
    }
  };

  return (
    <AuthLayout title="התחברות" subtitle="ברוך הבא חזרה">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}
        
        <Input
          label="אימייל"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="email@example.com"
          required
        />
        
        <Input
          label="סיסמה"
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          placeholder="הסיסמה שלך"
          required
        />
        
        <Button type="submit" isLoading={isLoading} className="w-full">
          התחברות
        </Button>
        
        <p className="text-center text-gray-600">
          אין לך חשבון?{' '}
          <Link to="/signup" className="text-primary-500 hover:underline">
            הרשם
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
