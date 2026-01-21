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

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();
    try {
      await signup(form.email, form.password, form.name);
      navigate('/verify', { state: { email: form.email } });
    } catch {}
  };

  return (
    <AuthLayout title="הרשמה" subtitle="צור חשבון חדש">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}
        
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
        
        <Button type="submit" isLoading={isLoading} className="w-full">
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
