const SHORTCUTS = [
    { key: 'j', description: 'Next post' },
    { key: 'k', description: 'Previous post' },
    { key: 'Space', description: 'Pause / resume' },
    { key: 'o', description: 'Open post' },
    { key: 'l', description: 'Open link in post' },
    { key: '?', description: 'Show / hide this overlay' },
    { key: 'h', description: 'Open / close navigation' },
    { key: 'Esc', description: 'Close overlay' },
];

export function KeyboardShortcutsOverlay({ open }: { open: boolean }) {
    if (!open) {
        return null;
    }

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70">
            <div className="rounded-lg bg-white/10 p-6 text-white backdrop-blur-sm">
                <h2 className="mb-4 font-semibold text-lg">
                    Keyboard Shortcuts
                </h2>
                <table className="w-full text-sm">
                    <tbody>
                        {SHORTCUTS.map(({ key, description }) => (
                            <tr
                                key={key}
                                className="border-white/10 border-b last:border-0"
                            >
                                <td className="py-2 pr-8">
                                    <kbd className="rounded bg-white/20 px-2 py-0.5 font-mono text-xs">
                                        {key}
                                    </kbd>
                                </td>
                                <td className="py-2 text-white/80">
                                    {description}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
