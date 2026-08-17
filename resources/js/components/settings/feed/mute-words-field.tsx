import { X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { FeedSettingsFieldProps } from './types';

export default function MuteWordsField({
    data,
    setData,
}: FeedSettingsFieldProps) {
    const [muteInput, setMuteInput] = useState('');

    function addMuteWord() {
        const word = muteInput.trim();

        if (word && !data.mute_words.includes(word)) {
            setData('mute_words', [...data.mute_words, word]);
        }

        setMuteInput('');
    }

    function removeMuteWord(word: string) {
        setData(
            'mute_words',
            data.mute_words.filter((w) => w !== word),
        );
    }

    return (
        <div className="space-y-2">
            <Label>Mute words</Label>
            <div className="flex gap-2">
                <Input
                    value={muteInput}
                    onChange={(e) => setMuteInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            addMuteWord();
                        }
                    }}
                    placeholder="Add a word or phrase…"
                    className="flex-1"
                />
                <Button type="button" variant="secondary" onClick={addMuteWord}>
                    Add
                </Button>
            </div>
            {data.mute_words.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {data.mute_words.map((word) => (
                        <span
                            key={word}
                            className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm"
                        >
                            {word}
                            <button
                                type="button"
                                onClick={() => removeMuteWord(word)}
                                className="text-muted-foreground hover:text-foreground"
                                aria-label={`Remove "${word}"`}
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
