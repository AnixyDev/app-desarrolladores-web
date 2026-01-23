import { StateCreator } from 'zustand';
import { AppState } from '../useAppStore';

// Mock types for portal feature
export interface PortalComment {
  id: string;
  entityId: string; // e.g., invoiceId, projectId
  userName: string;
  text: string;
  timestamp: string;
}

export interface PortalFile {
  id: string;
  entityId: string;
  fileName: string;
  url: string;
  uploadedAt: string;
}

export interface PortalSlice {
  portalComments: PortalComment[];
  portalFiles: PortalFile[];
  addPortalComment: (comment: Omit<PortalComment, 'id' | 'timestamp'>) => void;
  // Add more actions as needed
}

export const createPortalSlice: StateCreator<AppState, [], [], PortalSlice> = (set, get) => ({
  portalComments: [],
  portalFiles: [],
  addPortalComment: (comment) => {
    const newComment: PortalComment = {
      ...comment,
      id: `p-comment-${Date.now()}`,
      timestamp: new Date().toISOString(),
    };
    set(state => ({ portalComments: [...state.portalComments, newComment]}));
  },
});
