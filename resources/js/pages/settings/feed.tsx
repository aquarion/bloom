import { Head, useForm } from '@inertiajs/react';
import { X } from 'lucide-react';
import { useState } from 'react';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import SettingsPageLayout from '@/layouts/settings-page-layout';
import type { ContentBehavior, FeedPreferences } from '@/types/preferences';
import type { CwCategory } from '@/types/post';

const CW_LABEL_OPTIONS: {
    value: CwCategory;
    label: string;
    warning?: string;
}[] = [
    { value: 'adult', label: 'Adult content' },
    { value: 'graphic', label: 'Graphic media' },
    {
        value: 'safety',
        label: 'Self-harm & threats',
        warning:
            'You will stop seeing warnings for self-harm, threats, and intolerance.',
    },
    { value: 'generic', label: 'Content warning (generic)' },
];

export default function FeedSettings({
    preferences,
    status,
}: {
    preferences: FeedPreferences;
    status?: string;
}) {
    const { data, setData, put, processing, errors } = useForm({
        max_age_days: preferences.max_age_days,
        mute_words: preferences.mute_words,
        cw_behavior: preferences.cw_behavior,
        sensitive_media_behavior: preferences.sensitive_media_behavior,
        cw_label_whitelist: preferences.cw_label_whitelist,
    });

    // Laravel's `field.*` array validation reports errors as indexed keys
    // (`cw_label_whitelist.0`), not the bare field name — find the first one
    // so an invalid entry's message actually reaches the user.
    const cwLabelWhitelistError = Object.entries(errors).find(([key]) =>
        key.startsWith('cw_label_whitelist'),
    )?.[1];

    function toggleCwLabelWhitelist(category: CwCategory, checked: boolean) {
        setData(
            'cw_label_whitelist',
            checked
                ? [...data.cw_label_whitelist, category]
                : data.cw_label_whitelist.filter((c) => c !== category),
        );
    }

    const [muteInput, setMuteInput] = useState('');

    function addMuteWord() {
        const word = muteInput.trim();

        if (word && !data.mute_words.includes(word)) {
            setData('mute_words', [...data.mute_words, word]);
        }

        setMuteInput('');
    }

    function removeMuteWord(word: string) {
        setData(
            'mute_words',
            data.mute_words.filter((w) => w !== word),
        );
    }

    function submit(e: React.FormEvent) {
        e.preventDefault();
        put('/settings/feed');
    }

    return (
        <SettingsPageLayout>
            <Head title="Feed settings" />
            <h1 className="sr-only">Feed settings</h1>

            <form onSubmit={submit} className="space-y-6">
                <Heading
                    variant="small"
                    title="Feed settings"
                    description="Control what appears in your feed."
                />

                {status === 'feed-settings-updated' && (
                    <p className="font-medium text-green-600 text-sm">
                        Feed settings saved.
                    </p>
                )}

                {/* Age cutoff */}
                <div className="space-y-2">
                    <Label htmlFor="max_age_days">
                        Hide posts older than (days)
                    </Label>
                    <div className="flex items-center gap-3">
                        <Input
                            id="max_age_days"
                            type="number"
                            min={1}
                            max={365}
                            value={data.max_age_days ?? ''}
                            onChange={(e) =>
                                setData(
                                    'max_age_days',
                                    e.target.value === ''
                                        ? null
                                        : Number(e.target.value),
                                )
                            }
                            className="w-24"
                            placeholder="7"
                        />
                        <label className="flex items-center gap-1.5 text-muted-foreground text-sm">
                            <input
                                type="checkbox"
                                checked={data.max_age_days === null}
                                onChange={(e) =>
                                    setData(
                                        'max_age_days',
                                        e.target.checked ? null : 7,
                                    )
                                }
                            />
                            No limit
                        </label>
                    </div>
                    <p className="text-muted-foreground text-xs">
                        Boosted posts always appear regardless of age.
                    </p>
                    {errors.max_age_days && (
                        <p className="text-destructive text-sm">
                            {errors.max_age_days}
                        </p>
                    )}
                </div>

                {/* Mute words */}
                <div className="space-y-2">
                    <Label>Mute words</Label>
                    <div className="flex gap-2">
                        <Input
                            value={muteInput}
                            onChange={(e) => setMuteInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    addMuteWord();
                                }
                            }}
                            placeholder="Add a word or phrase…"
                            className="flex-1"
                        />
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={addMuteWord}
                        >
                            Add
                        </Button>
                    </div>
                    {data.mute_words.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {data.mute_words.map((word) => (
                                <span
                                    key={word}
                                    className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm"
                                >
                                    {word}
                                    <button
                                        type="button"
                                        onClick={() => removeMuteWord(word)}
                                        className="text-muted-foreground hover:text-foreground"
                                        aria-label={`Remove "${word}"`}
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* CW behavior */}
                <div className="space-y-2">
                    <Label htmlFor="cw_behavior">
                        Posts with content warnings
                    </Label>
                    <Select
                        value={data.cw_behavior}
                        onValueChange={(v) =>
                            setData('cw_behavior', v as ContentBehavior)
                        }
                    >
                        <SelectTrigger id="cw_behavior" className="w-48">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="show">Show</SelectItem>
                            <SelectItem value="blur">
                                Blur (tap to reveal)
                            </SelectItem>
                            <SelectItem value="skip">Skip</SelectItem>
                        </SelectContent>
                    </Select>
                    {errors.cw_behavior && (
                        <p className="text-destructive text-sm">
                            {errors.cw_behavior}
                        </p>
                    )}
                </div>

                {/* CW label whitelist */}
                <div className="space-y-2">
                    <Label>Always show these content warning types</Label>
                    <p className="text-muted-foreground text-xs">
                        Posts labelled with a whitelisted type skip the content
                        warning above entirely.
                    </p>
                    <div className="space-y-2">
                        {CW_LABEL_OPTIONS.map((option) => {
                            const checked = data.cw_label_whitelist.includes(
                                option.value,
                            );

                            return (
                                <div key={option.value}>
                                    <label className="flex items-center gap-2 text-sm">
                                        <Checkbox
                                            checked={checked}
                                            onCheckedChange={(next) =>
                                                toggleCwLabelWhitelist(
                                                    option.value,
                                                    next === true,
                                                )
                                            }
                                        />
                                        {option.label}
                                    </label>
                                    {checked && option.warning && (
                                        <p className="mt-1 ml-6 text-destructive text-xs">
                                            {option.warning}
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    {cwLabelWhitelistError && (
                        <p className="text-destructive text-sm">
                            {cwLabelWhitelistError}
                        </p>
                    )}
                </div>

                {/* Sensitive media behavior */}
                <div className="space-y-2">
                    <Label htmlFor="sensitive_media_behavior">
                        Posts with sensitive media
                    </Label>
                    <Select
                        value={data.sensitive_media_behavior}
                        onValueChange={(v) =>
                            setData(
                                'sensitive_media_behavior',
                                v as ContentBehavior,
                            )
                        }
                    >
                        <SelectTrigger
                            id="sensitive_media_behavior"
                            className="w-48"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="show">Show</SelectItem>
                            <SelectItem value="blur">
                                Blur (tap to reveal)
                            </SelectItem>
                            <SelectItem value="skip">Skip</SelectItem>
                        </SelectContent>
                    </Select>
                    {errors.sensitive_media_behavior && (
                        <p className="text-destructive text-sm">
                            {errors.sensitive_media_behavior}
                        </p>
                    )}
                </div>

                <Button type="submit" disabled={processing}>
                    Save
                </Button>
            </form>
        </SettingsPageLayout>
    );
}

FeedSettings.layout = {
    breadcrumbs: [
        {
            title: 'Feed settings',
            href: '/settings/feed',
        },
    ],
};
