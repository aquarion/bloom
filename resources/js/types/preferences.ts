export type ContentBehavior = 'skip' | 'blur' | 'show';

export interface FeedPreferences {
    max_age_days: number | null;
    mute_words: string[];
    cw_behavior: ContentBehavior;
    sensitive_media_behavior: ContentBehavior;
}
