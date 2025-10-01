import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

// Pure state interface
interface ModalState {
  isAuthModalOpen: boolean;
  pendingAction: (() => void) | undefined;
}

// Actions interface
interface ModalActions {
  showAuthModal: (context?: string, onSuccess?: () => void, intendedUrl?: string) => void;
  hideAuthModal: () => void;
  setPendingAction: (action: (() => void) | undefined) => void;
}

// Pure Zustand store - only state and basic setters
export const useModalStore = create<ModalState & ModalActions>()(
  subscribeWithSelector((set) => ({
    // Initial state
    isAuthModalOpen: false,
    pendingAction: undefined,
    
    // Pure actions - only state updates
    showAuthModal: () => set({ isAuthModalOpen: true }),
    hideAuthModal: () => set({ isAuthModalOpen: false, pendingAction: undefined }),
    setPendingAction: (pendingAction) => set({ pendingAction }),
  }))
);

// Computed selectors
export const useModalSelectors = () => {
  const isAuthModalOpen = useModalStore((state) => state.isAuthModalOpen);
  const pendingAction = useModalStore((state) => state.pendingAction);
  
  return {
    isAuthModalOpen,
    pendingAction,
  };
};