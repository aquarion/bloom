<?php

namespace App\Services\Feed;

class PostNormalizer
{
    private MentionClassifier $mentionClassifier;

    public function __construct()
    {
        $this->mentionClassifier = new MentionClassifier;
    }

    public function fromMastodon(array $status, string $host, ?array $parentStatus = null, string $sourceHandle = '', ?array $quoteStatus = null): array
    {
        $source = $status['reblog'] ?? $status;
        $sourceHost = isset($status['reblog'])
            ? (parse_url($source['url'], PHP_URL_HOST) ?? $host)
            : $host;

        $boosterAccount = isset($status['reblog']) ? $status['account'] : null;
        $booster = $boosterAccount
            ? ($boosterAccount['display_name'] ?: $boosterAccount['acct'])
            : null;

        $emojis = $this->buildEmojiMap(array_merge(
            $source['emojis'] ?? [],
            $source['account']['emojis'] ?? [],
            $status['account']['emojis'] ?? [],
        ));

        $card = $source['card'] ?? null;
        $cardUrl = $card ? ($this->safeUrl($card['url'] ?? '') ?: null) : null;
        $linkUrl = $cardUrl
            ?? $this->extractFirstLinkFromHtml($source['content'])
            ?? $this->extractFirstLink(html_entity_decode(strip_tags($source['content']), ENT_QUOTES | ENT_HTML5, 'UTF-8'));

        return [
            'id' => "mastodon_{$status['id']}",
            'source' => 'mastodon',
            'source_handle' => $sourceHandle,
            'author_name' => $source['account']['display_name'] ?: $source['account']['acct'],
            'author_handle' => str_contains($source['account']['acct'], '@')
                ? "@{$source['account']['acct']}"
                : "@{$source['account']['acct']}@{$sourceHost}",
            'author_avatar' => $this->safeUrl($source['account']['avatar']),
            'author_banner' => $this->safeUrl($source['account']['header'] ?? '') ?: null,
            ...$this->buildMastodonBody($source['content'], $status['mentions'] ?? [], $parentStatus, $quoteStatus, $source),
            'media' => $this->normaliseMastodonMedia($source['media_attachments'] ?? []),
            'created_at' => $source['created_at'],
            'original_url' => $this->safeUrl($source['url']),
            'link_url' => $linkUrl,
            'link_title' => $card ? ($card['title'] ?? null) : null,
            'link_favicon' => $this->faviconUrl($linkUrl),
            'reply_to' => $this->mastodonReplyTo($parentStatus, $host),
            'quoted_post' => $this->mastodonQuotedPost($source, $host, $quoteStatus),
            'boosted_by' => $booster,
            'boosted_by_avatar' => $boosterAccount ? $this->safeUrl($boosterAccount['avatar'] ?? '') : null,
            'boosted_by_handle' => $boosterAccount ? '@'.$boosterAccount['acct'] : null,
            'boosted_by_created_at' => $boosterAccount ? ($status['created_at'] ?? null) : null,
            'emojis' => $emojis,
            'hashtags' => array_values(array_unique(array_map(
                fn ($t) => mb_strtolower($t['name'] ?? '', 'UTF-8'),
                $source['tags'] ?? []
            ))),
            'cw_text' => isset($source['spoiler_text']) && $source['spoiler_text'] !== '' ? $source['spoiler_text'] : null,
            'sensitive_media' => (bool) ($source['sensitive'] ?? false),
        ];
    }

