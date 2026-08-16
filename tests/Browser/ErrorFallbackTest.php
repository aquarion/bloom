<?php

use Laravel\Dusk\Browser;

test('the plain-DOM error fallback is present but hidden on a normal page load', function () {
    $this->browse(function (Browser $browser) {
        $browser->visit('/login')
            ->assertPresent('#app-fallback')
            ->assertMissing('#app-fallback');
    });
});

test('the plain-DOM error fallback becomes visible with its reload link once revealed', function () {
    $this->browse(function (Browser $browser) {
        $browser->visit('/login')
            ->script([
                "document.getElementById('app-fallback').classList.remove('hidden')",
                "document.getElementById('app-fallback').classList.add('flex')",
            ]);

        $browser->assertVisible('#app-fallback')
            ->assertSee('Something went wrong.')
            ->assertSeeLink('Reload page');
    });
});
