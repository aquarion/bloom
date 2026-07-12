export function timeSince(dateStr: string): string {
    const seconds = Math.floor(
        (Date.now() - new Date(dateStr).getTime()) / 1000,
    );
    // Every existing call site passes a past timestamp, so `future` is always
    // false there and output is unchanged. Poll expiry is the first caller
    // that can pass a future date.
    const future = seconds < 0;
    const abs = Math.abs(seconds);

    if (abs < 60) {
        return future ? 'shortly' : 'just now';
    }

    const minutes = Math.floor(abs / 60);

    if (minutes < 60) {
        return future ? `in ${minutes}m` : `${minutes}m ago`;
    }

    const hours = Math.floor(minutes / 60);

    if (hours < 24) {
        return future ? `in ${hours}h` : `${hours}h ago`;
    }

    const days = Math.floor(hours / 24);

    return future ? `in ${days}d` : `${days}d ago`;
}

export function absoluteTime(dateStr: string): string {
    return new Date(dateStr).toLocaleString();
}
