import { fireEvent, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { trackEvent } from '@/lib/matomo';
import Register from './register';

type FormRenderProps = {
    processing: boolean;
    errors: Record<string, string>;
};

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    Link: ({
        href,
        children,
    }: {
        href: string | { url: string };
        children: ReactNode;
    }) => <a href={typeof href === 'string' ? href : href.url}>{children}</a>,
    Form: ({
        onSuccess,
        children,
    }: {
        onSuccess?: () => void;
        children: (props: FormRenderProps) => ReactNode;
    }) => (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                onSuccess?.();
            }}
        >
            {children({ processing: false, errors: {} })}
        </form>
    ),
}));

vi.mock('@/lib/matomo', () => ({
    trackEvent: vi.fn(),
}));

vi.mock('@/routes', () => ({
    login: () => ({ url: '/login', method: 'get' }),
}));

vi.mock('@/routes/register', () => ({
    store: {
        form: () => ({ action: '/register', method: 'post' }),
    },
}));

describe('Register', () => {
    it('tracks a form-submit event when registration succeeds', () => {
        const { container } = render(<Register />);

        const form = container.querySelector('form');
        expect(form).not.toBeNull();

        fireEvent.submit(form as HTMLFormElement);

        expect(trackEvent).toHaveBeenCalledWith('registration', 'form-submit');
    });
});
