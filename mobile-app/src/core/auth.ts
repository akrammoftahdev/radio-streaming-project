import * as SecureStore from "expo-secure-store";
import { api } from "./api";

const TOKEN_KEY = "egonair_mobile_jwt";
const USER_KEY = "egonair_mobile_user";

export type User = {
  id: string;
  username: string;
  role: string;
};

export const auth = {
  async login(username: string, password: string): Promise<User> {
    const response = await api.post("/mobile/login", { username, password });
    const { token, user } = response.data;
    
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    
    return user;
  },

  async logout(): Promise<void> {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
  },

  async getUser(): Promise<User | null> {
    const userStr = await SecureStore.getItemAsync(USER_KEY);
    return userStr ? JSON.parse(userStr) : null;
  },

  async getToken(): Promise<string | null> {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  }
};
