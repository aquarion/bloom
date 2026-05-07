<?php

namespace App\Services\Feed;

class PostNormalizer
{
    public function fromMastodon(array $status, string $host): array
    {
        $source = $status['reblog'] ?? $status;
        $sourceHost = isset($status['reblog'])
            ? (parse_url($source['url'], PHP_URL_HOST) ?? $host)
            : $host;

        return [
            'id' => "mastodon_{$status['id']}",
            'source' => 'mastodon',
            'author_name' => $source['account']['display_name'] ?: $source['account']['acct'],
            'author_handle' => "@{$source['account']['acct']}@{$sourceHost}",
            'author_avatar' => $source['account']['avatar'],
            'body' => trim(html_entity_decode(strip_tags(str_replace(['</p>', '<br>', '<br/>'], ' ', $source['content'])), ENT_QUOTES | ENT_HTML5, 'UTF-8')),
            'media' => $this->normaliseMastodonMedia($source['media_attachments'] ?? []),
            'created_at' => $source['created_at'],
            'original_url' => $source['url'],
        ];
    }

    public function fromBluesky(array $feedPost): array
    {
        $post = $feedPost['post'];
        $record = $post['record'];
        $author = $post['author'];

        return [
            'id' => "bluesky_{$post['uri']}",
            'source' => 'bluesky',
            'author_name' => $author['displayName'] ?: $author['handle'],
            'author_handle' => '@'.$author['handle'],
            'author_avatar' => $author['avatar'] ?? '',
            'body' => $record['text'],
            'media' => $this->normaliseBlueskyMedia($post['embed'] ?? null),
            'created_at' => $record['createdAt'],
            'original_url' => $this->blueskyPostUrl($author['handle'], $post['uri']),
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

    private function blueskyPostUrl(string $handle, string $uri): string
    {
        $rkey = basename($uri);

        return "https://bsky.app/profile/{$handle}/post/{$rkey}";
    }
}
