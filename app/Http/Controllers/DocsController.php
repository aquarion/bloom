<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\File;
use Inertia\Inertia;
use Inertia\Response;
use League\CommonMark\Environment\Environment;
use League\CommonMark\Extension\CommonMark\CommonMarkCoreExtension;
use League\CommonMark\Extension\FrontMatter\FrontMatterExtension;
use League\CommonMark\Extension\FrontMatter\Output\RenderedContentWithFrontMatter;
use League\CommonMark\Extension\Table\TableExtension;
use League\CommonMark\MarkdownConverter;

class DocsController extends Controller
{
    public function show(string $slug): Response
    {
        if (! preg_match('/^[a-z0-9-]+$/', $slug)) {
            abort(404);
        }

        $path = resource_path("docs/{$slug}.md");

        if (! File::exists($path)) {
            abort(404);
        }

        $markdown = File::get($path);

        $environment = new Environment([
            'html_input' => 'strip',
            'allow_unsafe_links' => false,
        ]);
        $environment->addExtension(new CommonMarkCoreExtension);
        $environment->addExtension(new FrontMatterExtension);
        $environment->addExtension(new TableExtension);
        $converter = new MarkdownConverter($environment);
        $result = $converter->convert($markdown);

        $frontMatter = $result instanceof RenderedContentWithFrontMatter
            ? $result->getFrontMatter()
            : [];

        return Inertia::render('docs/show', [
            'title' => $frontMatter['title'] ?? ucwords(str_replace('-', ' ', $slug)),
            'content' => (string) $result,
            'last_updated' => isset($frontMatter['last_updated']) ? (string) $frontMatter['last_updated'] : null,
        ]);
    }
}
