import { Smartphone, Server, Link, Loader2 } from 'lucide-react';

export default function ConnectionTypeSelector({ onSelect, existingSession, isChecking }) {
  // If checking for existing session, show loader
  if (isChecking) {
    return (
      <div className="text-center py-8">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary-500" />
        <p className="text-gray-500 mt-2">בודק חיבורים קיימים...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-center mb-6">
        איך תרצה להתחבר?
      </h3>
      
      {/* If existing session found, show connect button */}
      {existingSession?.exists && (
        <button
          onClick={() => onSelect('managed')}
          className="w-full p-4 border-2 border-green-300 bg-green-50 rounded-xl hover:border-green-500 
                     hover:bg-green-100 transition-all flex items-center gap-4"
        >
          <div className="w-12 h-12 bg-green-200 rounded-full flex items-center justify-center">
            <Link className="w-6 h-6 text-green-700" />
          </div>
          <div className="text-right flex-1">
            <div className="font-semibold text-green-800">התחבר לחשבון קיים</div>
            <div className="text-sm text-green-600">
              נמצא חיבור קיים: {existingSession.sessionName}
              {existingSession.isConnected && ' (מחובר)'}
            </div>
          </div>
        </button>
      )}
      
      {/* Only show "create new" if no existing session */}
      {!existingSession?.exists && (
        <button
          onClick={() => onSelect('managed')}
          className="w-full p-4 border-2 border-gray-200 rounded-xl hover:border-primary-500 
                     hover:bg-primary-50 transition-all flex items-center gap-4"
        >
          <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
            <Smartphone className="w-6 h-6 text-primary-600" />
          </div>
          <div className="text-right flex-1">
            <div className="font-semibold">צור חיבור חדש</div>
            <div className="text-sm text-gray-500">
              המערכת תיצור עבורך חיבור WhatsApp אוטומטי
            </div>
          </div>
        </button>
      )}
      
      <button
        onClick={() => onSelect('external')}
        className="w-full p-4 border-2 border-gray-200 rounded-xl hover:border-primary-500 
                   hover:bg-primary-50 transition-all flex items-center gap-4"
      >
        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
          <Server className="w-6 h-6 text-gray-600" />
        </div>
        <div className="text-right flex-1">
          <div className="font-semibold">חבר WAHA קיים</div>
          <div className="text-sm text-gray-500">
            יש לי שרת WAHA משלי ואני רוצה לחבר אותו
          </div>
        </div>
      </button>
    </div>
  );
}
