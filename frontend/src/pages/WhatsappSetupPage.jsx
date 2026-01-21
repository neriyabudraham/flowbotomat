import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useWhatsappStore from '../store/whatsappStore';
import Logo from '../components/atoms/Logo';
import Alert from '../components/atoms/Alert';
import ConnectionTypeSelector from '../components/molecules/ConnectionTypeSelector';
import ExternalConnectionForm from '../components/molecules/ExternalConnectionForm';
import QRCodeDisplay from '../components/molecules/QRCodeDisplay';
import ConnectionStatus from '../components/molecules/ConnectionStatus';

export default function WhatsappSetupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState('loading'); // loading, select, external, qr, connected
  const {
    connection, qrCode, isLoading, error,
    fetchStatus, connectManaged, connectExternal, fetchQR, disconnect, clearError,
  } = useWhatsappStore();

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      const data = await fetchStatus();
      if (data.connection?.status === 'connected') {
        setStep('connected');
      } else if (data.connection?.status === 'qr_pending') {
        setStep('qr');
        fetchQR();
      } else {
        setStep('select');
      }
    } catch {
      setStep('select');
    }
  };

  const handleSelectType = async (type) => {
    clearError();
    if (type === 'managed') {
      try {
        await connectManaged();
        setStep('qr');
        fetchQR();
      } catch {}
    } else {
      setStep('external');
    }
  };

  const handleExternalConnect = async (baseUrl, apiKey, sessionName) => {
    clearError();
    try {
      const data = await connectExternal(baseUrl, apiKey, sessionName);
      // Check actual status - might already be connected!
      if (data.connection?.status === 'connected') {
        setStep('connected');
      } else if (data.connection?.status === 'qr_pending') {
        setStep('qr');
        fetchQR();
      } else {
        // disconnected or other - go to QR
        setStep('qr');
        fetchQR();
      }
    } catch {}
  };

  const handleDisconnect = async () => {
    clearError();
    try {
      await disconnect();
      setStep('select');
    } catch {}
  };

  const handleRefreshQR = async () => {
    try {
      const data = await fetchStatus();
      if (data.connection?.status === 'connected') {
        setStep('connected');
      } else {
        await fetchQR();
      }
    } catch {}
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <Logo size="lg" />
          <p className="text-gray-500 mt-2">חיבור WhatsApp</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6">
          {error && (
            <Alert variant="error" className="mb-4">{error}</Alert>
          )}

          {step === 'loading' && (
            <div className="text-center py-8 text-gray-500">טוען...</div>
          )}

          {step === 'select' && (
            <ConnectionTypeSelector onSelect={handleSelectType} />
          )}

          {step === 'external' && (
            <ExternalConnectionForm
              onSubmit={handleExternalConnect}
              onBack={() => setStep('select')}
              isLoading={isLoading}
            />
          )}

          {step === 'qr' && (
            <QRCodeDisplay
              qrCode={qrCode}
              onRefresh={handleRefreshQR}
              onCancel={handleDisconnect}
              isLoading={isLoading}
            />
          )}

          {step === 'connected' && (
            <ConnectionStatus
              connection={connection}
              onDisconnect={handleDisconnect}
              isLoading={isLoading}
            />
          )}
        </div>

        {step === 'connected' && (
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full mt-4 text-primary-500 hover:underline"
          >
            המשך לדשבורד ←
          </button>
        )}
      </div>
    </div>
  );
}
