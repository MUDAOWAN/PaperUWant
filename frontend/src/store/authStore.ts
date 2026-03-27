"use client";

import { create } from "zustand";
import type { User, Session } from "@supabase/supabase-js";

interface AuthState {
  user: User | null;
  session: Session | null;
  isAuthModalOpen: boolean;
  isAuthLoading: boolean;
  authError: string | null;
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  setAuthLoading: (loading: boolean) => void;
  setAuthError: (error: string | null) => void;
  clearAuthError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  isAuthModalOpen: false,
  isAuthLoading: false,
  authError: null,

  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  openAuthModal: () => set({ isAuthModalOpen: true, authError: null }),
  closeAuthModal: () => set({ isAuthModalOpen: false, authError: null }),
  setAuthLoading: (isAuthLoading) => set({ isAuthLoading }),
  setAuthError: (authError) => set({ authError }),
  clearAuthError: () => set({ authError: null }),
}));
