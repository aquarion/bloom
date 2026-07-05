<?php

use League\CommonMark\Environment\Environment;
use League\CommonMark\Extension\CommonMark\CommonMarkCoreExtension;
use League\CommonMark\Extension\FrontMatter\FrontMatterExtension;
use League\CommonMark\Extension\FrontMatter\Output\RenderedContentWithFrontMatter;
use League\CommonMark\Extension\Table\TableExtension;
use League\CommonMark\MarkdownConverter;

function makeConverter(): MarkdownConverter
{
    $environment = new Environment;
    $environment->addExtension(new CommonMarkCoreExtension);
    $environment->addExtension(new FrontMatterExtension);
    $environment->addExtension(new TableExtension);

    return new MarkdownConverter($environment);
}

it('parses yaml frontmatter and renders markdown to html', function () {
    $result = makeConverter()->convert("---\ntitle: Test\nlast_updated: \"2026-07-05\"\n---\n\n## Hello\n\nWorld.");

    expect($result)->toBeInstanceOf(RenderedContentWithFrontMatter::class);
    expect($result->getFrontMatter())->toMatchArray(['title' => 'Test', 'last_updated' => '2026-07-05']);
    expect((string) $result)->toContain('<h2>Hello</h2>')->toContain('<p>World.</p>');
});

it('renders markdown tables to html', function () {
    $result = makeConverter()->convert("| A | B |\n|---|---|\n| 1 | 2 |");

    expect((string) $result)->toContain('<table>')->toContain('<th>A</th>')->toContain('<td>1</td>');
});
