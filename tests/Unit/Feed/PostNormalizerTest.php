<?php

use App\Services\Feed\PostNormalizer;
use Tests\TestCase;

uses(TestCase::class);

it('normalises a mastodon status to unified post format', function () {
    $status = [
        'id' => '109123456789',
        'content' => '<p>hello <strong>world</strong></p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://fosstodon.org/@user/109123456789',
        'account' => [
            'display_name' => 'Test User',
            'acct' => 'user',
            'avatar' => 'https://fosstodon.org/avatars/original/user.jpg',
        ],
        'media_attachments' => [
            [
                'type' => 'image',
                'url' => 'https://fosstodon.org/media/img.jpg',
                'preview_url' => 'https://fosstodon.org/media/img_small.jpg',
                'description' => 'A photo',
            ],
        ],
    ];

    $normalizer = new PostNormalizer;
    $post = $normalizer->fromMastodon($status, 'fosstodon.org');

    expect($post['id'])->toBe('mastodon_109123456789')
        ->and($post['source'])->toBe('mastodon')
        ->and($post['body'])->toBe('hello world')
        ->and($post['author_name'])->toBe('Test User')
        ->and($post['author_handle'])->toBe('@user@fosstodon.org')
        ->and($post['author_avatar'])->toBe('https://fosstodon.org/avatars/original/user.jpg')
        ->and($post['original_url'])->toBe('https://fosstodon.org/@user/109123456789')
        ->and($post['media'][0]['type'])->toBe('image')
        ->and($post['media'][0]['alt_text'])->toBe('A photo');
});

it('normalises a bluesky feed view post to unified post format', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => ['text' => 'hello bluesky', 'createdAt' => '2024-01-15T11:00:00.000Z'],
            'author' => [
                'displayName' => 'Alice',
                'handle' => 'alice.bsky.social',
                'avatar' => 'https://cdn.bsky.app/avatar.jpg',
            ],
            'embed' => [
                '$type' => 'app.bsky.embed.images#view',
                'images' => [
                    [
                        'fullsize' => 'https://cdn.bsky.app/img.jpg',
                        'thumb' => 'https://cdn.bsky.app/img_thumb.jpg',
                        'alt' => 'Sky photo',
                    ],
                ],
            ],
        ],
    ];

    $normalizer = new PostNormalizer;
    $post = $normalizer->fromBluesky($feedPost);

    expect($post['id'])->toBe('bluesky_at://did:plc:abc/app.bsky.feed.post/xyz')
        ->and($post['source'])->toBe('bluesky')
        ->and($post['body'])->toBe('hello bluesky')
        ->and($post['author_name'])->toBe('Alice')
        ->and($post['author_handle'])->toBe('@alice.bsky.social')
        ->and($post['author_avatar'])->toBe('https://cdn.bsky.app/avatar.jpg')
        ->and($post['original_url'])->toBe('https://bsky.app/profile/alice.bsky.social/post/xyz')
        ->and($post['media'][0]['type'])->toBe('image')
        ->and($post['media'][0]['alt_text'])->toBe('Sky photo');
});

