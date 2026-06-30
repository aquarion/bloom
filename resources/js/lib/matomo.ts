declare global {
    interface Window {
        _paq?: unknown[][];
    }
}

export interface MatomoConfig {
    tracker_url: string;
    site_id: number;
    goals: {
        registration: number;
    };
}

export function initMatomo(config: MatomoConfig): void {
    window._paq = window._paq ?? [];
    window._paq.push(['setTrackerUrl', `${config.tracker_url}/matomo.php`]);
    window._paq.push(['setSiteId', String(config.site_id)]);
    window._paq.push(['enableLinkTracking']);
    window._paq.push(['trackPageView']);
    const script = document.createElement('script');
    script.async = true;
    script.src = `${config.tracker_url}/matomo.js`;
    document.head.appendChild(script);
}

export function trackPageView(): void {
    window._paq?.push(['trackPageView']);
}

export function trackEvent(
    category: string,
    action: string,
    name?: string,
): void {
    const payload: unknown[] = ['trackEvent', category, action];

    if (name !== undefined) {
        payload.push(name);
    }

    window._paq?.push(payload);
}

export function trackGoal(goalId: number): void {
    window._paq?.push(['trackGoal', goalId]);
}
