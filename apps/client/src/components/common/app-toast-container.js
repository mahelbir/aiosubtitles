'use client';

import {useTheme} from 'next-themes';
import {ToastContainer, Zoom} from 'react-toastify';

export function AppToastContainer() {
  const {resolvedTheme} = useTheme();

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
      theme={resolvedTheme}
      transition={Zoom}
    />
  );
}
