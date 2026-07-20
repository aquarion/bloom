const PANEL_BASE_CLASS =
    'rounded border border-white/20 bg-black/40 text-left text-sm text-white/70 backdrop-blur-sm';
const PANEL_PADDING_CLASS = 'px-4 py-3';

export const PANEL_CLASS = `max-w-[40ch] ${PANEL_BASE_CLASS} ${PANEL_PADDING_CLASS}`;

export function getPanelClass({
    fullWidth = false,
    noPadding = false,
}: {
    fullWidth?: boolean;
    noPadding?: boolean;
} = {}): string {
    const width = fullWidth ? 'w-full' : 'max-w-[40ch]';
    const padding = noPadding ? '' : ` ${PANEL_PADDING_CLASS}`;

    return `${width} ${PANEL_BASE_CLASS}${padding}`;
}
