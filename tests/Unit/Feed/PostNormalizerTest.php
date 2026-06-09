<?php

use App\Services\Feed\PostNormalizer;
use Tests\TestCase;

uses(TestCase::class);

it('normalises a mastodon status to unified post format', function () {
    $status = [
        'id' => '109123456789',
        'content' => '<p>hello <strong>world</strong></p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/109123456789',
        'account' => [
            'display_name' => 'Test User',
            'acct' => 'user',
            'avatar' => 'https://mastodon.example/avatars/original/user.jpg',
        ],
        'media_attachments' => [
            [
                'type' => 'image',
                'url' => 'https://mastodon.example/media/img.jpg',
                'preview_url' => 'https://mastodon.example/media/img_small.jpg',
                'description' => 'A photo',
            ],
        ],
    ];

    $normalizer = new PostNormalizer;
    $post = $normalizer->fromMastodon($status, 'mastodon.example');

    expect($post['id'])->toBe('mastodon_109123456789')
        ->and($post['source'])->toBe('mastodon')
        ->and($post['body'])->toBe('hello world')
        ->and($post['author_name'])->toBe('Test User')
        ->and($post['author_handle'])->toBe('@user@mastodon.example')
        ->and($post['author_avatar'])->toBe('https://mastodon.example/avatars/original/user.jpg')
        ->and($post['original_url'])->toBe('https://mastodon.example/@user/109123456789')
        ->and($post['media'][0]['type'])->toBe('image')
        ->and($post['media'][0]['alt_text'])->toBe('A photo');
});

