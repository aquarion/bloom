import type { InertiaFormProps } from '@inertiajs/react';
import type { FeedPreferences } from '@/types/preferences';

export type FeedFormData = FeedPreferences;

export interface FeedSettingsFieldProps {
    data: FeedFormData;
    setData: InertiaFormProps<FeedFormData>['setData'];
    errors: InertiaFormProps<FeedFormData>['errors'];
}