it('strips html entities from mastodon post body', function () {
    $status = [
        'id' => '1',
        'content' => '<p>We &lt;3 open source &amp; free software</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://fosstodon.org/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'fosstodon.org');

    expect($post['body'])->toBe('We <3 open source & free software');
});

it('returns empty media array when post has no attachments', function () {
    $status = [
        'id' => '1',
        'content' => '<p>text only</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://fosstodon.org/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'fosstodon.org');

    expect($post['media'])->toBe([]);
});

it('strips urls from post body and exposes first as link_url', function () {
    $long = 'https://example.com/very/long/path/that/exceeds/the/limit/by/quite/a/lot';
    $status = [
        'id' => '1',
        'content' => "<p>Check this out {$long}</p>",
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://fosstodon.org/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'fosstodon.org');

    expect($post['body'])->toBe('Check this out')
        ->and($post['link_url'])->toBe($long);
});

it('uses reblogged content and author for mastodon boosts', function () {
    $status = [
        'id' => '999',
        'content' => '',
        'created_at' => '2024-01-15T12:00:00.000Z',
        'url' => 'https://fosstodon.org/@booster/999',
        'account' => ['display_name' => 'Booster', 'acct' => 'booster', 'avatar' => ''],
        'media_attachments' => [],
        'reblog' => [
            'id' => '456',
            'content' => '<p>original content</p>',
            'created_at' => '2024-01-14T10:00:00.000Z',
            'url' => 'https://mastodon.social/@original/456',
            'account' => ['display_name' => 'Original', 'acct' => 'original', 'avatar' => 'https://mastodon.social/avatar.jpg'],
            'media_attachments' => [],
        ],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'fosstodon.org');

    expect($post['body'])->toBe('original content')
        ->and($post['author_name'])->toBe('Original')
        ->and($post['author_handle'])->toBe('@original@mastodon.social')
        ->and($post['original_url'])->toBe('https://mastodon.social/@original/456')
        ->and($post['boosted_by'])->toBe('Booster');
});

it('sets boosted_by to null for non-reblog mastodon posts', function () {
    $status = [
        'id' => '1',
        'content' => '<p>hi</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://fosstodon.org/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'fosstodon.org');

    expect($post['boosted_by'])->toBeNull();
});

it('preserves paragraph breaks in mastodon post body', function () {
    $status = [
        'id' => '1',
        'content' => '<p>First paragraph</p><p>Second paragraph</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://fosstodon.org/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'fosstodon.org');

    expect($post['body'])->toBe("First paragraph\nSecond paragraph");
});

it('sets boosted_by for bluesky reposts', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => ['text' => 'reposted content', 'createdAt' => '2024-01-15T11:00:00.000Z'],
            'author' => ['displayName' => 'Author', 'handle' => 'author.bsky.social', 'avatar' => ''],
            'embed' => null,
        ],
        'reason' => [
            '$type' => 'app.bsky.feed.defs#reasonRepost',
            'by' => ['displayName' => 'Reposter', 'handle' => 'reposter.bsky.social'],
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['boosted_by'])->toBe('Reposter');
});

it('sets boosted_by to null for regular bluesky posts', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => ['text' => 'regular post', 'createdAt' => '2024-01-15T11:00:00.000Z'],
            'author' => ['displayName' => 'Author', 'handle' => 'author.bsky.social', 'avatar' => ''],
            'embed' => null,
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['boosted_by'])->toBeNull();
});

it('sets quoted_post for bluesky record embeds', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => ['text' => 'post body', 'createdAt' => '2024-01-15T11:00:00.000Z'],
            'author' => ['displayName' => 'Author', 'handle' => 'author.bsky.social', 'avatar' => ''],
            'embed' => [
                '$type' => 'app.bsky.embed.record#view',
                'record' => [
                    '$type' => 'app.bsky.embed.record#viewRecord',
                    'uri' => 'at://did:plc:xyz/app.bsky.feed.post/quoteid',
                    'author' => ['displayName' => 'Quoted User', 'handle' => 'quoted.bsky.social', 'avatar' => 'https://cdn.bsky.app/quoted.jpg'],
                    'value' => ['text' => 'quoted body'],
                ],
            ],
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['quoted_post'])->toBe([
        'author_name' => 'Quoted User',
        'author_handle' => '@quoted.bsky.social',
        'author_avatar' => 'https://cdn.bsky.app/quoted.jpg',
        'original_url' => 'https://bsky.app/profile/quoted.bsky.social/post/quoteid',
        'body' => 'quoted body',
    ]);
});

it('sets quoted_post for bluesky recordWithMedia embeds', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => ['text' => 'post body', 'createdAt' => '2024-01-15T11:00:00.000Z'],
            'author' => ['displayName' => 'Author', 'handle' => 'author.bsky.social', 'avatar' => ''],
            'embed' => [
                '$type' => 'app.bsky.embed.recordWithMedia#view',
                'record' => [
                    'record' => [
                        '$type' => 'app.bsky.embed.record#viewRecord',
                        'uri' => 'at://did:plc:xyz/app.bsky.feed.post/mediaquote',
                        'author' => ['displayName' => 'Quoted User', 'handle' => 'quoted.bsky.social', 'avatar' => 'https://cdn.bsky.app/quoted.jpg'],
                        'value' => ['text' => 'quoted body with media'],
                    ],
                ],
            ],
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['quoted_post'])->toBe([
        'author_name' => 'Quoted User',
        'author_handle' => '@quoted.bsky.social',
        'author_avatar' => 'https://cdn.bsky.app/quoted.jpg',
        'original_url' => 'https://bsky.app/profile/quoted.bsky.social/post/mediaquote',
        'body' => 'quoted body with media',
    ]);
});

