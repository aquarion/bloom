<?php

namespace App\Services\Feed;

class PostNormalizer
{
    public function fromMastodon(array $status, string $host, ?array $parentStatus = null): array
    {
        $source = $status['reblog'] ?? $status;
        $sourceHost = isset($status['reblog'])
            ? (parse_url($source['url'], PHP_URL_HOST) ?? $host)
            : $host;

        $booster = isset($status['reblog'])
            ? ($status['account']['display_name'] ?: $status['account']['acct'])
            : null;

        return [
            'id' => "mastodon_{$status['id']}",
            'source' => 'mastodon',
            'author_name' => $source['account']['display_name'] ?: $source['account']['acct'],
            'author_handle' => "@{$source['account']['acct']}@{$sourceHost}",
            'author_avatar' => $this->safeUrl($source['account']['avatar']),
            'body' => $this->extractBody($source['content']),
            'media' => $this->normaliseMastodonMedia($source['media_attachments'] ?? []),
            'created_at' => $source['created_at'],
            'original_url' => $this->safeUrl($source['url']),
            'reply_to' => $this->mastodonReplyTo($parentStatus, $host),
            'quoted_post' => null,
            'boosted_by' => $booster,
        ];
    }

    public function fromBluesky(array $feedPost): array
    {
        $post = $feedPost['post'];
        $record = $post['record'];
        $author = $post['author'];

        $reason = $feedPost['reason'] ?? null;
        $booster = ($reason && ($reason['$type'] ?? '') === 'app.bsky.feed.defs#reasonRepost')
            ? ($reason['by']['displayName'] ?? $reason['by']['handle'] ?? null)
            : null;

        return [
            'id' => "bluesky_{$post['uri']}",
            'source' => 'bluesky',
            'author_name' => $author['displayName'] ?: $author['handle'],
            'author_handle' => '@'.$author['handle'],
            'author_avatar' => $this->safeUrl($author['avatar'] ?? ''),
            'body' => $this->truncateUrls($record['text']),
            'media' => $this->normaliseBlueskyMedia($post['embed'] ?? null),
            'created_at' => $record['createdAt'],
            'original_url' => $this->blueskyPostUrl($author['handle'], $post['uri']),
            'reply_to' => $this->blueskyReplyTo($feedPost['reply']['parent'] ?? null),
            'quoted_post' => $this->blueskyQuotedPost($post['embed'] ?? null),
            'boosted_by' => $booster,
        ];
    }

    private function mastodonReplyTo(?array $parent, string $fallbackHost): ?array
    {
        if ($parent === null) {
            return null;
        }

        $parentHost = parse_url($parent['url'] ?? '', PHP_URL_HOST) ?? $fallbackHost;

        return [
            'author_handle' => "@{$parent['account']['acct']}@{$parentHost}",
            'body' => $this->truncateBody(
                $this->extractBody($parent['content'])
            ),
        ];
    }

    private function blueskyReplyTo(?array $parent): ?array
    {
        if ($parent === null || ! isset($parent['record']['text'])) {
            return null;
        }

        $handle = $parent['author']['handle'] ?? '';

        return [
            'author_handle' => '@'.$handle,
            'body' => $this->truncateBody($parent['record']['text']),
        ];
    }

    private function blueskyQuotedPost(?array $embed): ?array
    {
        if ($embed === null) {
            return null;
        }

        $type = $embed['$type'] ?? '';

        if ($type === 'app.bsky.embed.record#view') {
            $record = $embed['record'] ?? null;
        } elseif ($type === 'app.bsky.embed.recordWithMedia#view') {
            $record = $embed['record']['record'] ?? null;
        } else {
            return null;
        }

        if (($record['$type'] ?? '') !== 'app.bsky.embed.record#viewRecord') {
            return null;
        }

        $text = $record['value']['text'] ?? null;
        $handle = $record['author']['handle'] ?? null;

        if (! is_string($text) || trim($text) === '' || ! is_string($handle) || $handle === '') {
            return null;
        }

        return [
            'author_handle' => '@'.$handle,
            'body' => $this->truncateBody($text),
        ];
    }

    private function normaliseMastodonMedia(array $attachments): array
    {
        return array_values(array_filter(array_map(function ($a) {
            if (! in_array($a['type'], ['image', 'video'])) {
                return null;
            }

            return [
                'type' => $a['type'],
                'url' => $a['url'],
                'preview_url' => $a['preview_url'],
                'alt_text' => $a['description'] ?: null,
            ];
        }, $attachments)));
    }

    private function normaliseBlueskyMedia(?array $embed): array
    {
        if ($embed === null) {
            return [];
        }

        if ($embed['$type'] === 'app.bsky.embed.images#view') {
            return array_map(fn ($img) => [
                'type' => 'image',
                'url' => $img['fullsize'],
                'preview_url' => $img['thumb'],
                'alt_text' => $img['alt'] ?: null,
            ], $embed['images'] ?? []);
        }

        return [];
    }

    private function extractBody(string $html): string
    {
        $withBreaks = str_replace(['</p>', '<br>', '<br/>'], "\n", $html);
        $text = html_entity_decode(strip_tags($withBreaks), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = preg_replace('/\n{3,}/', "\n\n", $text);

        return $this->truncateUrls(trim($text));
    }

    private function truncateUrls(string $text): string
    {
        return preg_replace_callback(
            '/https?:\/\/\S+/',
            fn ($m) => strlen($m[0]) > 39 ? substr($m[0], 0, 39).'…' : $m[0],
            $text
        );
    }

    private function truncateBody(string $text, int $limit = 120): string
    {
        $text = $this->truncateUrls($text);

        return mb_strlen($text) > $limit ? mb_substr($text, 0, $limit).'…' : $text;
    }

    private function blueskyPostUrl(string $handle, string $uri): string
    {
        $rkey = basename($uri);

        return "https://bsky.app/profile/{$handle}/post/{$rkey}";
    }

    private function safeUrl(?string $url): string
    {
        if (! $url) {
            return '';
        }

        $scheme = parse_url($url, PHP_URL_SCHEME);

        return in_array($scheme, ['https', 'http'], true) ? $url : '';
    }
}
