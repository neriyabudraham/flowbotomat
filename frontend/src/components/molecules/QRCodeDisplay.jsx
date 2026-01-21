import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import Button from '../atoms/Button';

export default function QRCodeDisplay({ qrCode, onRefresh, isLoading }) {
  const [countdown, setCountdown] = useState(30);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          onRefresh();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onRefresh]);

  return (
    <div className="text-center space-y-4">
      <h3 className="text-lg font-semibold">סרוק את הקוד</h3>
      <p className="text-sm text-gray-500">
        פתח את WhatsApp בטלפון ← הגדרות ← מכשירים מקושרים ← קשר מכשיר
      </p>
      
      <div className="bg-white p-4 rounded-xl inline-block shadow-lg">
        {qrCode ? (
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCode)}`}
            alt="QR Code"
            className="w-48 h-48"
          />
        ) : (
          <div className="w-48 h-48 bg-gray-100 flex items-center justify-center">
            <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
          </div>
        )}
      </div>
      
      <div className="text-sm text-gray-500">
        רענון אוטומטי בעוד {countdown} שניות
      </div>
      
      <Button
        variant="ghost"
        onClick={() => {
          setCountdown(30);
          onRefresh();
        }}
        isLoading={isLoading}
      >
        <RefreshCw className="w-4 h-4 ml-2" />
        רענן QR
      </Button>
    </div>
  );
}
