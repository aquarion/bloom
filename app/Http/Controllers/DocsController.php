<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
use Inertia\Response;
use League\CommonMark\Environment\Environment;
use League\CommonMark\Exception\CommonMarkException;
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

        try {
            $markdown = File::get($path);
        } catch (\Exception $e) {
            Log::error('Failed to read documentation file', ['slug' => $slug, 'error' => $e->getMessage()]);
            abort(500);
        }

        $environment = new Environment([
            'html_input' => 'strip',
            'allow_unsafe_links' => false,
        ]);
        $environment->addExtension(new CommonMarkCoreExtension);
        $environment->addExtension(new FrontMatterExtension);
        $environment->addExtension(new TableExtension);
        $converter = new MarkdownConverter($environment);

        try {
            $result = $converter->convert($markdown);
        } catch (CommonMarkException $e) {
            Log::error('Failed to parse documentation file', ['slug' => $slug, 'error' => $e->getMessage()]);
            abort(500);
        }

        $frontMatter = $result instanceof RenderedContentWithFrontMatter
            ? $result->getFrontMatter()
            : [];

        if (! is_array($frontMatter)) {
            Log::warning('Documentation file has non-array frontmatter', ['slug' => $slug, 'type' => gettype($frontMatter)]);
            $frontMatter = [];
        }

        return Inertia::render('docs/show', [
            'title' => $frontMatter['title'] ?? ucwords(str_replace('-', ' ', $slug)),
            'content' => (string) $result,
            'last_updated' => isset($frontMatter['last_updated']) ? (string) $frontMatter['last_updated'] : null,
        ]);
    }
}
