import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initMatomo, trackEvent, trackGoal, trackPageView } from './matomo';

describe('matomo wrapper', () => {
    beforeEach(() => {
        delete (window as { _paq?: unknown[][] })._paq;
    });

    afterEach(() => {
        delete (window as { _paq?: unknown[][] })._paq;
    });

    describe('when _paq is absent', () => {
        it('trackPageView does not throw', () => {
            expect(() => trackPageView()).not.toThrow();
        });

        it('trackEvent does not throw', () => {
            expect(() => trackEvent('cat', 'action')).not.toThrow();
        });

        it('trackGoal does not throw', () => {
            expect(() => trackGoal(1)).not.toThrow();
        });
    });

    describe('trackPageView', () => {
        it('pushes trackPageView to _paq', () => {
            window._paq = [];
            trackPageView();
            expect(window._paq).toEqual([['trackPageView']]);
        });
    });

    describe('trackEvent', () => {
        it('pushes category and action', () => {
            window._paq = [];
            trackEvent('welcome', 'signup-click');
            expect(window._paq).toEqual([
                ['trackEvent', 'welcome', 'signup-click'],
            ]);
        });

        it('pushes name when provided', () => {
            window._paq = [];
            trackEvent('registration', 'form-submit', 'register-page');
            expect(window._paq).toEqual([
                ['trackEvent', 'registration', 'form-submit', 'register-page'],
            ]);
        });
    });

    describe('trackGoal', () => {
        it('pushes trackGoal with id', () => {
            window._paq = [];
            trackGoal(1);
            expect(window._paq).toEqual([['trackGoal', 1]]);
        });
    });

    describe('initMatomo', () => {
        it('sets up _paq with tracker url and site id', () => {
            initMatomo({
                tracker_url: 'https://stat.istic.net',
                site_id: 3,
                goals: { registration: 1 },
            });
            expect(window._paq).toContainEqual([
                'setTrackerUrl',
                'https://stat.istic.net/matomo.php',
            ]);
            expect(window._paq).toContainEqual(['setSiteId', '3']);
        });

        it('injects a script tag pointing to matomo.js', () => {
            const appendSpy = vi.spyOn(document.head, 'appendChild');
            initMatomo({
                tracker_url: 'https://stat.istic.net',
                site_id: 3,
                goals: { registration: 1 },
            });
            expect(appendSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    src: 'https://stat.istic.net/matomo.js',
                    async: true,
                }),
            );
            appendSpy.mockRestore();
        });
    });
});
