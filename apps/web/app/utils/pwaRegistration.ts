export interface ServiceWorkerRegistrationOptions {
  enabled: boolean;
  serviceWorkerUrl?: string;
  scope?: string;
  navigatorRef?: Pick<Navigator, 'serviceWorker'>;
}

export async function registerArtifactServiceWorker({
  enabled,
  serviceWorkerUrl = '/sw.js',
  scope = '/',
  navigatorRef = typeof navigator !== 'undefined' ? navigator : undefined,
}: ServiceWorkerRegistrationOptions): Promise<ServiceWorkerRegistration | null> {
  if (!enabled || !navigatorRef?.serviceWorker) return null;
  return navigatorRef.serviceWorker.register(serviceWorkerUrl, { scope });
}
