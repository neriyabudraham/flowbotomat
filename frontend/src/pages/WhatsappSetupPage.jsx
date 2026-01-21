import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useWhatsappStore from '../store/whatsappStore';
import Logo from '../components/atoms/Logo';
import Alert from '../components/atoms/Alert';
import ConnectionTypeSelector from '../components/molecules/ConnectionTypeSelector';
import ExternalConnectionForm from '../components/molecules/ExternalConnectionForm';
import QRCodeDisplay from '../components/molecules/QRCodeDisplay';
import ConnectionStatus from '../components/molecules/ConnectionStatus';
import PaymentRequiredModal from '../components/payment/PaymentRequiredModal';

export default function WhatsappSetupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState('loading'); // loading, select, external, qr, connected
  const [isCheckingExisting, setIsCheckingExisting] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [pendingConnectionType, setPendingConnectionType] = useState(null);
  const {
    connection, qrCode, isLoading, error, existingSession,
    fetchStatus, connectManaged, connectExternal, fetchQR, disconnect, deleteConnection, clearError, checkExisting,
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
        // No connection in DB - check WAHA for existing session
        setStep('select');
        setIsCheckingExisting(true);
        await checkExisting();
        setIsCheckingExisting(false);
      }
    } catch {
      setStep('select');
      setIsCheckingExisting(true);
      await checkExisting();
      setIsCheckingExisting(false);
    }
  };

  const handleSelectType = async (type) => {
    clearError();
    if (type === 'managed') {
      try {
        const data = await connectManaged();
        // Check if already connected (existing session)
        if (data.connection?.status === 'connected') {
          setStep('connected');
        } else {
          setStep('qr');
          fetchQR();
        }
      } catch (err) {
        // Check if payment is required
        if (err.response?.data?.code === 'PAYMENT_REQUIRED') {
          setPendingConnectionType('managed');
          setShowPaymentModal(true);
        }
      }
    } else {
      setStep('external');
    }
  };

  const handlePaymentSuccess = async () => {
    setShowPaymentModal(false);
    // Retry the connection after payment method is added
    if (pendingConnectionType === 'managed') {
      try {
        const data = await connectManaged();
        if (data.connection?.status === 'connected') {
          setStep('connected');
        } else {
          setStep('qr');
          fetchQR();
        }
      } catch {}
    }
    setPendingConnectionType(null);
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
      // Re-check for existing sessions
      setIsCheckingExisting(true);
      await checkExisting();
      setIsCheckingExisting(false);
    } catch {}
  };

  const handleDelete = async () => {
    clearError();
    try {
      await deleteConnection();
      setStep('select');
      // Re-check for existing sessions (should find none after delete)
      setIsCheckingExisting(true);
      await checkExisting();
      setIsCheckingExisting(false);
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
            <ConnectionTypeSelector 
              onSelect={handleSelectType} 
              existingSession={existingSession}
              isChecking={isCheckingExisting}
            />
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
              onDelete={handleDelete}
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

      {/* Payment Required Modal */}
      <PaymentRequiredModal
        isOpen={showPaymentModal}
        onClose={() => {
          setShowPaymentModal(false);
          setPendingConnectionType(null);
        }}
        onSuccess={handlePaymentSuccess}
        title="נדרש אמצעי תשלום"
        description="על מנת לחבר WhatsApp, נדרש להזין פרטי כרטיס אשראי. לא תחויב כעת - רק בעת שדרוג לתכנית בתשלום."
      />
    </div>
  );
}
