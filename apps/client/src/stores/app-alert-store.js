import {create} from 'zustand';

export const useAppAlertStore = create((set, get) => ({
  alert: null,
  isPending: false,
  open(alert) {
    return new Promise(resolve => {
      set(state => {
        state.alert?.resolve(false);
        return {alert: {...alert, resolve}, isPending: false};
      });
    });
  },
  async confirm() {
    const {alert, close} = get();
    if (!alert?.onConfirm) {
      close(true);
      return;
    }
    const isCurrent = () => get().alert === alert;
    set({isPending: true});
    try {
      const data = await alert.onConfirm();
      if (isCurrent()) {
        set({isPending: false});
        get().close(true);
        const success = alert.successAlert(data);
        if (success) {
          get().open(success);
        }
      }
      alert.onSuccess?.(data);
    } catch (cause) {
      if (isCurrent()) {
        set({isPending: false});
        get().close(false);
        const failure = alert.errorAlert(cause);
        if (failure) {
          get().open(failure);
        }
      }
      alert.onError?.(cause);
    } finally {
      alert.finally?.();
    }
  },
  close(result) {
    if (get().isPending) {
      return;
    }
    set(state => {
      state.alert?.resolve(result);
      return {alert: null, isPending: false};
    });
  },
}));