    public function fromBluesky(array $feedPost, string $sourceHandle = ''): array
    {
        $post = $feedPost['post'];
        $record = $post['record'];
        $author = $post['author'];

        $reason = $feedPost['reason'] ?? null;
        $repostBy = ($reason && ($reason['$type'] ?? '') === 'app.bsky.feed.defs#reasonRepost')
            ? ($reason['by'] ?? null)
            : null;
        $booster = $repostBy
            ? ($repostBy['displayName'] ?? $repostBy['handle'] ?? null)
            : null;

        $text = $record['text'] ?? '';
        $externalData = $this->blueskyExternalData($post['embed'] ?? null);
        $linkUrl = $externalData['url'] ?? $this->extractFirstLink($text);

        preg_match_all('/#([\p{L}\p{N}_]+)/u', $text, $tagMatches);
        $hashtags = array_values(array_unique(array_map(
            fn ($t) => mb_strtolower($t, 'UTF-8'),
            $tagMatches[1]
        )));

        $labelData = $this->blueskyLabels($post);

        return [
            'id' => "bluesky_{$post['uri']}",
            'source' => 'bluesky',
            'source_handle' => $sourceHandle,
            'author_name' => $author['displayName'] ?: $author['handle'],
            'author_handle' => '@'.$author['handle'],
            'author_avatar' => $this->safeUrl($author['avatar'] ?? ''),
            'author_banner' => $this->safeUrl($author['banner'] ?? '') ?: null,
            'body' => $this->truncateBody($this->stripHashtags($this->stripUrls($text)), config('feed.body_limit', 1024)),
            'media' => $this->normaliseBlueskyMedia($post['embed'] ?? null),
            'created_at' => $record['createdAt'],
            'original_url' => $this->blueskyPostUrl($author['handle'], $post['uri']),
            'link_url' => $linkUrl,
            'link_title' => $externalData['title'] ?? null,
            'link_favicon' => $this->faviconUrl($linkUrl),
            'reply_to' => $this->blueskyReplyTo($feedPost['reply']['parent'] ?? null),
            'quoted_post' => $this->blueskyQuotedPost($post['embed'] ?? null),
            'boosted_by' => $booster,
            'boosted_by_avatar' => $repostBy ? $this->safeUrl($repostBy['avatar'] ?? '') : null,
            'boosted_by_handle' => $repostBy ? '@'.($repostBy['handle'] ?? '') : null,
            'boosted_by_created_at' => $repostBy ? ($reason['indexedAt'] ?? null) : null,
            'emojis' => [],
            'hashtags' => $hashtags,
            'cw_text' => $labelData['cw_text'],
            'sensitive_media' => $labelData['sensitive_media'],
        ];
    }

    /**
     * @return array{body: string, chip_mentions: array}
     */
    private function buildMastodonBody(string $content, array $apiMentions, ?array $parentStatus, ?array $quoteStatus, array $source): array
    {
        $originAcct = $parentStatus['account']['acct'] ?? ($source['quote']['quoted_status']['account']['acct'] ?? $quoteStatus['account']['acct'] ?? null);
        $extracted = $this->extractBody($content, $apiMentions, $originAcct);

        return [
            'body' => $this->truncateBody($extracted['body'], config('feed.body_limit', 1024)),
            'chip_mentions' => $extracted['chip_mentions'],
        ];
    }

    private function mastodonReplyTo(?array $parent, string $fallbackHost): ?array
    {
        if ($parent === null) {
            return null;
        }

        $parentHost = parse_url($parent['url'] ?? '', PHP_URL_HOST) ?? $fallbackHost;

        return [
            'author_name' => $parent['account']['display_name'] ?: $parent['account']['acct'],
            'author_handle' => str_contains($parent['account']['acct'], '@')
                ? "@{$parent['account']['acct']}"
                : "@{$parent['account']['acct']}@{$parentHost}",
            'author_avatar' => $this->safeUrl($parent['account']['avatar'] ?? ''),
            'original_url' => $this->safeUrl($parent['url'] ?? ''),
            'body' => $this->truncateBody(
                $this->extractBody($parent['content'])['body']
            ),
            'created_at' => $parent['created_at'] ?? null,
        ];
    }

    private function mastodonQuotedPost(array $source, string $host, ?array $quoteStatus): ?array
    {
        $inlineQuote = $source['quote'] ?? null;
        // Mastodon 4.3+ wraps the quote as { state, quoted_status }.
        // array_key_exists (not isset) so that null quoted_status (pending/rejected) falls through correctly.
        $raw = (is_array($inlineQuote) && array_key_exists('quoted_status', $inlineQuote))
            ? ($inlineQuote['quoted_status'] ?? $quoteStatus)
            : ($inlineQuote ?? $quoteStatus);

        if ($raw === null) {
            return null;
        }

        $acct = $raw['account']['acct'] ?? '';
        $quoteHost = parse_url($raw['url'] ?? '', PHP_URL_HOST) ?? $host;

        return [
            'author_name' => ($raw['account']['display_name'] ?? '') ?: $acct,
            'author_handle' => str_contains($acct, '@') ? "@{$acct}" : "@{$acct}@{$quoteHost}",
            'author_avatar' => $this->safeUrl($raw['account']['avatar'] ?? ''),
            'original_url' => $this->safeUrl($raw['url'] ?? ''),
            'body' => $this->truncateBody($this->extractBody($raw['content'] ?? '')['body']),
            'created_at' => $raw['created_at'] ?? null,
        ];
    }

