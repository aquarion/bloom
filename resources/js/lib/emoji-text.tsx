const SHORTCODE_RE = /:([a-zA-Z0-9_]+):/g;

function renderEmojiText(
    text: string,
    emojis: Record<string, string>,
): React.ReactNode[] {
    if (Object.keys(emojis).length === 0) {
        return [text];
    }

    const nodes: React.ReactNode[] = [];
    let last = 0;
    let match: RegExpExecArray | null;

    SHORTCODE_RE.lastIndex = 0;
    match = SHORTCODE_RE.exec(text);

    while (match !== null) {
        const [full, shortcode] = match;
        const url = emojis[shortcode];

        if (last < match.index) {
            nodes.push(text.slice(last, match.index));
        }

        if (url) {
            nodes.push(
                <img
                    key={match.index}
                    src={url}
                    alt={full}
                    className="inline-block h-[1em] w-[1em] align-middle"
                />,
            );
        } else {
            nodes.push(full);
        }

        last = match.index + full.length;
        match = SHORTCODE_RE.exec(text);
    }

    if (last < text.length) {
        nodes.push(text.slice(last));
    }

    return nodes;
}

export function EmojiText({
    text,
    emojis,
}: {
    text: string;
    emojis: Record<string, string>;
}) {
    return <>{renderEmojiText(text, emojis)}</>;
}
