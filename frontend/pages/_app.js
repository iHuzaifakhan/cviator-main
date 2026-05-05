// frontend/pages/_app.js
// Custom Next.js App. Wraps every page in <AuthProvider> so the auth
// state survives client-side route changes.

import '../styles/globals.css';
import { AuthProvider } from '../hooks/useAuth';

export default function App({ Component, pageProps }) {
  return (
    <AuthProvider>
      <Component {...pageProps} />
    </AuthProvider>
  );
}
