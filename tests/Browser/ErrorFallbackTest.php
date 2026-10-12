<?php

test('the plain-DOM error fallback is present but hidden on a normal page load', function () {
    visit('/login')
        ->assertPresent('#app-fallback')
        ->assertMissing('#app-fallback')
        ->assertNoJavaScriptErrors();
});

test('the plain-DOM error fallback becomes visible with its reload link once revealed', function () {
    $page = visit('/login');

    $page->script(<<<'JS'
        () => {
            const fallback = document.getElementById('app-fallback');
            fallback.classList.remove('hidden');
            fallback.classList.add('flex');
        }
    JS);

    $page->assertVisible('#app-fallback')
        ->assertSeeIn('#app-fallback', 'Something went wrong.')
        ->assertSeeLink('Reload page');
});