it('falls back to handle when bluesky quoted post author has no displayName', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => ['text' => 'post body', 'createdAt' => '2024-01-15T11:00:00.000Z'],
            'author' => ['displayName' => 'Author', 'handle' => 'author.bsky.social', 'avatar' => ''],
            'embed' => [
                '$type' => 'app.bsky.embed.record#view',
                'record' => [
                    '$type' => 'app.bsky.embed.record#viewRecord',
                    'uri' => 'at://did:plc:xyz/app.bsky.feed.post/quoteid',
                    'author' => ['displayName' => '', 'handle' => 'noname.bsky.social', 'avatar' => ''],
                    'value' => ['text' => 'body'],
                ],
            ],
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['quoted_post']['author_name'])->toBe('noname.bsky.social');
});

it('falls back to acct when mastodon display_name is empty', function () {
    $status = [
        'id' => '1',
        'content' => '<p>hi</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://fosstodon.org/@user/1',
        'account' => ['display_name' => '', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'fosstodon.org');

    expect($post['author_name'])->toBe('user');
});

it('extracts link_url from mastodon html anchor tags, skipping mentions and hashtags', function () {
    $status = [
        'id' => '1',
        'content' => '<p>Hey <a href="https://fosstodon.org/@someone" class="u-url mention">@someone</a> see <a href="https://example.com/article" target="_blank">https://example.com/article</a></p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://fosstodon.org/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'fosstodon.org');

    expect($post['link_url'])->toBe('https://example.com/article')
        ->and($post['body'])->toBe('Hey @someone see');
});

it('substitutes mastodon custom emoji shortcodes with image urls', function () {
    $status = [
        'id' => '1',
        'content' => '<p>hello world</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://fosstodon.org/@user/1',
        'account' => [
            'display_name' => 'Test :wave:',
            'acct' => 'user',
            'avatar' => '',
            'emojis' => [
                ['shortcode' => 'wave', 'url' => 'https://fosstodon.org/emoji/wave.png'],
            ],
        ],
        'media_attachments' => [],
        'emojis' => [
            ['shortcode' => 'sprouter', 'url' => 'https://fosstodon.org/emoji/sprouter.png'],
        ],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'fosstodon.org');

    expect($post['emojis'])->toBe([
        'sprouter' => 'https://fosstodon.org/emoji/sprouter.png',
        'wave' => 'https://fosstodon.org/emoji/wave.png',
    ]);
});

it('ignores emoji with unsafe urls', function () {
    $status = [
        'id' => '1',
        'content' => '<p>hi</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://fosstodon.org/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => '', 'emojis' => []],
        'media_attachments' => [],
        'emojis' => [
            ['shortcode' => 'bad', 'url' => 'javascript:alert(1)'],
            ['shortcode' => 'good', 'url' => 'https://fosstodon.org/emoji/good.png'],
        ],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'fosstodon.org');

    expect($post['emojis'])->toBe(['good' => 'https://fosstodon.org/emoji/good.png']);
});

it('includes booster account emoji in the map', function () {
    $status = [
        'id' => '999',
        'content' => '',
        'created_at' => '2024-01-15T12:00:00.000Z',
        'url' => 'https://fosstodon.org/@booster/999',
        'account' => [
            'display_name' => 'Booster :tada:',
            'acct' => 'booster',
            'avatar' => '',
            'emojis' => [
                ['shortcode' => 'tada', 'url' => 'https://fosstodon.org/emoji/tada.png'],
            ],
        ],
        'media_attachments' => [],
        'reblog' => [
            'id' => '456',
            'content' => '<p>original</p>',
            'created_at' => '2024-01-14T10:00:00.000Z',
            'url' => 'https://mastodon.social/@original/456',
            'account' => ['display_name' => 'Original', 'acct' => 'original', 'avatar' => '', 'emojis' => []],
            'media_attachments' => [],
            'emojis' => [],
        ],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'fosstodon.org');

    expect($post['emojis'])->toBe(['tada' => 'https://fosstodon.org/emoji/tada.png'])
        ->and($post['boosted_by'])->toBe('Booster :tada:');
});

it('includes author_banner from mastodon account header', function () {
    $status = [
        'id' => '1',
        'content' => '<p>hi</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://fosstodon.org/@user/1',
        'account' => [
            'display_name' => 'User',
            'acct' => 'user',
            'avatar' => 'https://fosstodon.org/avatars/user.jpg',
            'header' => 'https://fosstodon.org/headers/user.jpg',
        ],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'fosstodon.org');

    expect($post['author_banner'])->toBe('https://fosstodon.org/headers/user.jpg');
});

it('sets author_banner to null when mastodon account has no header', function () {
    $status = [
        'id' => '1',
        'content' => '<p>hi</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://fosstodon.org/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'fosstodon.org');

    expect($post['author_banner'])->toBeNull();
});

it('includes author_banner from bluesky author banner', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => ['text' => 'hello', 'createdAt' => '2024-01-15T11:00:00.000Z'],
            'author' => [
                'displayName' => 'Alice',
                'handle' => 'alice.bsky.social',
                'avatar' => 'https://cdn.bsky.app/avatar.jpg',
                'banner' => 'https://cdn.bsky.app/banner.jpg',
            ],
            'embed' => null,
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['author_banner'])->toBe('https://cdn.bsky.app/banner.jpg');
});

it('sets author_banner to null when bluesky author has no banner', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => ['text' => 'hello', 'createdAt' => '2024-01-15T11:00:00.000Z'],
            'author' => ['displayName' => 'Alice', 'handle' => 'alice.bsky.social', 'avatar' => ''],
            'embed' => null,
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['author_banner'])->toBeNull();
});

