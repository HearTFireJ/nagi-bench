import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './ui/styles.css';

// Not wrapped in <StrictMode>: the game runtime is a singleton that owns WebGL / audio /
// pointer-lock resources, and double-mounting effects in dev would fight over them.
createRoot(document.getElementById('root') as HTMLElement).render(<App />);
