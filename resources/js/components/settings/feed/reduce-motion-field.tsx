import { Checkbox } from '@/components/ui/checkbox';
import type { FeedSettingsFieldProps } from './types';

export default function ReduceMotionField({
    data,
    setData,
}: FeedSettingsFieldProps) {
    return (
        <div className="space-y-2">
            {/* biome-ignore lint/a11y/noLabelWithoutControl: Radix Checkbox renders a button inside the label */}
            <label className="flex items-center gap-2 text-sm">
                <Checkbox
                    checked={data.reduce_motion}
                    onCheckedChange={(next) =>
                        setData('reduce_motion', next === true)
                    }
                />
                Reduce motion
            </label>
            <p className="text-muted-foreground text-xs">
                Posts fade between each other instead of tilting, spinning, or
                flipping in.
            </p>
        </div>
    );
}