it('returns empty emojis array for bluesky posts', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => ['text' => 'hello', 'createdAt' => '2024-01-15T11:00:00.000Z'],
            'author' => ['displayName' => 'Alice', 'handle' => 'alice.bsky.social', 'avatar' => ''],
            'embed' => null,
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['emojis'])->toBe([]);
});

it('sets link_url to null when mastodon post has no external links', function () {
    $status = [
        'id' => '1',
        'content' => '<p>Just a plain post</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://fosstodon.org/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'fosstodon.org');

    expect($post['link_url'])->toBeNull();
});

it('extracts link_url from bluesky post text', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => ['text' => 'Check this out https://example.com/article cool', 'createdAt' => '2024-01-15T11:00:00.000Z'],
            'author' => ['displayName' => 'Alice', 'handle' => 'alice.bsky.social', 'avatar' => ''],
            'embed' => null,
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['link_url'])->toBe('https://example.com/article')
        ->and($post['body'])->toBe('Check this out cool');
});

it('prefers bluesky external embed url over text url', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => ['text' => 'See https://text-url.com', 'createdAt' => '2024-01-15T11:00:00.000Z'],
            'author' => ['displayName' => 'Alice', 'handle' => 'alice.bsky.social', 'avatar' => ''],
            'embed' => [
                '$type' => 'app.bsky.embed.external#view',
                'external' => ['uri' => 'https://embed-url.com/article', 'title' => 'Article', 'description' => ''],
            ],
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['link_url'])->toBe('https://embed-url.com/article');
});

it('uses mastodon card title as link_title', function () {
    $status = [
        'id' => '1',
        'content' => '<p>Check this out https://example.com/article</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://fosstodon.org/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
        'card' => [
            'url' => 'https://example.com/article',
            'title' => 'An Example Article',
            'description' => 'Some description',
            'image' => 'https://example.com/og.jpg',
        ],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'fosstodon.org');

    expect($post['link_title'])->toBe('An Example Article');
});

it('prefers mastodon card url over extracted link_url', function () {
    $status = [
        'id' => '1',
        'content' => '<p>Check this out https://t.co/short</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://fosstodon.org/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
        'card' => [
            'url' => 'https://example.com/full-article',
            'title' => 'Article',
            'description' => '',
            'image' => null,
        ],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'fosstodon.org');

    expect($post['link_url'])->toBe('https://example.com/full-article');
});

it('derives link_favicon from link_url domain using favicone for mastodon posts', function () {
    $status = [
        'id' => '1',
        'content' => '<p>article</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://fosstodon.org/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
        'card' => ['url' => 'https://www.bbc.co.uk/news/article', 'title' => 'News', 'description' => '', 'image' => null],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'fosstodon.org');

    expect($post['link_favicon'])->toBe('https://favicone.com/www.bbc.co.uk');
});

it('sets link_favicon to null when mastodon post has no link', function () {
    $status = [
        'id' => '1',
        'content' => '<p>Just a plain post</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://fosstodon.org/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'fosstodon.org');

    expect($post['link_favicon'])->toBeNull();
});

it('derives link_favicon from link_url domain using favicone for bluesky external embed', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => ['text' => 'article', 'createdAt' => '2024-01-15T11:00:00.000Z'],
            'author' => ['displayName' => 'Alice', 'handle' => 'alice.bsky.social', 'avatar' => ''],
            'embed' => [
                '$type' => 'app.bsky.embed.external#view',
                'external' => [
                    'uri' => 'https://www.theverge.com/article',
                    'title' => 'The Article',
                    'description' => '',
                    'thumb' => 'https://cdn.bsky.app/img/thumbnail.jpg',
                ],
            ],
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['link_favicon'])->toBe('https://favicone.com/www.theverge.com');
});

