import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Slices
import { createAuthSlice } from './store/authSlice';
import { createClientSlice } from './store/clientSlice';
import { createProjectSlice } from './store/projectSlice';
import { createFinanceSlice } from './store/financeSlice';
import { createTeamSlice } from './store/teamSlice';
import { createNotificationSlice } from './store/notificationSlice';
import { createJobSlice } from './store/jobSlice';
import { createPortalSlice } from './store/portalSlice';
import { createInboxSlice } from './store/inboxSlice';

import type { AuthSlice } from './store/authSlice';
import type { ClientSlice } from './store/clientSlice';
import type { ProjectSlice } from './store/projectSlice';
import type { FinanceSlice } from './store/financeSlice';
import type { TeamSlice } from './store/teamSlice';
import type { NotificationSlice } from './store/notificationSlice';
import type { JobSlice } from './store/jobSlice';
import type { PortalSlice } from './store/portalSlice';
import type { InboxSlice } from './store/inboxSlice';

export type AppState = AuthSlice & ClientSlice & ProjectSlice & FinanceSlice & TeamSlice & NotificationSlice & JobSlice & PortalSlice & InboxSlice;

export const useAppStore = create<AppState>()(
  persist(
    (...a) => ({
        ...createAuthSlice(...a),
        ...createClientSlice(...a),
        ...createProjectSlice(...a),
        ...createFinanceSlice(...a),
        ...createTeamSlice(...a),
        ...createNotificationSlice(...a),
        ...createJobSlice(...a),
        ...createPortalSlice(...a),
        ...createInboxSlice(...a),
    }),
    {
      name: 'devfreelancer-storage-v4',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        savedJobIds: state.savedJobIds,
        monthlyGoalCents: state.monthlyGoalCents,
      }),
    }
  )
);