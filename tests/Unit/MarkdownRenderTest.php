<?php

use League\CommonMark\Environment\Environment;
use League\CommonMark\Extension\CommonMark\CommonMarkCoreExtension;
use League\CommonMark\Extension\FrontMatter\FrontMatterExtension;
use League\CommonMark\Extension\FrontMatter\Output\RenderedContentWithFrontMatter;
use League\CommonMark\MarkdownConverter;

it('parses yaml frontmatter and renders markdown to html', function () {
    $environment = new Environment;
    $environment->addExtension(new CommonMarkCoreExtension);
    $environment->addExtension(new FrontMatterExtension);
    $converter = new MarkdownConverter($environment);

    $result = $converter->convert("---\ntitle: Test\nlast_updated: \"2026-07-05\"\n---\n\n## Hello\n\nWorld.");

    expect($result)->toBeInstanceOf(RenderedContentWithFrontMatter::class);
    expect($result->getFrontMatter())->toMatchArray(['title' => 'Test', 'last_updated' => '2026-07-05']);
    expect((string) $result)->toContain('<h2>Hello</h2>')->toContain('<p>World.</p>');
});
