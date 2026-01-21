import { CheckCircle, Phone, LogOut } from 'lucide-react';
import Button from '../atoms/Button';

export default function ConnectionStatus({ connection, onDisconnect, isLoading }) {
  return (
    <div className="text-center space-y-6">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
        <CheckCircle className="w-10 h-10 text-green-500" />
      </div>
      
      <div>
        <h3 className="text-xl font-semibold text-green-600">מחובר!</h3>
        <p className="text-gray-500">WhatsApp מחובר ופעיל</p>
      </div>
      
      {connection?.phone_number && (
        <div className="bg-gray-50 rounded-xl p-4 inline-block">
          <div className="flex items-center gap-3">
            <Phone className="w-5 h-5 text-gray-400" />
            <span className="font-mono text-lg" dir="ltr">
              +{connection.phone_number}
            </span>
          </div>
          {connection.display_name && (
            <div className="text-sm text-gray-500 mt-1">
              {connection.display_name}
            </div>
          )}
        </div>
      )}
      
      <Button
        variant="danger"
        onClick={onDisconnect}
        isLoading={isLoading}
      >
        <LogOut className="w-4 h-4 ml-2" />
        נתק חיבור
      </Button>
    </div>
  );
}