it('sets link_favicon to null when bluesky post has no external embed', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => ['text' => 'just text', 'createdAt' => '2024-01-15T11:00:00.000Z'],
            'author' => ['displayName' => 'Alice', 'handle' => 'alice.bsky.social', 'avatar' => ''],
            'embed' => null,
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['link_favicon'])->toBeNull();
});

it('includes author identity and url in mastodon reply_to', function () {
    $parent = [
        'url' => 'https://mastodon.social/@original/456',
        'content' => '<p>This is the parent post body</p>',
        'account' => [
            'display_name' => 'Original User',
            'acct' => 'original',
            'avatar' => 'https://mastodon.social/avatars/original.jpg',
        ],
    ];

    $status = [
        'id' => '789',
        'content' => '<p>Reply text</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://fosstodon.org/@user/789',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'fosstodon.org', $parent);

    expect($post['reply_to'])->toBe([
        'author_name' => 'Original User',
        'author_handle' => '@original@mastodon.social',
        'author_avatar' => 'https://mastodon.social/avatars/original.jpg',
        'original_url' => 'https://mastodon.social/@original/456',
        'body' => 'This is the parent post body',
    ]);
});

it('falls back to acct when mastodon reply_to parent has no display_name', function () {
    $parent = [
        'url' => 'https://mastodon.social/@noname/1',
        'content' => '<p>body</p>',
        'account' => ['display_name' => '', 'acct' => 'noname', 'avatar' => ''],
    ];

    $status = [
        'id' => '2',
        'content' => '<p>reply</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://fosstodon.org/@user/2',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'fosstodon.org', $parent);

    expect($post['reply_to']['author_name'])->toBe('noname');
});

it('sets mastodon reply_to original_url to empty string when parent url is non-http', function () {
    $parent = [
        'url' => 'javascript:alert(1)',
        'content' => '<p>body</p>',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
    ];

    $status = [
        'id' => '3',
        'content' => '<p>reply</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://fosstodon.org/@user/3',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'fosstodon.org', $parent);

    expect($post['reply_to']['original_url'])->toBe('');
});

it('returns null reply_to when mastodon parentStatus is null', function () {
    $status = [
        'id' => '4',
        'content' => '<p>standalone post</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://fosstodon.org/@user/4',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'fosstodon.org');

    expect($post['reply_to'])->toBeNull();
});

it('includes author identity and url in bluesky reply_to', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/reply123',
            'record' => ['text' => 'reply text', 'createdAt' => '2024-01-15T11:00:00.000Z'],
            'author' => ['displayName' => 'Alice', 'handle' => 'alice.bsky.social', 'avatar' => ''],
            'embed' => null,
        ],
        'reply' => [
            'parent' => [
                'uri' => 'at://did:plc:xyz/app.bsky.feed.post/parent456',
                'record' => ['text' => 'parent body text'],
                'author' => [
                    'displayName' => 'Bob',
                    'handle' => 'bob.bsky.social',
                    'avatar' => 'https://cdn.bsky.app/bob.jpg',
                ],
            ],
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['reply_to'])->toBe([
        'author_name' => 'Bob',
        'author_handle' => '@bob.bsky.social',
        'author_avatar' => 'https://cdn.bsky.app/bob.jpg',
        'original_url' => 'https://bsky.app/profile/bob.bsky.social/post/parent456',
        'body' => 'parent body text',
    ]);
});

it('falls back to handle when bluesky reply_to parent has no displayName', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => ['text' => 'reply', 'createdAt' => '2024-01-15T11:00:00.000Z'],
            'author' => ['displayName' => 'Alice', 'handle' => 'alice.bsky.social', 'avatar' => ''],
            'embed' => null,
        ],
        'reply' => [
            'parent' => [
                'uri' => 'at://did:plc:xyz/app.bsky.feed.post/abc',
                'record' => ['text' => 'body'],
                'author' => ['displayName' => '', 'handle' => 'noname.bsky.social', 'avatar' => ''],
            ],
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['reply_to']['author_name'])->toBe('noname.bsky.social');
});

it('returns null reply_to when bluesky parent has no record text', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => ['text' => 'reply', 'createdAt' => '2024-01-15T11:00:00.000Z'],
            'author' => ['displayName' => 'Alice', 'handle' => 'alice.bsky.social', 'avatar' => ''],
            'embed' => null,
        ],
        'reply' => [
            'parent' => [
                'uri' => 'at://did:plc:xyz/app.bsky.feed.post/abc',
                'record' => [],
                'author' => ['displayName' => 'Bob', 'handle' => 'bob.bsky.social', 'avatar' => ''],
            ],
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['reply_to'])->toBeNull();
});
