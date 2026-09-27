import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// No StrictMode: it would mount the WebGL engine twice in development.
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
void React;
