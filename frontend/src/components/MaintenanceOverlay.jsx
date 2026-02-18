import { useState, useEffect } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { onMaintenanceChange } from '../services/api';

export default function MaintenanceOverlay() {
  const [isDown, setIsDown] = useState(false);
  const [message, setMessage] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const unsubscribe = onMaintenanceChange((down, msg) => {
      setIsDown(down);
      setMessage(msg || 'המערכת בתחזוקה');
      
      if (!down) {
        setRetryCount(0);
      }
    });

    return unsubscribe;
  }, []);

  // Auto-retry when down
  useEffect(() => {
    if (!isDown) return;

    const retryInterval = setInterval(async () => {
      try {
        const response = await fetch('/api/health');
        if (response.ok) {
          setIsDown(false);
          setRetryCount(0);
        } else {
          setRetryCount(c => c + 1);
        }
      } catch {
        setRetryCount(c => c + 1);
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(retryInterval);
  }, [isDown]);

  if (!isDown) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-md mx-4 text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
        
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          {message}
        </h2>
        
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          המערכת תחזור לפעילות בעוד מספר שניות
        </p>
        
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>מנסה להתחבר מחדש{retryCount > 0 ? ` (${retryCount})` : ''}...</span>
        </div>
      </div>
    </div>
  );
}
