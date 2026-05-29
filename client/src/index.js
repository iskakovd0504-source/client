import { Buffer } from 'buffer';
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
// import App from './App'; // Раскомментируйте эту строку и строку ниже, чтобы вернуть игру
import SaleLanding from './SaleLanding';
import { Analytics } from '@vercel/analytics/react';
import reportWebVitals from './reportWebVitals';

window.Buffer = Buffer;

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <SaleLanding />
    <Analytics />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
