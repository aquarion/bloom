const PANEL_BASE_CLASS =
    'rounded border border-white/20 bg-black/40 px-4 py-3 text-left text-sm text-white/70 backdrop-blur-sm';

export const PANEL_CLASS = `max-w-[40ch] ${PANEL_BASE_CLASS}`;

export function getPanelClass({
    fullWidth = false,
}: {
    fullWidth?: boolean;
} = {}): string {
    return fullWidth ? `w-full ${PANEL_BASE_CLASS}` : PANEL_CLASS;
}
