import axios from "axios";
import * as SecureStore from "expo-secure-store";

const API_BASE_URL = "https://studio.egonair.com/api";
const TOKEN_KEY = "egonair_mobile_jwt";

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor to attach JWT token to every request
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
