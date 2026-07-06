
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import store from './store';
import './index.css';
import './styles/globals.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      })
      .catch((error) => console.error('Service worker cleanup failed:', error));

    if ('caches' in window) {
      caches
        .keys()
        .then((cacheNames) => {
          cacheNames
            .filter((cacheName) => cacheName.startsWith('vstudy-'))
            .forEach((cacheName) => caches.delete(cacheName));
        })
        .catch((error) => console.error('Cache cleanup failed:', error));
    }
  });
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