    private function blueskyReplyTo(?array $parent): ?array
    {
        if ($parent === null || ! isset($parent['record']['text'])) {
            return null;
        }

        $handle = $parent['author']['handle'] ?? '';

        return [
            'author_name' => ($parent['author']['displayName'] ?? '') ?: $handle,
            'author_handle' => '@'.$handle,
            'author_avatar' => $this->safeUrl($parent['author']['avatar'] ?? ''),
            'original_url' => $this->blueskyPostUrl($handle, $parent['uri'] ?? ''),
            'body' => $this->truncateBody($parent['record']['text']),
            'created_at' => $parent['record']['createdAt'] ?? null,
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
            'author_name' => ($record['author']['displayName'] ?? '') ?: $handle,
            'author_handle' => '@'.$handle,
            'author_avatar' => $this->safeUrl($record['author']['avatar'] ?? ''),
            'original_url' => $this->blueskyPostUrl($handle, $record['uri'] ?? ''),
            'body' => $this->truncateBody($text),
            'created_at' => $record['value']['createdAt'] ?? null,
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
                'url' => $this->safeUrl($a['url'] ?? ''),
                'preview_url' => $this->safeUrl($a['preview_url'] ?? '') ?: null,
                'alt_text' => $a['description'] ?: null,
            ];
        }, $attachments)));
    }

    private function normaliseBlueskyMedia(?array $embed): array
    {
        if ($embed === null) {
            return [];
        }

        if (($embed['$type'] ?? '') === 'app.bsky.embed.images#view') {
            return array_map(fn ($img) => [
                'type' => 'image',
                'url' => $this->safeUrl($img['fullsize'] ?? ''),
                'preview_url' => $this->safeUrl($img['thumb'] ?? ''),
                'alt_text' => $img['alt'] ?: null,
            ], $embed['images'] ?? []);
        }

        if (($embed['$type'] ?? '') === 'app.bsky.embed.video#view') {
            $playlist = $this->safeUrl($embed['playlist'] ?? '');
            if ($playlist === '') {
                return [];
            }

            return [[
                'type' => 'video',
                'url' => $playlist,
                'preview_url' => $this->safeUrl($embed['thumbnail'] ?? '') ?: null,
                'alt_text' => $embed['alt'] ?? null,
            ]];
        }

        return [];
    }

    private function extractBody(string $html, array $apiMentions = [], ?string $originAcct = null): array
    {
        $withBreaks = str_replace(['</p>', '<br>', '<br/>'], "\n", $html);
        $text = html_entity_decode(strip_tags($withBreaks), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = preg_replace('/\n{3,}/', "\n\n", $text);
        $text = $this->stripHashtags($this->stripUrls(trim($text)));

        return $this->classifyMastodonMentions($text, $apiMentions, $originAcct);
    }

    /**
     * @param  array<int, array{id?: string, username?: string, url?: string, acct?: string}>  $apiMentions  The status's top-level 'mentions' array.
     * @return array{body: string, chip_mentions: array<int, array{handle: string, display_name: string, avatar: string, profile_url: string}>}
     */
    private function classifyMastodonMentions(string $plainText, array $apiMentions, ?string $originAcct): array
    {
        if (empty($apiMentions)) {
            return ['body' => $plainText, 'chip_mentions' => []];
        }

        $byAcct = [];
        $detected = [];

        foreach ($apiMentions as $m) {
            $acct = $m['acct'] ?? '';
            if ($acct === '') {
                continue;
            }
            $pattern = '/@'.preg_quote($acct, '/').'\b/';
            if (preg_match($pattern, $plainText, $match, PREG_OFFSET_CAPTURE)) {
                $start = $match[0][1];
                $end = $start + strlen($match[0][0]);
                $detected[] = ['id' => $acct, 'start' => $start, 'end' => $end];
                $byAcct[$acct] = $m;
            }
        }

        if (empty($detected)) {
            return ['body' => $plainText, 'chip_mentions' => []];
        }

        $classified = $this->mentionClassifier->classify($plainText, $detected, $originAcct);

        $chipMentions = [];
        $body = $plainText;
        $removed = 0;

        foreach ($classified as $mention) {
            if ($mention['role'] !== MentionClassifier::ROLE_CHIP) {
                continue;
            }

            $apiMention = $byAcct[$mention['id']];
            $chipMentions[] = [
                'handle' => '@'.$apiMention['acct'],
                'display_name' => '@'.$apiMention['acct'],
                'avatar' => '',
                'profile_url' => $this->safeUrl($apiMention['url']),
            ];

            $start = $mention['start'] - $removed;
            $length = $mention['end'] - $mention['start'];
            $body = substr($body, 0, $start).substr($body, $start + $length);
            $removed += $length;
        }

        $body = trim(preg_replace('/[ \t]{2,}/', ' ', $body) ?? $body);

        return ['body' => $body, 'chip_mentions' => $chipMentions];
    }

    private function stripUrls(string $text): string
    {
        $stripped = preg_replace(
            [
                '/https?:\/\/\S+/',
                '/(?<![.@\w])[a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9][a-zA-Z0-9-]*)+\/\S+/',
            ],
            '',
            $text
        );

        if ($stripped === null) {
            return $text;
        }

        return trim(preg_replace('/[ \t]{2,}/', ' ', $stripped) ?? $stripped);
    }

    private function stripHashtags(string $text): string
    {
        $stripped = preg_replace('/#[\p{L}\p{N}_]+/u', '', $text);

        if ($stripped === null) {
            return $text;
        }

        $stripped = preg_replace('/\n{3,}/', "\n\n", $stripped) ?? $stripped;

        return trim(preg_replace('/[ \t]{2,}/', ' ', $stripped) ?? $stripped);
    }

    private function extractFirstLink(string $text): ?string
    {
        $result = preg_match(
            '/(?:https?:\/\/\S+|(?<![.@\w])[a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9][a-zA-Z0-9-]*)+\/\S+)/',
            $text,
            $m
        );

        if (! $result) {
            return null;
        }

        $url = rtrim($m[0], '.,;!?)>');

        if (! str_starts_with($url, 'http')) {
            $url = 'https://'.$url;
        }

        return $this->safeUrl($url) ?: null;
    }

    private function extractFirstLinkFromHtml(string $html): ?string
    {
        preg_match_all('/<a\s([^>]*)href="(https?:\/\/[^"#][^"]*)"([^>]*)>/i', $html, $matches, PREG_SET_ORDER);
        foreach ($matches as $match) {
            $attrs = $match[1].$match[3];
            if (preg_match('/\bclass="[^"]*\b(?:mention|hashtag)\b/i', $attrs)) {
                continue;
            }

            return $this->safeUrl($match[2]) ?: null;
        }

        return null;
    }

    private function blueskyExternalData(?array $embed): array
    {
        if ($embed === null) {
            return [];
        }
        $type = $embed['$type'] ?? '';
        if ($type === 'app.bsky.embed.external#view') {
            $ext = $embed['external'] ?? [];

            return [
                'url' => $this->safeUrl($ext['uri'] ?? '') ?: null,
                'title' => $ext['title'] ?? null,
            ];
        }
        if ($type === 'app.bsky.embed.recordWithMedia#view') {
            $media = $embed['media'] ?? null;
            if (($media['$type'] ?? '') === 'app.bsky.embed.external#view') {
                $ext = $media['external'] ?? [];

                return [
                    'url' => $this->safeUrl($ext['uri'] ?? '') ?: null,
                    'title' => $ext['title'] ?? null,
                ];
            }
        }

        return [];
    }

    private function blueskyLabels(array $post): array
    {
        $labels = array_map(fn ($l) => $l['val'] ?? '', $post['labels'] ?? []);
        $adultLabels = ['sexual', 'nudity', 'porn'];
        $graphicLabels = ['graphic-media', 'gore'];
        $mediaLabels = array_merge($adultLabels, $graphicLabels);

        $cwText = null;
        if (array_intersect($labels, $adultLabels)) {
            $cwText = 'Adult content';
        } elseif (array_intersect($labels, $graphicLabels)) {
            $cwText = 'Graphic media';
        } elseif (! empty($labels)) {
            $cwText = 'Content warning';
        }

        return [
            'cw_text' => $cwText,
            'sensitive_media' => ! empty(array_intersect($labels, $mediaLabels)),
        ];
    }

    private function truncateUrls(string $text): string
    {
        return preg_replace_callback(
            '/https?:\/\/\S+/',
            fn ($m) => strlen($m[0]) > 39 ? substr($m[0], 0, 39).'…' : $m[0],
            $text
        );
    }

    private function truncateBody(string $text, ?int $limit = null): string
    {
        $text = $this->truncateUrls($text);
        $limit ??= config('feed.context_body_limit', 300);

        return mb_strlen($text) > $limit ? mb_substr($text, 0, $limit).'…' : $text;
    }

    private function blueskyPostUrl(string $handle, string $uri): string
    {
        $rkey = basename($uri);

        return "https://bsky.app/profile/{$handle}/post/{$rkey}";
    }

    private function buildEmojiMap(array $emojis): array
    {
        $map = [];

        foreach ($emojis as $emoji) {
            $shortcode = $emoji['shortcode'] ?? null;
            $url = $this->safeUrl($emoji['url'] ?? '');

            if ($shortcode && $url) {
                $map[$shortcode] = $url;
            }
        }

        return $map;
    }

    private function faviconUrl(?string $linkUrl): ?string
    {
        if (! $linkUrl) {
            return null;
        }

        $domain = parse_url($linkUrl, PHP_URL_HOST);

        return $domain ? "https://favicone.com/{$domain}" : null;
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
