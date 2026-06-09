<?php

use Illuminate\Support\Facades\Http;

test('home page renders for guests', function () {
    Http::fake([
        'mastodon.social/api/v1/timelines/public*' => Http::response([]),
    ]);

    $response = $this->withoutVite()->get(route('home'));
    $response->assertOk();
});
