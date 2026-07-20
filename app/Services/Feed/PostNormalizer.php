<?php

namespace App\Services\Feed;

use Illuminate\Support\Facades\Log;

class PostNormalizer
{
    private MentionClassifier $mentionClassifier;

    public function __construct()
    {
        $this->mentionClassifier = new MentionClassifier;
    }

    public function fromMastodon(array $status, string $host, ?array $parentStatus = null, ?string $sourceHandle = '', ?array $quoteStatus = null, bool $mentionsEnabled = true): array
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
            'source_instance' => $host,
            'author_name' => $source['account']['display_name'] ?: $source['account']['acct'],
            'author_handle' => str_contains($source['account']['acct'], '@')
                ? "@{$source['account']['acct']}"
                : "@{$source['account']['acct']}@{$sourceHost}",
            'author_avatar' => $this->safeUrl($source['account']['avatar']),
            'author_banner' => $this->safeUrl($source['account']['header'] ?? '') ?: null,
            ...$this->buildMastodonBody($source['content'], $status['mentions'] ?? [], $parentStatus, $quoteStatus, $source, $mentionsEnabled),
            'media' => $this->normaliseMastodonMedia($source['media_attachments'] ?? []),
            'created_at' => $source['created_at'],
            'original_url' => $this->safeUrl($source['url']),
            'link_url' => $linkUrl,
            'link_title' => $card ? ($card['title'] ?? null) : null,
            'link_description' => $card ? (($card['description'] ?? '') ?: null) : null,
            'link_image' => $card ? ($this->safeUrl($card['image'] ?? '') ?: null) : null,
            'link_favicon' => $this->faviconUrl($linkUrl),
            'link_youtube_id' => $this->youtubeVideoId($linkUrl),
            'reply_to' => $this->mastodonReplyTo($parentStatus, $host, $mentionsEnabled),
            'quoted_post' => $this->mastodonQuotedPost($source, $host, $quoteStatus, $mentionsEnabled),
            'poll' => $this->normalizeMastodonPoll($source),
            'boosted_by' => $booster,
            'boosted_by_avatar' => $boosterAccount ? $this->safeUrl($boosterAccount['avatar'] ?? '') : null,
            'boosted_by_handle' => $boosterAccount ? '@'.$boosterAccount['acct'] : null,
            'boosted_by_created_at' => $boosterAccount ? ($status['created_at'] ?? null) : null,
            'emojis' => $emojis,
            'hashtags' => $this->hashtagLinks(array_values(array_unique(array_map(
                fn ($t) => mb_strtolower($t['name'] ?? '', 'UTF-8'),
                $source['tags'] ?? []
            ))), 'mastodon', $host),
            ...$this->mastodonCwFields($source),
        ];
    }

    public function fromBluesky(array $feedPost, string $sourceHandle = '', bool $mentionsEnabled = true): array
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

        $originDid = ($feedPost['reply']['parent']['author']['did'] ?? null)
            ?? ($this->blueskyQuotedAuthorDid($post['embed'] ?? null));
        // Must classify on the raw $text — facet byteStart/byteEnd offsets index into the
        // untransformed text, and stripping hashtags/URLs first would shift those positions.
        $mentionResult = $mentionsEnabled
            ? $this->classifyBlueskyMentions($text, $record['facets'] ?? [], $originDid)
            : ['body' => $text, 'chip_mentions' => []];
        $body = $this->truncateBody($this->stripHashtags($this->stripUrls($mentionResult['body'])), config('feed.body_limit', 1024));

        return [
            'id' => "bluesky_{$post['uri']}",
            'source' => 'bluesky',
            'source_handle' => $sourceHandle,
            'source_instance' => null,
            'author_name' => ($author['displayName'] ?? '') ?: $author['handle'],
            'author_handle' => '@'.$author['handle'],
            'author_avatar' => $this->safeUrl($author['avatar'] ?? ''),
            'author_banner' => $this->safeUrl($author['banner'] ?? '') ?: null,
            'body' => $body,
            'media' => $this->normaliseBlueskyMedia($post['embed'] ?? null),
            'created_at' => $record['createdAt'],
            'original_url' => $this->blueskyPostUrl($author['handle'], $post['uri']),
            'link_url' => $linkUrl,
            'link_title' => $externalData['title'] ?? null,
            'link_description' => $externalData['description'] ?? null,
            'link_image' => $externalData['image'] ?? null,
            'link_favicon' => $this->faviconUrl($linkUrl),
            'link_youtube_id' => $this->youtubeVideoId($linkUrl),
            'reply_to' => $this->blueskyReplyTo($feedPost['reply']['parent'] ?? null, $mentionsEnabled),
            'quoted_post' => $this->blueskyQuotedPost($post['embed'] ?? null, $mentionsEnabled),
            'boosted_by' => $booster,
            'boosted_by_avatar' => $repostBy ? $this->safeUrl($repostBy['avatar'] ?? '') : null,
            'boosted_by_handle' => $repostBy ? '@'.($repostBy['handle'] ?? '') : null,
            'boosted_by_created_at' => $repostBy ? ($reason['indexedAt'] ?? null) : null,
            'emojis' => [],
            'hashtags' => $this->hashtagLinks($hashtags, 'bluesky', null),
            ...$labelData,
            'chip_mentions' => $mentionResult['chip_mentions'],
        ];
    }

    /**
     * Mastodon's content-warning is a single freeform author-authored string (`spoiler_text`)
     * with no label taxonomy, unlike Bluesky's moderation labels — so every self-applied
     * Mastodon CW buckets into the catch-all 'generic' category.
     *
     * @return array{cw_text: ?string, cw_is_author_level: bool, cw_label_source: ?string, cw_category: ?string, cw_categories: array<int, string>, sensitive_media: bool}
     */
    private function mastodonCwFields(array $source): array
    {
        $hasSpoilerText = isset($source['spoiler_text']) && $source['spoiler_text'] !== '';

        return [
            'cw_text' => $hasSpoilerText ? $source['spoiler_text'] : null,
            'cw_is_author_level' => false,
            'cw_label_source' => $hasSpoilerText ? 'self' : null,
            'cw_category' => $hasSpoilerText ? 'generic' : null,
            'cw_categories' => $hasSpoilerText ? ['generic'] : [],
            'sensitive_media' => (bool) ($source['sensitive'] ?? false),
        ];
    }

    /**
     * @return array{body: string, chip_mentions: array}
     */
    private function buildMastodonBody(string $content, array $apiMentions, ?array $parentStatus, ?array $quoteStatus, array $source, bool $mentionsEnabled): array
    {
        if (! $mentionsEnabled) {
            $extracted = $this->extractBody($content, [], null);

            return [
                'body' => $this->truncateBody($extracted['body'], config('feed.body_limit', 1024)),
                'chip_mentions' => [],
            ];
        }

        $originAcct = $parentStatus['account']['acct'] ?? ($source['quote']['quoted_status']['account']['acct'] ?? $quoteStatus['account']['acct'] ?? null);
        $extracted = $this->extractBody($content, $apiMentions, $originAcct);

        return [
            'body' => $this->truncateBody($extracted['body'], config('feed.body_limit', 1024)),
            'chip_mentions' => $extracted['chip_mentions'],
        ];
    }

    /**
     * @return array{body: string, chip_mentions: array}
     */
    private function buildNestedMastodonBody(string $content, array $mentions, bool $mentionsEnabled): array
    {
        if (! $mentionsEnabled) {
            return [
                'body' => $this->truncateBody($this->extractBody($content, [], null)['body']),
                'chip_mentions' => [],
            ];
        }

        // No grandparent post is fetched for replies/quotes, so there's no
        // origin handle to compare a leading mention against here.
        $extracted = $this->extractBody($content, $mentions, null);

        return [
            'body' => $this->truncateBody($extracted['body']),
            'chip_mentions' => $extracted['chip_mentions'],
        ];
    }

    private function mastodonReplyTo(?array $parent, string $fallbackHost, bool $mentionsEnabled): ?array
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
            ...$this->buildNestedMastodonBody($parent['content'], $parent['mentions'] ?? [], $mentionsEnabled),
            ...$this->mastodonCwFields($parent),
            'created_at' => $parent['created_at'] ?? null,
        ];
    }

    private function mastodonQuotedPost(array $source, string $host, ?array $quoteStatus, bool $mentionsEnabled): ?array
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
            ...$this->buildNestedMastodonBody($raw['content'] ?? '', $raw['mentions'] ?? [], $mentionsEnabled),
            ...$this->mastodonCwFields($raw),
            'created_at' => $raw['created_at'] ?? null,
        ];
    }

    /**
     * @return array{id: string, expires_at: ?string, expired: bool, multiple: bool, votes_count: int, options: array<int, array{title: string, votes_count: ?int}>, voted: bool, own_votes: array<int, int>}|null
     */
    private function normalizeMastodonPoll(array $source): ?array
    {
        $poll = $source['poll'] ?? null;

        if ($poll === null) {
            return null;
        }

        // options may be entirely absent, non-array, or contain non-array entries on a
        // malformed/federated payload — filter defensively so a bad shape degrades to an
        // empty/partial list instead of throwing a TypeError out of array_map's typed closure.
        // Malformed entries are dropped (not placeholder-filled), matching the
        // FeedAggregator::dedupe() convention of logging and skipping rather than
        // silently substituting values that could look like real data.
        $rawOptions = $poll['options'] ?? [];

        if (! is_array($rawOptions)) {
            Log::warning('Mastodon poll payload has non-array options', [
                'poll_id' => $poll['id'] ?? 'unknown',
                'options_type' => get_debug_type($rawOptions),
            ]);
            $rawOptions = [];
        }

        $options = array_values(array_filter(array_map(
            function ($opt) use ($poll) {
                if (! is_array($opt)) {
                    Log::warning('Mastodon poll option entry is not an array', [
                        'poll_id' => $poll['id'] ?? 'unknown',
                        'entry_type' => get_debug_type($opt),
                    ]);

                    return null;
                }

                return [
                    'title' => $opt['title'] ?? '',
                    'votes_count' => array_key_exists('votes_count', $opt) ? $opt['votes_count'] : 0,
                ];
            },
            $rawOptions,
        )));

        return [
            // 'id' is typed as a required string on the frontend Poll type — default to
            // '' rather than null so a malformed payload can't violate that contract.
            'id' => $poll['id'] ?? '',
            'expires_at' => $poll['expires_at'] ?? null,
            'expired' => (bool) ($poll['expired'] ?? false),
            'multiple' => (bool) ($poll['multiple'] ?? false),
            'votes_count' => $poll['votes_count'] ?? 0,
            'options' => $options,
            'voted' => (bool) ($poll['voted'] ?? false),
            'own_votes' => $poll['own_votes'] ?? [],
        ];
    }

    private function blueskyReplyTo(?array $parent, bool $mentionsEnabled): ?array
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
            ...$this->buildNestedBlueskyBody($parent['record']['text'], $parent['record']['facets'] ?? [], $mentionsEnabled),
            ...$this->blueskyLabels($parent),
            'created_at' => $parent['record']['createdAt'] ?? null,
        ];
    }

    private function blueskyQuotedPost(?array $embed, bool $mentionsEnabled): ?array
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
            ...$this->buildNestedBlueskyBody($text, $record['value']['facets'] ?? [], $mentionsEnabled),
            ...$this->blueskyLabels($record),
            'created_at' => $record['value']['createdAt'] ?? null,
        ];
    }

    private function blueskyQuotedAuthorDid(?array $embed): ?string
    {
        if ($embed === null) {
            return null;
        }

        $type = $embed['$type'] ?? '';
        $record = $type === 'app.bsky.embed.record#view' ? ($embed['record'] ?? null)
            : ($type === 'app.bsky.embed.recordWithMedia#view' ? ($embed['record']['record'] ?? null) : null);

        return $record['author']['did'] ?? null;
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

        if (($embed['$type'] ?? '') === 'app.bsky.embed.recordWithMedia#view') {
            return $this->normaliseBlueskyMedia($embed['media'] ?? null);
        }

        return [];
    }

    private function extractBody(string $html, array $apiMentions = [], ?string $originAcct = null): array
    {
        $withBreaks = str_replace(['</p>', '<br>', '<br/>'], "\n", $html);
        $text = html_entity_decode(strip_tags($withBreaks), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = preg_replace('/\n{3,}/', "\n\n", $text) ?? $text;
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
            $username = $m['username'] ?? '';
            if ($acct === '' || $username === '') {
                continue;
            }
            // Mastodon renders mentions in the body as the bare local username
            // ("@fanf"), never the full acct ("@fanf@mendeddrum.org") — only the
            // href carries the host. Matching against $acct here would silently
            // fail to detect every remote mention.
            $pattern = '/@'.preg_quote($username, '/').'\b/';
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

            if ($mention['strip']) {
                $start = $mention['start'] - $removed;
                $length = $mention['end'] - $mention['start'];
                if ($start >= 0 && $start <= strlen($body) && $length > 0) {
                    $body = substr($body, 0, $start).substr($body, $start + $length);
                    $removed += $length;
                }
            }
        }

        $body = trim(preg_replace('/[ \t]{2,}/', ' ', $body) ?? $body);

        return ['body' => $body, 'chip_mentions' => $chipMentions];
    }

    /**
     * @return array{body: string, chip_mentions: array}
     */
    private function buildNestedBlueskyBody(string $text, array $facets, bool $mentionsEnabled): array
    {
        if (! $mentionsEnabled) {
            return ['body' => $this->truncateBody($text), 'chip_mentions' => []];
        }

        // No grandparent post is fetched for replies/quotes, so there's no
        // origin did to compare a leading mention against here.
        $result = $this->classifyBlueskyMentions($text, $facets, null);

        return [
            'body' => $this->truncateBody($result['body']),
            'chip_mentions' => $result['chip_mentions'],
        ];
    }

    /**
     * @param  array<int, array{index?: array{byteStart?: int, byteEnd?: int}, features?: array<int, array{'$type'?: string, did?: string}>}>  $facets
     * @return array{body: string, chip_mentions: array<int, array{handle: string, display_name: string, avatar: string, profile_url: string}>}
     */
    private function classifyBlueskyMentions(string $text, array $facets, ?string $originDid): array
    {
        $detected = [];

        foreach ($facets as $facet) {
            $did = null;
            foreach ($facet['features'] ?? [] as $feature) {
                if (($feature['$type'] ?? '') === 'app.bsky.richtext.facet#mention' && ! empty($feature['did'])) {
                    $did = $feature['did'];
                    break;
                }
            }

            if ($did === null) {
                continue;
            }

            $detected[] = [
                'id' => $did,
                'start' => $facet['index']['byteStart'] ?? 0,
                'end' => $facet['index']['byteEnd'] ?? 0,
            ];
        }

        if (empty($detected)) {
            return ['body' => $text, 'chip_mentions' => []];
        }

        $classified = $this->mentionClassifier->classify($text, $detected, $originDid);

        $chipMentions = [];
        $body = $text;
        $removed = 0;

        foreach ($classified as $mention) {
            // Bluesky body text has no hyperlinks, so every mention — leading, trailing, or
            // mid-text — needs a chip to be actionable. Intentionally blank: resolveMentionProfiles()
            // fills handle/display_name/avatar via a batched getProfiles call keyed on the DID.
            $chipMentions[] = [
                'handle' => '',
                'display_name' => '',
                'avatar' => '',
                'profile_url' => $mention['id'],
            ];

            if ($mention['role'] === MentionClassifier::ROLE_CHIP && $mention['strip']) {
                $start = $mention['start'] - $removed;
                $length = $mention['end'] - $mention['start'];
                // byteEnd is an exclusive offset and may equal strlen when the mention is
                // at the very end of the string — PHP's substr handles that gracefully.
                if ($start >= 0 && $start <= strlen($body) && $length > 0) {
                    $body = substr($body, 0, $start).substr($body, $start + $length);
                    $removed += $length;
                }
            }
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
            return $this->blueskyExternalFields($embed['external'] ?? []);
        }
        if ($type === 'app.bsky.embed.recordWithMedia#view') {
            $media = $embed['media'] ?? null;
            if (($media['$type'] ?? '') === 'app.bsky.embed.external#view') {
                return $this->blueskyExternalFields($media['external'] ?? []);
            }
        }

        return [];
    }

    /**
     * @param  array<string, mixed>  $ext
     * @return array{url: ?string, title: ?string, description: ?string, image: ?string}
     */
    private function blueskyExternalFields(array $ext): array
    {
        return [
            'url' => $this->safeUrl($ext['uri'] ?? '') ?: null,
            'title' => $ext['title'] ?? null,
            'description' => ($ext['description'] ?? '') ?: null,
            'image' => $this->safeUrl($ext['thumb'] ?? '') ?: null,
        ];
    }

    private function blueskyLabels(array $post): array
    {
        // Filter each label set separately so we can detect author-level CWs.
        // Authors of adult-content accounts label their profile rather than each post.
        // AT Protocol labels prefixed with '!' are behavioural/system labels (e.g.
        // '!no-unauthenticated', '!hide') — they control platform access, not content type.
        // Exclude them so they don't trigger a spurious "Content warning" overlay.
        $filter = fn (array $raw): array => array_values(array_filter(
            array_map(fn ($l) => $l['val'] ?? '', $raw),
            fn ($v) => $v !== '' && ! str_starts_with($v, '!'),
        ));

        $postLabels = $filter($post['labels'] ?? []);
        $authorLabels = $filter($post['author']['labels'] ?? []);
        $labels = array_values(array_unique(array_merge($postLabels, $authorLabels)));

        $adultLabels = ['sexual', 'nudity', 'porn'];
        $graphicLabels = ['graphic-media', 'gore'];
        $mediaLabels = array_merge($adultLabels, $graphicLabels);

        // Kept in its own whitelist category, distinct from 'generic' — a user who
        // whitelists low-stakes noise (spam, impersonation, misleading, unrecognised
        // labels) shouldn't silently also stop seeing self-harm/threat/intolerance warnings.
        $safetyLabelMap = [
            'threat' => 'threatening content',
            'intolerant' => 'intolerant content',
            'self-harm' => 'self-harm content',
        ];

        $moderationLabelMap = [
            'rude' => 'rude content',
            'spam' => 'spam',
            'impersonation' => 'impersonation',
            'misleading' => 'misleading content',
        ];

        // 'adult', 'graphic', and 'safety' map to dedicated whitelist entries (#169); every
        // other bucket — remaining moderation labels and unrecognised raw labels alike —
        // collapses to 'generic' since there's no finer-grained whitelist entry for them.
        $resolveCw = function (array $l) use ($adultLabels, $graphicLabels, $safetyLabelMap, $moderationLabelMap): array {
            if (array_intersect($l, $adultLabels)) {
                return ['text' => 'Adult content', 'category' => 'adult'];
            }
            if (array_intersect($l, $graphicLabels)) {
                return ['text' => 'Graphic media', 'category' => 'graphic'];
            }
            foreach ($l as $label) {
                if (isset($safetyLabelMap[$label])) {
                    return ['text' => $safetyLabelMap[$label], 'category' => 'safety'];
                }
            }
            foreach ($l as $label) {
                if (isset($moderationLabelMap[$label])) {
                    return ['text' => $moderationLabelMap[$label], 'category' => 'generic'];
                }
            }

            return ! empty($l) ? ['text' => $l[0], 'category' => 'generic'] : ['text' => null, 'category' => null];
        };

        // Unlike $resolveCw above (which picks a single priority-ordered category for display
        // text), this collects every distinct category touched by the label set. A post can
        // carry labels from more than one category at once (e.g. 'porn' + 'self-harm') — using
        // only the single priority-picked category to decide whitelist suppression would let an
        // 'adult'-only whitelist silently also suppress an unrelated 'safety' warning.
        $resolveCwCategories = function (array $l) use ($adultLabels, $graphicLabels, $safetyLabelMap): array {
            $categories = [];
            if (array_intersect($l, $adultLabels)) {
                $categories[] = 'adult';
            }
            if (array_intersect($l, $graphicLabels)) {
                $categories[] = 'graphic';
            }
            if (array_intersect(array_keys($safetyLabelMap), $l)) {
                $categories[] = 'safety';
            }
            // Any label not already classified above (moderation-mapped or entirely
            // unrecognised) collapses to 'generic', matching $resolveCw's fallback.
            if (array_diff($l, $adultLabels, $graphicLabels, array_keys($safetyLabelMap))) {
                $categories[] = 'generic';
            }

            return $categories;
        };

        $resolved = $resolveCw($labels);
        $cwText = $resolved['text'];
        $cwCategory = $resolved['category'];
        $cwCategories = $resolveCwCategories($labels);
        // Author-level when the post itself carries no cw-worthy labels —
        // the CW exists only because the author's profile is labelled.
        $cwIsAuthorLevel = $cwText !== null && $resolveCw($postLabels)['text'] === null;

        $cwLabelSource = null;
        if ($cwText !== null) {
            $authorDid = $post['author']['did'] ?? null;
            $cwLabelSource = 'self';
            $labelsToCheck = $cwIsAuthorLevel ? ($post['author']['labels'] ?? []) : ($post['labels'] ?? []);
            foreach ($labelsToCheck as $label) {
                $val = $label['val'] ?? '';
                if ($val === '' || str_starts_with($val, '!')) {
                    continue;
                }
                if (($label['src'] ?? '') !== $authorDid) {
                    $cwLabelSource = 'external';
                    break;
                }
            }
        }

        return [
            'cw_text' => $cwText,
            'cw_is_author_level' => $cwIsAuthorLevel,
            'cw_label_source' => $cwLabelSource,
            'cw_category' => $cwCategory,
            'cw_categories' => $cwCategories,
            'sensitive_media' => ! empty(array_intersect($labels, $mediaLabels)),
        ];
    }

    private function truncateUrls(string $text): string
    {
        return preg_replace_callback(
            '/https?:\/\/\S+/',
            fn ($m) => strlen($m[0]) > 39 ? substr($m[0], 0, 39).'…' : $m[0],
            $text
        ) ?? $text;
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

    /**
     * Extracts an 11-character YouTube video ID from watch/shorts/embed/live
     * links on youtube.com, m.youtube.com, or music.youtube.com, and from
     * youtu.be short links.
     */
    private function youtubeVideoId(?string $linkUrl): ?string
    {
        if (! $linkUrl) {
            return null;
        }

        $host = parse_url($linkUrl, PHP_URL_HOST);

        if (! $host) {
            return null;
        }

        $host = strtolower(preg_replace('/^www\./', '', $host));
        $path = parse_url($linkUrl, PHP_URL_PATH) ?? '';

        if ($host === 'youtu.be') {
            $id = trim($path, '/');

            return $this->isValidYoutubeId($id) ? $id : null;
        }

        if (! in_array($host, ['youtube.com', 'm.youtube.com', 'music.youtube.com'], true)) {
            return null;
        }

        if ($path === '/watch') {
            parse_str(parse_url($linkUrl, PHP_URL_QUERY) ?? '', $query);
            $id = $query['v'] ?? null;

            return $id && $this->isValidYoutubeId($id) ? $id : null;
        }

        if (preg_match('#^/(?:shorts|embed|live)/([^/?]+)#', $path, $matches)) {
            return $this->isValidYoutubeId($matches[1]) ? $matches[1] : null;
        }

        return null;
    }

    private function isValidYoutubeId(string $id): bool
    {
        return (bool) preg_match('/^[A-Za-z0-9_-]{11}$/', $id);
    }

    /**
     * @param  array<int, string>  $tags
     * @return array<int, array{tag: string, url: string}>
     */
    private function hashtagLinks(array $tags, string $source, ?string $sourceInstance): array
    {
        // A tag object missing its name (e.g. a malformed/federated Mastodon payload)
        // normalises to an empty string upstream — drop it rather than emit a hashtag
        // chip with no label linking to a broken URL, matching the defensive-filter
        // convention in normalizeMastodonPoll() above.
        $validTags = array_filter($tags, fn ($tag) => $tag !== '');

        if (count($validTags) !== count($tags)) {
            Log::warning('Dropped malformed hashtag entries with an empty tag name', [
                'source' => $source,
            ]);
        }

        return array_values(array_map(
            fn ($tag) => ['tag' => $tag, 'url' => $this->hashtagUrl($tag, $source, $sourceInstance)],
            $validTags,
        ));
    }

    private function hashtagUrl(string $tag, string $source, ?string $sourceInstance): string
    {
        if ($source === 'mastodon' && $sourceInstance) {
            return "https://{$sourceInstance}/tags/".rawurlencode($tag);
        }

        return 'https://bsky.app/search?q=%23'.rawurlencode($tag);
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
