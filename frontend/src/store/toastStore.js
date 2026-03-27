import { create } from 'zustand';

let toastId = 0;

const useToastStore = create((set) => ({
  toasts: [],

  addToast: (message, type = 'info', duration = 4000) => {
    const id = ++toastId;
    set((state) => ({
      toasts: [...state.toasts, { id, message, type, duration }],
    }));
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, duration);
    }
    return id;
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  // Confirm dialog state
  confirmDialog: null,

  showConfirm: (message, { onConfirm, onCancel, confirmText, cancelText, type } = {}) => {
    return new Promise((resolve) => {
      set({
        confirmDialog: {
          message,
          type: type || 'warning',
          confirmText: confirmText || 'אישור',
          cancelText: cancelText || 'ביטול',
          resolve,
          onConfirm,
          onCancel,
        },
      });
    });
  },

  closeConfirm: (result) => {
    const dialog = useToastStore.getState().confirmDialog;
    if (dialog) {
      dialog.resolve(result);
      if (result && dialog.onConfirm) dialog.onConfirm();
      if (!result && dialog.onCancel) dialog.onCancel();
    }
    set({ confirmDialog: null });
  },
}));

// Global helper functions — importable anywhere without hooks
export const toast = {
  success: (msg, duration) => useToastStore.getState().addToast(msg, 'success', duration),
  error: (msg, duration) => useToastStore.getState().addToast(msg, 'error', duration ?? 5000),
  info: (msg, duration) => useToastStore.getState().addToast(msg, 'info', duration),
  warning: (msg, duration) => useToastStore.getState().addToast(msg, 'warning', duration),
  confirm: (msg, opts) => useToastStore.getState().showConfirm(msg, opts || {}),
};

export default useToastStore;