it('normalises a mastodon video attachment', function () {
    $status = [
        'id' => '999',
        'content' => '',
        'created_at' => '2024-01-15T12:00:00.000Z',
        'url' => 'https://mastodon.example/@bob/999',
        'account' => [
            'display_name' => 'Bob',
            'acct' => 'bob',
            'avatar' => 'https://mastodon.example/avatars/bob.jpg',
        ],
        'media_attachments' => [
            [
                'type' => 'video',
                'url' => 'https://mastodon.example/media/video.mp4',
                'preview_url' => 'https://mastodon.example/media/video_thumb.jpg',
                'description' => 'A cat video',
            ],
        ],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['media'])->toHaveCount(1)
        ->and($post['media'][0]['type'])->toBe('video')
        ->and($post['media'][0]['url'])->toBe('https://mastodon.example/media/video.mp4')
        ->and($post['media'][0]['preview_url'])->toBe('https://mastodon.example/media/video_thumb.jpg')
        ->and($post['media'][0]['alt_text'])->toBe('A cat video');
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

it('does not double-append instance to federated mastodon author handle', function () {
    $status = [
        'id' => '1',
        'content' => '<p>hello</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://remote.social/@user@remote.social/1',
        'account' => ['display_name' => 'User', 'acct' => 'user@remote.social', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'myinstance.com');

    expect($post['author_handle'])->toBe('@user@remote.social');
});

it('strips html entities from mastodon post body', function () {
    $status = [
        'id' => '1',
        'content' => '<p>We &lt;3 open source &amp; free software</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['body'])->toBe('We <3 open source & free software');
});

it('returns empty media array when post has no attachments', function () {
    $status = [
        'id' => '1',
        'content' => '<p>text only</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['media'])->toBe([]);
});

it('strips urls from post body and exposes first as link_url', function () {
    $long = 'https://example.com/very/long/path/that/exceeds/the/limit/by/quite/a/lot';
    $status = [
        'id' => '1',
        'content' => "<p>Check this out {$long}</p>",
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['body'])->toBe('Check this out')
        ->and($post['link_url'])->toBe($long);
});

it('uses reblogged content and author for mastodon boosts', function () {
    $status = [
        'id' => '999',
        'content' => '',
        'created_at' => '2024-01-15T12:00:00.000Z',
        'url' => 'https://mastodon.example/@booster/999',
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

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

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
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['boosted_by'])->toBeNull();
});

it('preserves paragraph breaks in mastodon post body', function () {
    $status = [
        'id' => '1',
        'content' => '<p>First paragraph</p><p>Second paragraph</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

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

it('sets reply_to for a bluesky repost of a reply', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/reply123',
            'record' => ['text' => 'reply that was reposted', 'createdAt' => '2024-01-15T11:00:00.000Z'],
            'author' => ['displayName' => 'Author', 'handle' => 'author.bsky.social', 'avatar' => ''],
            'embed' => null,
        ],
        'reason' => [
            '$type' => 'app.bsky.feed.defs#reasonRepost',
            'by' => ['displayName' => 'Reposter', 'handle' => 'reposter.bsky.social'],
        ],
        'reply' => [
            'parent' => [
                'uri' => 'at://did:plc:xyz/app.bsky.feed.post/parent456',
                'record' => ['text' => 'original parent body'],
                'author' => [
                    'displayName' => 'Parent Author',
                    'handle' => 'parent.bsky.social',
                    'avatar' => 'https://cdn.bsky.app/parent.jpg',
                ],
            ],
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['reply_to'])->not->toBeNull()
        ->and($post['reply_to']['author_name'])->toBe('Parent Author')
        ->and($post['reply_to']['author_handle'])->toBe('@parent.bsky.social')
        ->and($post['boosted_by'])->toBe('Reposter');
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
        'created_at' => null,
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
        'created_at' => null,
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
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => '', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['author_name'])->toBe('user');
});

it('extracts link_url from mastodon html anchor tags, skipping mentions and hashtags', function () {
    $status = [
        'id' => '1',
        'content' => '<p>Hey <a href="https://mastodon.example/@someone" class="u-url mention">@someone</a> see <a href="https://example.com/article" target="_blank">https://example.com/article</a></p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['link_url'])->toBe('https://example.com/article')
        ->and($post['body'])->toBe('Hey @someone see');
});

it('substitutes mastodon custom emoji shortcodes with image urls', function () {
    $status = [
        'id' => '1',
        'content' => '<p>hello world</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'account' => [
            'display_name' => 'Test :wave:',
            'acct' => 'user',
            'avatar' => '',
            'emojis' => [
                ['shortcode' => 'wave', 'url' => 'https://mastodon.example/emoji/wave.png'],
            ],
        ],
        'media_attachments' => [],
        'emojis' => [
            ['shortcode' => 'bloom', 'url' => 'https://mastodon.example/emoji/bloom.png'],
        ],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['emojis'])->toBe([
        'bloom' => 'https://mastodon.example/emoji/bloom.png',
        'wave' => 'https://mastodon.example/emoji/wave.png',
    ]);
});

it('ignores emoji with unsafe urls', function () {
    $status = [
        'id' => '1',
        'content' => '<p>hi</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => '', 'emojis' => []],
        'media_attachments' => [],
        'emojis' => [
            ['shortcode' => 'bad', 'url' => 'javascript:alert(1)'],
            ['shortcode' => 'good', 'url' => 'https://mastodon.example/emoji/good.png'],
        ],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['emojis'])->toBe(['good' => 'https://mastodon.example/emoji/good.png']);
});

it('includes booster account emoji in the map', function () {
    $status = [
        'id' => '999',
        'content' => '',
        'created_at' => '2024-01-15T12:00:00.000Z',
        'url' => 'https://mastodon.example/@booster/999',
        'account' => [
            'display_name' => 'Booster :tada:',
            'acct' => 'booster',
            'avatar' => '',
            'emojis' => [
                ['shortcode' => 'tada', 'url' => 'https://mastodon.example/emoji/tada.png'],
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

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['emojis'])->toBe(['tada' => 'https://mastodon.example/emoji/tada.png'])
        ->and($post['boosted_by'])->toBe('Booster :tada:');
});

it('includes author_banner from mastodon account header', function () {
    $status = [
        'id' => '1',
        'content' => '<p>hi</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'account' => [
            'display_name' => 'User',
            'acct' => 'user',
            'avatar' => 'https://mastodon.example/avatars/user.jpg',
            'header' => 'https://mastodon.example/headers/user.jpg',
        ],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['author_banner'])->toBe('https://mastodon.example/headers/user.jpg');
});

it('sets author_banner to null when mastodon account has no header', function () {
    $status = [
        'id' => '1',
        'content' => '<p>hi</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

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
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

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
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
        'card' => [
            'url' => 'https://example.com/article',
            'title' => 'An Example Article',
            'description' => 'Some description',
            'image' => 'https://example.com/og.jpg',
        ],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['link_title'])->toBe('An Example Article');
});

it('prefers mastodon card url over extracted link_url', function () {
    $status = [
        'id' => '1',
        'content' => '<p>Check this out https://t.co/short</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
        'card' => [
            'url' => 'https://example.com/full-article',
            'title' => 'Article',
            'description' => '',
            'image' => null,
        ],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['link_url'])->toBe('https://example.com/full-article');
});

it('derives link_favicon from link_url domain using favicone for mastodon posts', function () {
    $status = [
        'id' => '1',
        'content' => '<p>article</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
        'card' => ['url' => 'https://www.bbc.co.uk/news/article', 'title' => 'News', 'description' => '', 'image' => null],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['link_favicon'])->toBe('https://favicone.com/www.bbc.co.uk');
});

it('sets link_favicon to null when mastodon post has no link', function () {
    $status = [
        'id' => '1',
        'content' => '<p>Just a plain post</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

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
        'url' => 'https://mastodon.example/@user/789',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example', $parent);

    expect($post['reply_to'])->toBe([
        'author_name' => 'Original User',
        'author_handle' => '@original@mastodon.social',
        'author_avatar' => 'https://mastodon.social/avatars/original.jpg',
        'original_url' => 'https://mastodon.social/@original/456',
        'body' => 'This is the parent post body',
        'created_at' => null,
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
        'url' => 'https://mastodon.example/@user/2',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example', $parent);

    expect($post['reply_to']['author_name'])->toBe('noname');
});

it('does not double-append instance to federated mastodon reply_to author handle', function () {
    $parent = [
        'url' => 'https://remote.social/@user@remote.social/1',
        'content' => '<p>body</p>',
        'account' => ['display_name' => 'User', 'acct' => 'user@remote.social', 'avatar' => ''],
    ];

    $status = [
        'id' => '2',
        'content' => '<p>reply</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://myinstance.com/@me/2',
        'account' => ['display_name' => 'Me', 'acct' => 'me', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'myinstance.com', $parent);

    expect($post['reply_to']['author_handle'])->toBe('@user@remote.social');
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
        'url' => 'https://mastodon.example/@user/3',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example', $parent);

    expect($post['reply_to']['original_url'])->toBe('');
});

it('returns null reply_to when mastodon parentStatus is null', function () {
    $status = [
        'id' => '4',
        'content' => '<p>standalone post</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/4',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

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
        'created_at' => null,
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

it('normalises a bluesky video embed post', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/vid1',
            'record' => ['text' => '', 'createdAt' => '2024-01-15T12:00:00.000Z'],
            'author' => [
                'displayName' => 'Alice',
                'handle' => 'alice.bsky.social',
                'avatar' => 'https://cdn.bsky.app/avatar.jpg',
            ],
            'embed' => [
                '$type' => 'app.bsky.embed.video#view',
                'cid' => 'bafytest123',
                'playlist' => 'https://video.bsky.app/watch/did:plc:abc/playlist.m3u8',
                'thumbnail' => 'https://video.bsky.app/watch/did:plc:abc/thumbnail.jpg',
                'alt' => 'A test video',
            ],
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['media'])->toHaveCount(1)
        ->and($post['media'][0]['type'])->toBe('video')
        ->and($post['media'][0]['url'])->toBe('https://video.bsky.app/watch/did:plc:abc/playlist.m3u8')
        ->and($post['media'][0]['preview_url'])->toBe('https://video.bsky.app/watch/did:plc:abc/thumbnail.jpg')
        ->and($post['media'][0]['alt_text'])->toBe('A test video');
});

it('normalises a bluesky video embed post with no thumbnail', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/vid2',
            'record' => ['text' => '', 'createdAt' => '2024-01-15T12:00:00.000Z'],
            'author' => [
                'displayName' => 'Alice',
                'handle' => 'alice.bsky.social',
                'avatar' => 'https://cdn.bsky.app/avatar.jpg',
            ],
            'embed' => [
                '$type' => 'app.bsky.embed.video#view',
                'cid' => 'bafytest456',
                'playlist' => 'https://video.bsky.app/watch/did:plc:abc/playlist2.m3u8',
            ],
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['media'])->toHaveCount(1)
        ->and($post['media'][0]['type'])->toBe('video')
        ->and($post['media'][0]['url'])->toBe('https://video.bsky.app/watch/did:plc:abc/playlist2.m3u8')
        ->and($post['media'][0]['preview_url'])->toBeNull()
        ->and($post['media'][0]['alt_text'])->toBeNull();
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

it('truncates a mastodon body that exceeds feed.body_limit', function () {
    config(['feed.body_limit' => 20]);
    $status = [
        'id' => '1',
        'content' => '<p>'.str_repeat('a', 30).'</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['body'])->toEndWith('…')
        ->and(mb_strlen($post['body']))->toBeLessThanOrEqual(21);
});

it('does not truncate a mastodon body within feed.body_limit', function () {
    config(['feed.body_limit' => 100]);
    $status = [
        'id' => '1',
        'content' => '<p>short body</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['body'])->toBe('short body');
});

it('truncates a bluesky body that exceeds feed.body_limit', function () {
    config(['feed.body_limit' => 20]);
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => ['text' => str_repeat('b', 30), 'createdAt' => '2024-01-15T10:00:00.000Z'],
            'author' => ['displayName' => 'Alice', 'handle' => 'alice.bsky.social', 'avatar' => ''],
            'embed' => null,
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['body'])->toEndWith('…')
        ->and(mb_strlen($post['body']))->toBeLessThanOrEqual(21);
});

it('does not truncate a bluesky body within feed.body_limit', function () {
    config(['feed.body_limit' => 100]);
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => ['text' => 'short body', 'createdAt' => '2024-01-15T10:00:00.000Z'],
            'author' => ['displayName' => 'Alice', 'handle' => 'alice.bsky.social', 'avatar' => ''],
            'embed' => null,
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['body'])->toBe('short body');
});

it('includes created_at in bluesky quoted_post when present', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => ['text' => 'quoting', 'createdAt' => '2024-01-15T11:00:00.000Z'],
            'author' => ['displayName' => 'Author', 'handle' => 'author.bsky.social', 'avatar' => ''],
            'embed' => [
                '$type' => 'app.bsky.embed.record#view',
                'record' => [
                    '$type' => 'app.bsky.embed.record#viewRecord',
                    'uri' => 'at://did:plc:xyz/app.bsky.feed.post/q1',
                    'author' => ['displayName' => 'Quoted', 'handle' => 'quoted.bsky.social', 'avatar' => ''],
                    'value' => ['text' => 'quoted text', 'createdAt' => '2024-01-14T09:00:00.000Z'],
                ],
            ],
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['quoted_post']['created_at'])->toBe('2024-01-14T09:00:00.000Z');
});

it('includes created_at in bluesky reply_to when present', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => ['text' => 'reply', 'createdAt' => '2024-01-15T11:00:00.000Z'],
            'author' => ['displayName' => 'Alice', 'handle' => 'alice.bsky.social', 'avatar' => ''],
            'embed' => null,
        ],
        'reply' => [
            'parent' => [
                'uri' => 'at://did:plc:xyz/app.bsky.feed.post/parent1',
                'record' => ['text' => 'parent text', 'createdAt' => '2024-01-14T08:00:00.000Z'],
                'author' => ['displayName' => 'Bob', 'handle' => 'bob.bsky.social', 'avatar' => ''],
            ],
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['reply_to']['created_at'])->toBe('2024-01-14T08:00:00.000Z');
});

it('includes created_at in mastodon reply_to when present', function () {
    $parent = [
        'url' => 'https://mastodon.social/@original/1',
        'content' => '<p>parent body</p>',
        'created_at' => '2024-01-14T07:00:00.000Z',
        'account' => ['display_name' => 'Original', 'acct' => 'original', 'avatar' => ''],
    ];

    $status = [
        'id' => '2',
        'content' => '<p>reply</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/2',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example', $parent);

    expect($post['reply_to']['created_at'])->toBe('2024-01-14T07:00:00.000Z');
});

it('sets boosted_by_created_at for mastodon reblogs', function () {
    $status = [
        'id' => '999',
        'content' => '',
        'created_at' => '2024-01-15T12:00:00.000Z',
        'url' => 'https://mastodon.example/@booster/999',
        'account' => ['display_name' => 'Booster', 'acct' => 'booster', 'avatar' => ''],
        'media_attachments' => [],
        'reblog' => [
            'id' => '456',
            'content' => '<p>original</p>',
            'created_at' => '2024-01-14T10:00:00.000Z',
            'url' => 'https://mastodon.social/@original/456',
            'account' => ['display_name' => 'Original', 'acct' => 'original', 'avatar' => ''],
            'media_attachments' => [],
        ],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['boosted_by_created_at'])->toBe('2024-01-15T12:00:00.000Z');
});

it('sets boosted_by_created_at to null for non-reblog mastodon posts', function () {
    $status = [
        'id' => '1',
        'content' => '<p>hi</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['boosted_by_created_at'])->toBeNull();
});

it('sets boosted_by_created_at for bluesky reposts', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => ['text' => 'reposted', 'createdAt' => '2024-01-15T11:00:00.000Z'],
            'author' => ['displayName' => 'Author', 'handle' => 'author.bsky.social', 'avatar' => ''],
            'embed' => null,
        ],
        'reason' => [
            '$type' => 'app.bsky.feed.defs#reasonRepost',
            'by' => ['displayName' => 'Reposter', 'handle' => 'reposter.bsky.social'],
            'indexedAt' => '2024-01-15T13:00:00.000Z',
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['boosted_by_created_at'])->toBe('2024-01-15T13:00:00.000Z');
});

it('sets boosted_by_created_at to null for regular bluesky posts', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => ['text' => 'regular', 'createdAt' => '2024-01-15T11:00:00.000Z'],
            'author' => ['displayName' => 'Author', 'handle' => 'author.bsky.social', 'avatar' => ''],
            'embed' => null,
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['boosted_by_created_at'])->toBeNull();
});

it('sets quoted_post from inline mastodon quote field', function () {
    $status = [
        'id' => '1',
        'content' => '<p>my comment</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
        'quote' => [
            'state' => 'accepted',
            'quoted_status' => [
                'id' => '99',
                'content' => '<p>the quoted post</p>',
                'created_at' => '2024-01-14T09:00:00.000Z',
                'url' => 'https://mastodon.social/@author/99',
                'account' => [
                    'display_name' => 'Quoted Author',
                    'acct' => 'author',
                    'avatar' => 'https://mastodon.social/avatars/author.jpg',
                ],
            ],
        ],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['quoted_post'])->toBe([
        'author_name' => 'Quoted Author',
        'author_handle' => '@author@mastodon.social',
        'author_avatar' => 'https://mastodon.social/avatars/author.jpg',
        'original_url' => 'https://mastodon.social/@author/99',
        'body' => 'the quoted post',
        'created_at' => '2024-01-14T09:00:00.000Z',
    ]);
});

it('sets quoted_post from pre-fetched quote status when no inline quote field', function () {
    $status = [
        'id' => '1',
        'content' => '<p>my comment</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
        'quote_id' => '99',
    ];

    $quoteStatus = [
        'id' => '99',
        'content' => '<p>the quoted post</p>',
        'created_at' => '2024-01-14T09:00:00.000Z',
        'url' => 'https://mastodon.social/@author/99',
        'account' => [
            'display_name' => 'Quoted Author',
            'acct' => 'author',
            'avatar' => 'https://mastodon.social/avatars/author.jpg',
        ],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example', quoteStatus: $quoteStatus);

    expect($post['quoted_post'])->toBe([
        'author_name' => 'Quoted Author',
        'author_handle' => '@author@mastodon.social',
        'author_avatar' => 'https://mastodon.social/avatars/author.jpg',
        'original_url' => 'https://mastodon.social/@author/99',
        'body' => 'the quoted post',
        'created_at' => '2024-01-14T09:00:00.000Z',
    ]);
});

it('prefers inline quote field over pre-fetched quote status', function () {
    $status = [
        'id' => '1',
        'content' => '<p>my comment</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
        'quote_id' => '99',
        'quote' => [
            'state' => 'accepted',
            'quoted_status' => [
                'id' => '99',
                'content' => '<p>inline quote body</p>',
                'created_at' => '2024-01-14T09:00:00.000Z',
                'url' => 'https://mastodon.social/@inline/99',
                'account' => ['display_name' => 'Inline Author', 'acct' => 'inline', 'avatar' => ''],
            ],
        ],
    ];

    $quoteStatus = [
        'id' => '99',
        'content' => '<p>fetched quote body</p>',
        'created_at' => '2024-01-14T09:00:00.000Z',
        'url' => 'https://mastodon.social/@fetched/99',
        'account' => ['display_name' => 'Fetched Author', 'acct' => 'fetched', 'avatar' => ''],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example', quoteStatus: $quoteStatus);

    expect($post['quoted_post']['author_name'])->toBe('Inline Author');
});

it('sets quoted_post to null when mastodon 4.3 wrapper has null quoted_status (pending/rejected)', function () {
    $status = [
        'id' => '1',
        'content' => '<p>post quoting a pending approval</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
        'quote' => ['state' => 'pending', 'quoted_status' => null],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['quoted_post'])->toBeNull();
});

it('sets quoted_post to null when neither inline quote nor pre-fetched status is present', function () {
    $status = [
        'id' => '1',
        'content' => '<p>regular post</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['quoted_post'])->toBeNull();
});

it('does not double-append instance to federated mastodon quoted post author handle', function () {
    $status = [
        'id' => '1',
        'content' => '<p>quoting</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
        'quote' => [
            'state' => 'accepted',
            'quoted_status' => [
                'id' => '99',
                'content' => '<p>remote post</p>',
                'created_at' => '2024-01-14T09:00:00.000Z',
                'url' => 'https://remote.social/@remote@remote.social/99',
                'account' => [
                    'display_name' => 'Remote User',
                    'acct' => 'remote@remote.social',
                    'avatar' => '',
                ],
            ],
        ],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['quoted_post']['author_handle'])->toBe('@remote@remote.social');
});

it('sets quoted_post from inline quote on a boosted mastodon status', function () {
    $status = [
        'id' => '999',
        'content' => '',
        'created_at' => '2024-01-15T12:00:00.000Z',
        'url' => 'https://mastodon.example/@booster/999',
        'account' => ['display_name' => 'Booster', 'acct' => 'booster', 'avatar' => ''],
        'media_attachments' => [],
        'reblog' => [
            'id' => '1',
            'content' => '<p>boosted quote post</p>',
            'created_at' => '2024-01-15T10:00:00.000Z',
            'url' => 'https://mastodon.social/@original/1',
            'account' => ['display_name' => 'Original', 'acct' => 'original', 'avatar' => ''],
            'media_attachments' => [],
            'quote' => [
                'state' => 'accepted',
                'quoted_status' => [
                    'id' => '99',
                    'content' => '<p>the quoted post</p>',
                    'created_at' => '2024-01-14T09:00:00.000Z',
                    'url' => 'https://mastodon.social/@quoted/99',
                    'account' => ['display_name' => 'Quoted Author', 'acct' => 'quoted', 'avatar' => ''],
                ],
            ],
        ],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['quoted_post']['author_name'])->toBe('Quoted Author');
});

it('strips bare domain urls with paths from bluesky post body', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => [
                'text' => 'Check out fosstodon.org/users/foo for more',
                '$type' => 'app.bsky.feed.post',
                'createdAt' => '2024-01-15T10:00:00.000Z',
            ],
            'author' => [
                'handle' => 'alice.bsky.social',
                'displayName' => 'Alice',
                'avatar' => '',
            ],
            'embed' => null,
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['body'])->toBe('Check out for more')
        ->and($post['link_url'])->toBe('https://fosstodon.org/users/foo');
});

it('does not strip version strings that resemble bare urls', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => [
                'text' => 'Upgraded to version 2.0/stable today',
                '$type' => 'app.bsky.feed.post',
                'createdAt' => '2024-01-15T10:00:00.000Z',
            ],
            'author' => [
                'handle' => 'alice.bsky.social',
                'displayName' => 'Alice',
                'avatar' => '',
            ],
            'embed' => null,
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['body'])->toBe('Upgraded to version 2.0/stable today')
        ->and($post['link_url'])->toBeNull();
});

it('strips both url types and extracts whichever appears first in text', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => [
                'text' => 'See https://example.com and also github.com/foo/bar for details',
                '$type' => 'app.bsky.feed.post',
                'createdAt' => '2024-01-15T10:00:00.000Z',
            ],
            'author' => [
                'handle' => 'alice.bsky.social',
                'displayName' => 'Alice',
                'avatar' => '',
            ],
            'embed' => null,
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['body'])->toBe('See and also for details')
        ->and($post['link_url'])->toBe('https://example.com');
});

it('extracts bare domain url when it appears before scheme url in text', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => [
                'text' => 'See github.com/foo/bar and also https://example.com for details',
                '$type' => 'app.bsky.feed.post',
                'createdAt' => '2024-01-15T10:00:00.000Z',
            ],
            'author' => [
                'handle' => 'alice.bsky.social',
                'displayName' => 'Alice',
                'avatar' => '',
            ],
            'embed' => null,
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['link_url'])->toBe('https://github.com/foo/bar');
});

