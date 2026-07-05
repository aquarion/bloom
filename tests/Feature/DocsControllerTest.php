<?php

it('renders a document by slug', function () {
    $slug = 'test-'.str_replace('.', '', uniqid());
    $path = resource_path("docs/{$slug}.md");
    if (! is_dir(dirname($path))) {
        mkdir(dirname($path), 0755, true);
    }
    file_put_contents($path, "---\ntitle: Test Document\nlast_updated: \"2026-07-05\"\n---\n\n## Hello\n\nThis is a test.");

    try {
        $this->withoutVite()->get("/docs/{$slug}")
            ->assertInertia(fn ($page) => $page
                ->component('docs/show', false)
                ->where('title', 'Test Document')
                ->where('last_updated', '2026-07-05')
                ->has('content')
            );
    } finally {
        @unlink($path);
    }
});

it('returns 404 for a missing document', function () {
    $this->get('/docs/nonexistent-document')->assertStatus(404);
});

it('returns 404 for a slug with uppercase characters', function () {
    $this->get('/docs/Privacy')->assertStatus(404);
});

it('returns 404 for a slug with underscores', function () {
    $this->get('/docs/privacy_policy')->assertStatus(404);
});

it('includes rendered html in content prop', function () {
    $slug = 'html-'.str_replace('.', '', uniqid());
    $path = resource_path("docs/{$slug}.md");
    if (! is_dir(dirname($path))) {
        mkdir(dirname($path), 0755, true);
    }
    file_put_contents($path, "---\ntitle: HTML Test\n---\n\n## Section\n\nParagraph text.");

    try {
        $this->withoutVite()->get("/docs/{$slug}")
            ->assertInertia(fn ($page) => $page
                ->where('content', fn ($content) => str_contains($content, '<h2>') && str_contains($content, '<p>'))
            );
    } finally {
        @unlink($path);
    }
});
