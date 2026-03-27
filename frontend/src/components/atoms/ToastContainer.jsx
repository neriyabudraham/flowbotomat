import { createPortal } from 'react-dom';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import useToastStore from '../../store/toastStore';

const icons = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const styles = {
  success: 'bg-green-50 border-green-200 text-green-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
};

const iconStyles = {
  success: 'text-green-500',
  error: 'text-red-500',
  info: 'text-blue-500',
  warning: 'text-amber-500',
};

const confirmIconStyles = {
  warning: 'bg-amber-100 text-amber-600',
  error: 'bg-red-100 text-red-600',
  info: 'bg-blue-100 text-blue-600',
};

const confirmButtonStyles = {
  warning: 'bg-amber-500 hover:bg-amber-600',
  error: 'bg-red-500 hover:bg-red-600',
  info: 'bg-blue-500 hover:bg-blue-600',
};

export default function ToastContainer() {
  const { toasts, removeToast, confirmDialog, closeConfirm } = useToastStore();

  return createPortal(
    <>
      {/* Toasts */}
      {toasts.length > 0 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[99999] flex flex-col gap-2 w-full max-w-md px-4 pointer-events-none">
          {toasts.map((t) => {
            const Icon = icons[t.type] || Info;
            return (
              <div
                key={t.id}
                className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-sm animate-slide-down ${styles[t.type] || styles.info}`}
                dir="rtl"
              >
                <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${iconStyles[t.type] || iconStyles.info}`} />
                <p className="flex-1 text-sm font-medium leading-relaxed whitespace-pre-line">{t.message}</p>
                <button
                  onClick={() => removeToast(t.id)}
                  className="shrink-0 p-0.5 rounded-lg hover:bg-black/10 transition-colors"
                >
                  <X className="w-4 h-4 opacity-60" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[99999] flex items-center justify-center p-4" onClick={() => closeConfirm(false)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-slide-down"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 text-center">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${confirmIconStyles[confirmDialog.type] || confirmIconStyles.warning}`}>
                <AlertTriangle className="w-7 h-7" />
              </div>
              <p className="text-gray-800 font-medium leading-relaxed whitespace-pre-line">{confirmDialog.message}</p>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={() => closeConfirm(true)}
                className={`flex-1 px-4 py-3 text-white rounded-xl font-medium transition-colors ${confirmButtonStyles[confirmDialog.type] || confirmButtonStyles.warning}`}
              >
                {confirmDialog.confirmText}
              </button>
              <button
                onClick={() => closeConfirm(false)}
                className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
              >
                {confirmDialog.cancelText}
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
