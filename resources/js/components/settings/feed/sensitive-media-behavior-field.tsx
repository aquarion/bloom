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

export default function SensitiveMediaBehaviorField({
    data,
    setData,
    errors,
}: FeedSettingsFieldProps) {
    return (
        <div className="space-y-2">
            <Label htmlFor="sensitive_media_behavior">
                Posts with sensitive media
            </Label>
            <Select
                value={data.sensitive_media_behavior}
                onValueChange={(v) =>
                    setData('sensitive_media_behavior', v as ContentBehavior)
                }
            >
                <SelectTrigger id="sensitive_media_behavior" className="w-48">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="show">Show</SelectItem>
                    <SelectItem value="blur">Blur (tap to reveal)</SelectItem>
                    <SelectItem value="skip">Skip</SelectItem>
                </SelectContent>
            </Select>
            {errors.sensitive_media_behavior && (
                <p className="text-destructive text-sm">
                    {errors.sensitive_media_behavior}
                </p>
            )}
        </div>
    );
}
