<?php

test('the error-fallback reload link is present and hidden by default', function () {
    $response = $this->withoutVite()->get(route('login'));

    $response->assertOk()
        ->assertSee('id="app-fallback"', false)
        ->assertSee('Something went wrong.', false)
        ->assertSee('Reload page', false);
});

test('the error-fallback reload link preserves the query string', function () {
    $response = $this->withoutVite()->get(route('login', ['redirect' => '/settings/feed']));

    $response->assertOk()
        ->assertSee('href="'.route('login', ['redirect' => '/settings/feed']).'"', false);
});
