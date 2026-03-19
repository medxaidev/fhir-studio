import {
  createInteractionRuntime,
  createPageModule,
  createModalModule,
  createNotificationModule,
  createRouterModule,
  createBrowserRouterAdapter,
  createPersistenceModule,
} from '@prismui/core';

export const runtime = createInteractionRuntime({
  modules: [
    createPageModule(),
    createModalModule(),
    createNotificationModule({ maxNotifications: 50 }),
    createRouterModule({ adapter: createBrowserRouterAdapter() }),
    createPersistenceModule({
      include: ['routerLocation', 'routerHistory', 'routerHistoryIndex'],
      debounceMs: 500,
    }),
  ],
});
