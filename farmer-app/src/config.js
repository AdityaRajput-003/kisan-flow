/**
 * Centralized API & App Configuration for KisanFlow Farmer App
 *
 * IMPORTANT: When testing on a physical device or Android emulator via Expo Go,
 * 'localhost' does NOT work. Use your machine's LAN IP address instead.
 *
 * Your current machine IP: 10.21.204.4
 * Backend runs on port: 5000
 */

const getApiBaseUrl = () => {
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
    if (process.env.REACT_APP_API_URL) return process.env.REACT_APP_API_URL;
  }

  // Use your machine's LAN IP so physical devices & emulators can reach the backend.
// Change this if your IP changes (run `ipconfig` to find it).
//return 'http://192.168.29.181:5000/api';
 return 'http://192.168.29.181:5000/api';
};

export const API_BASE_URL = getApiBaseUrl();

export const DEMO_FARMER_CREDENTIALS = {
  name: 'Ramesh Kumar',
  phone: '9876543210',
  password: 'password123'
};
