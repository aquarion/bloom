<?php

use App\Services\Feed\PostNormalizer;

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

it('truncates long urls in post bodies', function () {
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

    expect($post['body'])->toBe('Check this out https://example.com/very/long/path/that…')
        ->and(mb_strlen('https://example.com/very/long/path/that…'))->toBe(40);
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
                    'author' => ['handle' => 'quoted.bsky.social'],
                    'value' => ['text' => 'quoted body'],
                ],
            ],
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['quoted_post'])->toBe([
        'author_handle' => '@quoted.bsky.social',
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
                        'author' => ['handle' => 'quoted.bsky.social'],
                        'value' => ['text' => 'quoted body with media'],
                    ],
                ],
            ],
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['quoted_post'])->toBe([
        'author_handle' => '@quoted.bsky.social',
        'body' => 'quoted body with media',
    ]);
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
