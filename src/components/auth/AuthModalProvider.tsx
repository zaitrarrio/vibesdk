/**
 * Authentication Modal Provider
 * Provides global authentication modal management
 */

import React, { createContext, useContext } from 'react';
import { LoginModalZustand } from './login-modal-zustand';
import { useModalSelectors } from '../../stores/modal-store';
import { useModalActions } from '../../hooks/use-modal-actions';

interface AuthModalContextType {
  showAuthModal: (context?: string, onSuccess?: () => void, intendedUrl?: string) => void;
  hideAuthModal: () => void;
  isAuthModalOpen: boolean;
}

const AuthModalContext = createContext<AuthModalContextType | undefined>(undefined);

export function useAuthModal() {
  const context = useContext(AuthModalContext);
  if (context === undefined) {
    throw new Error('useAuthModal must be used within an AuthModalProvider');
  }
  return context;
}

interface AuthModalProviderProps {
  children: React.ReactNode;
}

export function AuthModalProvider({ children }: AuthModalProviderProps) {
  const { isAuthModalOpen } = useModalSelectors();
  const { showAuthModal, hideAuthModal } = useModalActions();

  const value: AuthModalContextType = {
    showAuthModal,
    hideAuthModal,
    isAuthModalOpen,
  };

  return (
    <AuthModalContext.Provider value={value}>
      {children}
      <LoginModalZustand />
    </AuthModalContext.Provider>
  );
}