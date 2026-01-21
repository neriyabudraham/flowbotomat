import { useState } from 'react';
import Input from '../atoms/Input';
import Button from '../atoms/Button';

export default function ExternalConnectionForm({ onSubmit, onBack, isLoading }) {
  const [form, setForm] = useState({
    baseUrl: '',
    apiKey: '',
    sessionName: '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(form.baseUrl, form.apiKey, form.sessionName);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-lg font-semibold text-center mb-4">
        חיבור WAHA קיים
      </h3>
      
      <Input
        label="Base URL"
        type="url"
        value={form.baseUrl}
        onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
        placeholder="https://your-waha.com"
        required
        dir="ltr"
      />
      
      <Input
        label="API Key"
        type="password"
        value={form.apiKey}
        onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
        placeholder="your-api-key"
        required
        dir="ltr"
      />
      
      <Input
        label="Session Name"
        type="text"
        value={form.sessionName}
        onChange={(e) => setForm({ ...form, sessionName: e.target.value })}
        placeholder="default"
        required
        dir="ltr"
      />
      
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onBack} className="flex-1">
          חזרה
        </Button>
        <Button type="submit" isLoading={isLoading} className="flex-1">
          התחבר
        </Button>
      </div>
    </form>
  );
}
