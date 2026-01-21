import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import AuthLayout from '../../components/molecules/AuthLayout';
import Input from '../../components/atoms/Input';
import Button from '../../components/atoms/Button';
import Alert from '../../components/atoms/Alert';

export default function SignupPage() {
  const navigate = useNavigate();
  const { signup, isLoading, error, clearError } = useAuthStore();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [privacyError, setPrivacyError] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();
    setPrivacyError(false);
    
    if (!acceptPrivacy) {
      setPrivacyError(true);
      return;
    }
    
    try {
      await signup(form.email, form.password, form.name);
      navigate('/verify', { state: { email: form.email } });
    } catch {}
  };

  return (
    <AuthLayout title="הרשמה" subtitle="צור חשבון חדש">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}
        {privacyError && <Alert variant="error">יש לאשר את מדיניות הפרטיות</Alert>}
        
        <Input
          label="שם"
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="השם שלך"
        />
        
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
          placeholder="לפחות 8 תווים"
          required
          minLength={8}
        />
        
        {/* Privacy Policy Checkbox */}
        <label className={`flex items-start gap-3 cursor-pointer p-3 rounded-xl border transition-colors ${
          privacyError ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:bg-gray-50'
        }`}>
          <input
            type="checkbox"
            checked={acceptPrivacy}
            onChange={(e) => {
              setAcceptPrivacy(e.target.checked);
              if (e.target.checked) setPrivacyError(false);
            }}
            className="w-5 h-5 mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-600">
            קראתי ואני מסכים/ה ל
            <Link 
              to="/privacy" 
              target="_blank"
              className="text-blue-600 hover:underline mx-1"
            >
              מדיניות הפרטיות
            </Link>
            ול
            <Link 
              to="/terms" 
              target="_blank"
              className="text-blue-600 hover:underline mx-1"
            >
              תנאי השימוש
            </Link>
          </span>
        </label>
        
        <Button type="submit" isLoading={isLoading} className="w-full" disabled={!acceptPrivacy}>
          הרשמה
        </Button>
        
        <p className="text-center text-gray-600">
          כבר יש לך חשבון?{' '}
          <Link to="/login" className="text-primary-500 hover:underline">
            התחבר
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
