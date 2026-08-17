import { Head, useForm } from '@inertiajs/react';
import { Filter, Palette, TriangleAlert } from 'lucide-react';
import AppearanceToggleTab from '@/components/appearance-tabs';
import Heading from '@/components/heading';
import AgeCutoffField from '@/components/settings/feed/age-cutoff-field';
import AlwaysShownAuthorsField from '@/components/settings/feed/always-shown-authors-field';
import CwBehaviorField from '@/components/settings/feed/cw-behavior-field';
import CwLabelWhitelistField from '@/components/settings/feed/cw-label-whitelist-field';
import MuteWordsField from '@/components/settings/feed/mute-words-field';
import ReduceMotionField from '@/components/settings/feed/reduce-motion-field';
import SensitiveMediaBehaviorField from '@/components/settings/feed/sensitive-media-behavior-field';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import SettingsPageLayout from '@/layouts/settings-page-layout';
import type { FeedPreferences } from '@/types/preferences';

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
        cw_author_whitelist: preferences.cw_author_whitelist,
        reduce_motion: preferences.reduce_motion,
    });

    function submit(e: React.FormEvent) {
        e.preventDefault();
        put('/settings/feed');
    }

    const fieldProps = { data, setData, errors };

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

                {/* Limits */}
                <section className="rounded-lg border p-6">
                    <h3 className="mb-4 flex items-center gap-2 font-semibold text-base">
                        <Filter className="size-4" /> Limits
                    </h3>
                    <div className="space-y-4">
                        <AgeCutoffField {...fieldProps} />
                        <MuteWordsField {...fieldProps} />
                    </div>
                </section>

                {/* Content Warnings */}
                <section className="rounded-lg border p-6">
                    <h3 className="mb-4 flex items-center gap-2 font-semibold text-base">
                        <TriangleAlert className="size-4" /> Content Warnings
                    </h3>
                    <div className="space-y-4">
                        <CwBehaviorField {...fieldProps} />
                        <CwLabelWhitelistField {...fieldProps} />
                        <AlwaysShownAuthorsField {...fieldProps} />
                        <SensitiveMediaBehaviorField {...fieldProps} />
                    </div>
                </section>

                {/* Appearance */}
                <section className="rounded-lg border p-6">
                    <h3 className="mb-4 flex items-center gap-2 font-semibold text-base">
                        <Palette className="size-4" /> Appearance
                    </h3>
                    <div className="space-y-4">
                        {/* Theme */}
                        <div className="space-y-2">
                            <Label className="sr-only">Theme</Label>
                            <AppearanceToggleTab />
                            <p className="text-muted-foreground text-xs">
                                Choose how Bloom looks.
                            </p>
                        </div>

                        <ReduceMotionField {...fieldProps} />
                    </div>
                </section>

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
