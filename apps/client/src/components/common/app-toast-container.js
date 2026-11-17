'use client';

import {ToastContainer, Zoom} from 'react-toastify';
import {APP_THEME} from '@/config/theme';

export function AppToastContainer() {
  return (
    <ToastContainer
      position="top-center"
      autoClose={2500}
      hideProgressBar
      newestOnTop
      closeOnClick={false}
      rtl={false}
      pauseOnFocusLoss={false}
      draggable
      pauseOnHover
      theme={APP_THEME}
      transition={Zoom}
    />
  );
}
