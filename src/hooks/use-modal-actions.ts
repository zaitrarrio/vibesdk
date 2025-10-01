import { useCallback, useEffect } from 'react';
import { useModalStore } from '@/stores/modal-store';
import { useAuthSelectors } from '@/stores/auth-store';
import { setGlobalAuthModalTrigger } from '@/lib/api-client';

export function useModalActions() {
  const { showAuthModal, hideAuthModal, setPendingAction } = useModalStore();
  const { isAuthenticated } = useAuthSelectors();

  const showAuthModalWithCallback = useCallback((context?: string, onSuccess?: () => void, intendedUrl?: string) => {
    setPendingAction(onSuccess ? () => onSuccess : undefined);
    showAuthModal();
  }, [showAuthModal, setPendingAction]);

  const hideAuthModalWithCleanup = useCallback(() => {
    hideAuthModal();
  }, [hideAuthModal]);

  // Close modal and execute pending action when user becomes authenticated
  useEffect(() => {
    const unsubscribe = useAuthSelectors.subscribe(
      (state) => state.isAuthenticated,
      (authenticated) => {
        const { isAuthModalOpen, pendingAction } = useModalStore.getState();
        if (authenticated && isAuthModalOpen) {
          hideAuthModal();
          // Execute the pending action after a brief delay to ensure modal is closed
          if (pendingAction) {
            setTimeout(() => {
              pendingAction();
            }, 100);
          }
        }
      }
    );

    return unsubscribe;
  }, [hideAuthModal]);

  // Set up global auth modal trigger for API client
  useEffect(() => {
    setGlobalAuthModalTrigger(showAuthModalWithCallback);
  }, [showAuthModalWithCallback]);

  return {
    showAuthModal: showAuthModalWithCallback,
    hideAuthModal: hideAuthModalWithCleanup,
  };
}