import { useState } from 'react';
import { CheckCircle, Phone, LogOut, Trash2, AlertTriangle } from 'lucide-react';
import Button from '../atoms/Button';
import ConfirmModal from '../organisms/ConfirmModal';

export default function ConnectionStatus({ connection, onDisconnect, onDelete, isLoading }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
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
      
      <div className="space-y-3">
        <Button
          variant="secondary"
          onClick={onDisconnect}
          isLoading={isLoading}
          className="w-full"
        >
          <LogOut className="w-4 h-4 ml-2" />
          נתק מהמערכת
        </Button>
        <p className="text-xs text-gray-400">
          ה-session יישאר פעיל ותוכל להתחבר מחדש בלי לסרוק QR
        </p>
        
        <div className="pt-4 border-t border-gray-100">
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-sm text-red-500 hover:text-red-600 flex items-center gap-1 mx-auto"
          >
            <Trash2 className="w-4 h-4" />
            מחק חיבור לגמרי
          </button>
          <p className="text-xs text-gray-400 mt-1">
            יצטרך לסרוק QR מחדש
          </p>
        </div>
      </div>
      
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          setShowDeleteConfirm(false);
          onDelete?.();
        }}
        title="מחיקת חיבור לגמרי"
        message="פעולה זו תנתק את WhatsApp לגמרי ותמחק את ה-session. תצטרך לסרוק QR מחדש להתחברות."
        confirmText="מחק לגמרי"
        variant="danger"
        icon={<AlertTriangle className="w-6 h-6 text-red-500" />}
      />
    </div>
  );
}