it('extracts mastodon hashtags into hashtags array and strips them from body', function () {
    $status = [
        'id' => '1',
        'content' => '<p>Loving the weather today #sunny #outdoors</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
        'tags' => [
            ['name' => 'sunny', 'url' => 'https://mastodon.example/tags/sunny'],
            ['name' => 'outdoors', 'url' => 'https://mastodon.example/tags/outdoors'],
        ],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['hashtags'])->toBe(['sunny', 'outdoors'])
        ->and($post['body'])->toBe('Loving the weather today');
});

it('returns empty hashtags array when mastodon post has no tags', function () {
    $status = [
        'id' => '1',
        'content' => '<p>hello world</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['hashtags'])->toBe([]);
});

it('extracts bluesky hashtags from post text and strips them from body', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => [
                'text' => 'Great hike today #hiking #nature',
                '$type' => 'app.bsky.feed.post',
                'createdAt' => '2024-01-15T10:00:00.000Z',
            ],
            'author' => [
                'handle' => 'alice.bsky.social',
                'displayName' => 'Alice',
                'avatar' => '',
            ],
            'embed' => null,
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['hashtags'])->toBe(['hiking', 'nature'])
        ->and($post['body'])->toBe('Great hike today');
});

it('lowercases mastodon hashtags', function () {
    $status = [
        'id' => '1',
        'content' => '<p>post #FooBar</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
        'tags' => [['name' => 'FooBar', 'url' => 'https://mastodon.example/tags/FooBar']],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['hashtags'])->toBe(['foobar'])
        ->and($post['body'])->toBe('post');
});

it('lowercases bluesky hashtags', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => [
                'text' => 'post #FooBar',
                'createdAt' => '2024-01-15T10:00:00.000Z',
            ],
            'author' => ['displayName' => 'Alice', 'handle' => 'alice.bsky.social', 'avatar' => ''],
            'embed' => null,
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['hashtags'])->toBe(['foobar'])
        ->and($post['body'])->toBe('post');
});

it('strips bare domain urls with paths from mastodon post body', function () {
    $status = [
        'id' => '1',
        'content' => '<p>Check out fosstodon.org/users/foo for more</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['body'])->toBe('Check out for more');
});

it('collapses blank lines left by stripping a hashtag-only paragraph', function () {
    $status = [
        'id' => '1',
        'content' => '<p>Great post today</p><p>#hiking #nature</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
        'tags' => [
            ['name' => 'hiking', 'url' => 'https://mastodon.example/tags/hiking'],
            ['name' => 'nature', 'url' => 'https://mastodon.example/tags/nature'],
        ],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['body'])->toBe('Great post today');
});
