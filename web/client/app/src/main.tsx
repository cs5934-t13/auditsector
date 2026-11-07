import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
// Self-hosted display fonts (bundled by Vite, no font CDN needed).
// Only the latin subset is imported for each weight we actually render.
import '@fontsource/alegreya-sc/latin-500.css';
import '@fontsource/crimson-text/latin-400.css';
import App from './App';
import theme from './theme';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root was not found in index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>,
);
