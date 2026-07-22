export function getXsrfToken(): string {
    const token = document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1];

    if (!token) {
        throw new Error('Session expired. Please refresh the page.');
    }

    return decodeURIComponent(token);
}
