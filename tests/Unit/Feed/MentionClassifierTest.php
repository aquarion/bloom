<?php

use App\Services\Feed\MentionClassifier;

it('returns empty array for no mentions', function () {
    $result = (new MentionClassifier)->classify('hello world', [], null);
    expect($result)->toBe([]);
});

it('classifies a single mid-text mention as inline', function () {
    $text = 'thanks @alice for the help';
    $mentions = [['id' => 'alice', 'start' => 7, 'end' => 13]];
    $result = (new MentionClassifier)->classify($text, $mentions, null);
    expect($result[0]['role'])->toBe('inline');
});

it('classifies a single leading mention as chip without stripping when it has no origin match', function () {
    $text = '@alice thanks for the help';
    $mentions = [['id' => 'alice', 'start' => 0, 'end' => 6]];
    $result = (new MentionClassifier)->classify($text, $mentions, null);
    expect($result[0]['role'])->toBe('chip')
        ->and($result[0]['strip'])->toBeFalse();
});

it('classifies a single leading mention that matches the origin as chip with stripping', function () {
    $text = '@alice thanks for the help';
    $mentions = [['id' => 'alice', 'start' => 0, 'end' => 6]];
    $result = (new MentionClassifier)->classify($text, $mentions, 'alice');
    expect($result[0]['role'])->toBe('chip')
        ->and($result[0]['strip'])->toBeTrue();
});

it('classifies a trailing run of any size as chip, regardless of origin', function () {
    $text = 'check this out @bob @carol';
    $mentions = [
        ['id' => 'bob', 'start' => 15, 'end' => 19],
        ['id' => 'carol', 'start' => 20, 'end' => 26],
    ];
    $result = (new MentionClassifier)->classify($text, $mentions, 'bob');
    expect($result[0]['role'])->toBe('chip')
        ->and($result[1]['role'])->toBe('chip');
});

it('in a multi-mention leading run, keeps the origin match inline and chips the rest', function () {
    $text = '@alice @bob thanks for the help';
    $mentions = [
        ['id' => 'alice', 'start' => 0, 'end' => 6],
        ['id' => 'bob', 'start' => 7, 'end' => 11],
    ];
    $result = (new MentionClassifier)->classify($text, $mentions, 'alice');
    expect($result[0]['role'])->toBe('inline')
        ->and($result[1]['role'])->toBe('chip');
});

it('in a multi-mention leading run with no origin match, chips all of them', function () {
    $text = '@alice @bob thanks for the help';
    $mentions = [
        ['id' => 'alice', 'start' => 0, 'end' => 6],
        ['id' => 'bob', 'start' => 7, 'end' => 11],
    ];
    $result = (new MentionClassifier)->classify($text, $mentions, 'carol');
    expect($result[0]['role'])->toBe('chip')
        ->and($result[1]['role'])->toBe('chip');
});

it('keeps mid-text mentions inline even when they match the origin', function () {
    $text = 'thanks @alice for the help';
    $mentions = [['id' => 'alice', 'start' => 7, 'end' => 13]];
    $result = (new MentionClassifier)->classify($text, $mentions, 'alice');
    expect($result[0]['role'])->toBe('inline');
});

it('trailing rule takes precedence when the only mentions are both leading and trailing', function () {
    $text = '@alice @bob';
    $mentions = [
        ['id' => 'alice', 'start' => 0, 'end' => 6],
        ['id' => 'bob', 'start' => 7, 'end' => 11],
    ];
    $result = (new MentionClassifier)->classify($text, $mentions, 'alice');
    expect($result[0]['role'])->toBe('chip')
        ->and($result[1]['role'])->toBe('chip');
});

it('treats a leading run as broken by intervening non-whitespace text', function () {
    $text = '@alice hi @bob thanks';
    $mentions = [
        ['id' => 'alice', 'start' => 0, 'end' => 6],
        ['id' => 'bob', 'start' => 10, 'end' => 14],
    ];
    $result = (new MentionClassifier)->classify($text, $mentions, 'bob');
    // @alice is in the leading run (size 1) -> chip.
    // @bob is mid-text (not leading, not trailing) -> inline.
    expect($result[0]['role'])->toBe('chip')
        ->and($result[1]['role'])->toBe('inline');
});

it('preserves input order and start/end offsets in the output', function () {
    $text = 'thanks @alice for the help';
    $mentions = [['id' => 'alice', 'start' => 7, 'end' => 13]];
    $result = (new MentionClassifier)->classify($text, $mentions, null);
    expect($result[0]['id'])->toBe('alice')
        ->and($result[0]['start'])->toBe(7)
        ->and($result[0]['end'])->toBe(13);
});
