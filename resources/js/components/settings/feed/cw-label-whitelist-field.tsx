import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { CwCategory } from '@/types/post';
import type { FeedSettingsFieldProps } from './types';

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

export default function CwLabelWhitelistField({
    data,
    setData,
    errors,
}: FeedSettingsFieldProps) {
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

    return (
        <div className="space-y-2">
            <Label>Always show these content warning types</Label>
            <p className="text-muted-foreground text-xs">
                Posts labelled with a whitelisted type skip the content warning
                above entirely.
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
    );
}
