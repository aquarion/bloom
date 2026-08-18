import type { InertiaFormProps } from '@inertiajs/react';
import type { FeedPreferences } from '@/types/preferences';

export interface FeedSettingsFieldProps {
    data: FeedPreferences;
    setData: InertiaFormProps<FeedPreferences>['setData'];
    errors: InertiaFormProps<FeedPreferences>['errors'];
}
