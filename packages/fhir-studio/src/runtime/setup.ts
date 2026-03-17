import {
  createInteractionRuntime,
  createPageModule,
  createModalModule,
  createNotificationModule,
} from '@prismui/core';

export const runtime = createInteractionRuntime({
  modules: [
    createPageModule(),
    createModalModule(),
    createNotificationModule({ maxNotifications: 50 }),
  ],
});
