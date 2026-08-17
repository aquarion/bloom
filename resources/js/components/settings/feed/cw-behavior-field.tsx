import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import type { ContentBehavior } from '@/types/preferences';
import type { FeedSettingsFieldProps } from './types';

export default function CwBehaviorField({
    data,
    setData,
    errors,
}: FeedSettingsFieldProps) {
    return (
        <div className="space-y-2">
            <Label htmlFor="cw_behavior">Posts with content warnings</Label>
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
                    <SelectItem value="blur">Blur (tap to reveal)</SelectItem>
                    <SelectItem value="skip">Skip</SelectItem>
                </SelectContent>
            </Select>
            {errors.cw_behavior && (
                <p className="text-destructive text-sm">{errors.cw_behavior}</p>
            )}
        </div>
    );
}
