<?php

namespace App\Services\Feed;

class MentionClassifier
{
    public const ROLE_INLINE = 'inline';

    public const ROLE_CHIP = 'chip';

    /**
     * @param  string  $text  Plain text the mentions were found in.
     * @param  array<int, array{id: string, start: int, end: int}>  $mentions  Byte offsets within $text. 'id' is a platform-specific identity key (e.g. Mastodon acct, Bluesky did) used only for origin matching — exact, case-sensitive match. Order is not assumed.
     * @param  string|null  $originId  Identity key of the reply/quote origin author, in the same id-space as $mentions[]['id']. Null if there is no origin (not a reply/quote, or origin unknown).
     * @return array<int, array{id: string, start: int, end: int, role: string, strip: bool}> Same entries as input, sorted by start offset, with 'role' and 'strip' added. 'strip' indicates whether the mention text should be removed from the body when rendered as a chip.
     */
    public function classify(string $text, array $mentions, ?string $originId): array
    {
        if (empty($mentions)) {
            return [];
        }

        $sorted = $mentions;
        usort($sorted, fn (array $a, array $b) => $a['start'] <=> $b['start']);

        $leadingRun = $this->leadingRunLength($text, $sorted);
        $trailingRun = $this->trailingRunLength($text, $sorted);
        $count = count($sorted);

        return array_map(function (array $mention, int $index) use ($leadingRun, $trailingRun, $count, $originId) {
            $inTrailing = $index >= $count - $trailingRun;
            $inLeading = $index < $leadingRun;
            $isOrigin = $originId !== null && $mention['id'] === $originId;

            $role = self::ROLE_INLINE;
            $strip = true;

            if ($inTrailing) {
                $role = self::ROLE_CHIP;
            } elseif ($inLeading) {
                if ($leadingRun === 1) {
                    // A single leading mention that matches the reply origin is a pure address
                    // header (safe to strip). One that does NOT match origin may be grammatically
                    // integrated ("@Jyoti was your dad an anaesthetist?") — show the chip but
                    // leave the text in place so the sentence remains coherent.
                    $role = self::ROLE_CHIP;
                    $strip = $isOrigin;
                } else {
                    $role = $isOrigin ? self::ROLE_INLINE : self::ROLE_CHIP;
                }
            }

            $mention['role'] = $role;
            $mention['strip'] = $strip;

            return $mention;
        }, $sorted, array_keys($sorted));
    }

    private function leadingRunLength(string $text, array $sortedMentions): int
    {
        $count = 0;
        $cursor = 0;

        foreach ($sortedMentions as $mention) {
            $gap = substr($text, $cursor, $mention['start'] - $cursor);
            if (trim($gap) !== '') {
                break;
            }
            $count++;
            $cursor = $mention['end'];
        }

        return $count;
    }

    private function trailingRunLength(string $text, array $sortedMentions): int
    {
        $count = 0;
        $cursor = strlen($text);

        foreach (array_reverse($sortedMentions) as $mention) {
            $gap = substr($text, $mention['end'], $cursor - $mention['end']);
            if (trim($gap) !== '') {
                break;
            }
            $count++;
            $cursor = $mention['start'];
        }

        return $count;
    }
}
