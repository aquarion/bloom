import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { FeedSettingsFieldProps } from './types';

export default function AgeCutoffField({
    data,
    setData,
    errors,
}: FeedSettingsFieldProps) {
    return (
        <div className="space-y-2">
            <Label htmlFor="max_age_days">Hide posts older than (days)</Label>
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
                            setData('max_age_days', e.target.checked ? null : 7)
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
    );
}
