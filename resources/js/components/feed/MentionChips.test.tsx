import { act, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Mention } from '@/types/post';
import { MentionChips } from './MentionChips';

const makeMention = (handle: string): Mention => ({
    handle,
    display_name: handle.replace('@', ''),
    avatar: '',
    profile_url: `https://example.com/${handle}`,
});

/**
 * Stubs the two DOM reads MentionChips relies on for its initial,
 * synchronous measurement pass: the visible container's width (via
 * getBoundingClientRect) and each hidden measurement chip's width (via
 * offsetWidth, matched up by the data-mention-measure-id attribute
 * MentionChips sets on each one). MentionChips also re-measures on resize
 * via a ResizeObserver — these stubs don't cover that path; see the
 * dedicated resize test below, which captures the observer callback instead.
 */
function stubMeasurements(
    containerWidth: number,
    chipWidthsByProfileUrl: Record<string, number>,
) {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        width: containerWidth,
        height: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
    });

    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(
        function (this: HTMLElement) {
            const id = this.dataset.mentionMeasureId;

            return id !== undefined ? (chipWidthsByProfileUrl[id] ?? 0) : 0;
        },
    );
}

afterEach(() => {
    vi.restoreAllMocks();
});

it('renders nothing when there are no mentions', () => {
    const { container } = render(<MentionChips mentions={[]} />);
    expect(container).toBeEmptyDOMElement();
});

// MentionChips also renders a hidden off-screen pass of every mention (to
// measure true chip widths), which contains the same name/handle text as
// the visible row. Every assertion below scopes its queries to the visible
// container (data-testid="mention-chips-visible") so it can't accidentally
// match that hidden measurement copy.
function visibleChips() {
    return within(screen.getByTestId('mention-chips-visible'));
}

it('renders a full chip for each mention when there is room for all of them', () => {
    const alice = makeMention('@alice');
    const bob = makeMention('@bob');
    stubMeasurements(400, {
        [alice.profile_url]: 100,
        [bob.profile_url]: 100,
    });

    render(<MentionChips mentions={[alice, bob]} />);

    expect(visibleChips().getByText('alice')).toBeInTheDocument();
    expect(visibleChips().getByText('bob')).toBeInTheDocument();
});

it('links each full chip to its profile_url in a new tab', () => {
    const alice = makeMention('@alice');
    stubMeasurements(400, { [alice.profile_url]: 100 });

    render(<MentionChips mentions={[alice]} />);

    const link = visibleChips().getByRole('link', { name: /alice/i });
    expect(link).toHaveAttribute('href', 'https://example.com/@alice');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});

it('dedupes mentions sharing the same profile_url', () => {
    const alice = makeMention('@alice');
    const bob = makeMention('@bob');
    stubMeasurements(400, {
        [alice.profile_url]: 100,
        [bob.profile_url]: 100,
    });

    render(<MentionChips mentions={[alice, alice, bob]} />);

    expect(visibleChips().getAllByRole('link')).toHaveLength(2);
});

it('collapses the rightmost mention to an avatar-only chip when space is tight', () => {
    const alice = makeMention('@alice');
    const bob = makeMention('@bob');
    // 2 full (200) + 1 gap (8) = 208, doesn't fit 150.
    // 1 full (100) + 1 avatar (40) + 1 gap (8) = 148, fits 150.
    stubMeasurements(150, {
        [alice.profile_url]: 100,
        [bob.profile_url]: 100,
    });

    render(<MentionChips mentions={[alice, bob]} />);

    expect(visibleChips().getByText('alice')).toBeInTheDocument();
    expect(visibleChips().queryByText('bob')).not.toBeInTheDocument();
    expect(visibleChips().getByTitle('bob')).toBeInTheDocument();
});

it('hides excess mentions behind a "+N" badge when even avatar-only chips do not all fit', () => {
    const alice = makeMention('@alice');
    const bob = makeMention('@bob');
    const carol = makeMention('@carol');
    // 1 avatar (40) + (gap 8 + badge 56) = 104, fits 110; 2 avatars don't.
    stubMeasurements(110, {
        [alice.profile_url]: 100,
        [bob.profile_url]: 100,
        [carol.profile_url]: 100,
    });

    render(<MentionChips mentions={[alice, bob, carol]} />);

    expect(visibleChips().getByTitle('alice')).toBeInTheDocument();
    expect(visibleChips().queryByTitle('bob')).not.toBeInTheDocument();
    expect(visibleChips().queryByTitle('carol')).not.toBeInTheDocument();
    expect(visibleChips().getByText('+2')).toBeInTheDocument();
});

it('re-collapses chips when the container is resized after mount', () => {
    const alice = makeMention('@alice');
    const bob = makeMention('@bob');
    stubMeasurements(400, {
        [alice.profile_url]: 100,
        [bob.profile_url]: 100,
    });

    // stubMeasurements only covers the initial synchronous read. To exercise
    // the ResizeObserver path itself, replace the global with a fake that
    // captures the callback MentionChips registers, so the test can invoke
    // it directly to simulate a later resize.
    let resizeCallback: ResizeObserverCallback | undefined;

    class CapturingResizeObserver {
        constructor(callback: ResizeObserverCallback) {
            resizeCallback = callback;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', CapturingResizeObserver);

    render(<MentionChips mentions={[alice, bob]} />);

    // At 400px both mentions fit as full chips.
    expect(visibleChips().getByText('alice')).toBeInTheDocument();
    expect(visibleChips().getByText('bob')).toBeInTheDocument();

    // Simulate the container shrinking to 150px — matches the "collapses the
    // rightmost mention" test's math: 1 full (100) + 1 avatar (40) + 1 gap
    // (8) = 148 fits 150, but 2 full (200) + 1 gap (8) = 208 doesn't.
    act(() => {
        resizeCallback?.(
            [{ contentRect: { width: 150 } } as ResizeObserverEntry],
            new CapturingResizeObserver(() => {}) as unknown as ResizeObserver,
        );
    });

    expect(visibleChips().getByText('alice')).toBeInTheDocument();
    expect(visibleChips().queryByText('bob')).not.toBeInTheDocument();
    expect(visibleChips().getByTitle('bob')).toBeInTheDocument();
});

it('collapses every mention to avatar-only in a narrow container matching the reply/quote preview card width', () => {
    // ContextPanel constrains MentionChips to roughly 40ch of content width
    // (after its own padding) — the real call site the old hardcoded
    // maxVisible={2} cap protected before being replaced by real
    // measurement. None of these 4 mentions fit as full chips at 200px:
    // 4 avatars (160) + 3 gaps (24) = 184 fits 200, but even 1 full (110) +
    // 3 avatars (120) + 3 gaps (24) = 254 does not.
    const mentions = [
        makeMention('@alice'),
        makeMention('@bob'),
        makeMention('@carol'),
        makeMention('@dave'),
    ];
    stubMeasurements(200, {
        [mentions[0].profile_url]: 110,
        [mentions[1].profile_url]: 110,
        [mentions[2].profile_url]: 110,
        [mentions[3].profile_url]: 110,
    });

    render(<MentionChips mentions={mentions} />);

    expect(visibleChips().getByTitle('alice')).toBeInTheDocument();
    expect(visibleChips().getByTitle('bob')).toBeInTheDocument();
    expect(visibleChips().getByTitle('carol')).toBeInTheDocument();
    expect(visibleChips().getByTitle('dave')).toBeInTheDocument();
    expect(visibleChips().queryByText(/^\+/)).not.toBeInTheDocument();
});
