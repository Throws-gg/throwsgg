"use client";

import { createContext, useContext } from "react";

interface AuthActions {
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthActions>({
  login: () => {},
  logout: () => {},
});

export function AuthProvider({
  login,
  logout,
  children,
}: AuthActions & { children: React.ReactNode }) {
  return (
    <AuthContext.Provider value={{ login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthActions() {
  return useContext(AuthContext);
}
