import { X } from 'lucide-react';
import { Label } from '@/components/ui/label';
import type { FeedSettingsFieldProps } from './types';

export default function AlwaysShownAuthorsField({
    data,
    setData,
    errors,
}: FeedSettingsFieldProps) {
    function removeWhitelistedAuthor(handle: string) {
        setData(
            'cw_author_whitelist',
            data.cw_author_whitelist.filter((h) => h !== handle),
        );
    }

    if (data.cw_author_whitelist.length === 0) {
        return null;
    }

    return (
        <div className="space-y-2">
            <Label>Always-shown authors</Label>
            <p className="text-muted-foreground text-xs">
                Revealing an author-level content warning in the feed adds them
                here — their posts skip the warning from now on.
            </p>
            <div className="flex flex-wrap gap-2">
                {data.cw_author_whitelist.map((handle) => (
                    <span
                        key={handle}
                        className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm"
                    >
                        {handle}
                        <button
                            type="button"
                            onClick={() => removeWhitelistedAuthor(handle)}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label={`Remove "${handle}"`}
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </span>
                ))}
            </div>
            {errors.cw_author_whitelist && (
                <p className="text-destructive text-sm">
                    {errors.cw_author_whitelist}
                </p>
            )}
        </div>
    );
}
