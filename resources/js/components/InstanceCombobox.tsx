import {
    Combobox,
    ComboboxInput,
    ComboboxOption,
    ComboboxOptions,
} from '@headlessui/react';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import mastodon from '@/routes/mastodon';

interface Suggestion {
    name: string;
    description: string;
}

interface InstanceComboboxProps {
    id: string;
    name: string;
    placeholder?: string;
}

export default function InstanceCombobox({
    id,
    name,
    placeholder,
}: InstanceComboboxProps) {
    const [value, setValue] = useState('');
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [loading, setLoading] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (value.length < 2) {
            return;
        }

        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        const controller = new AbortController();

        debounceRef.current = setTimeout(() => {
            setLoading(true);
            axios
                .get<Suggestion[]>(
                    mastodon.instances.url({ query: { q: value } }),
                    {
                        signal: controller.signal,
                    },
                )
                .then((res) => setSuggestions(res.data))
                .catch((err) => {
                    if (!axios.isCancel(err)) {
                        setSuggestions([]);
                    }
                })
                .finally(() => setLoading(false));
        }, 300);

        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }

            controller.abort();
        };
    }, [value]);

    return (
        <div className="relative">
            <Combobox
                value={value}
                onChange={(v: string | null) => setValue(v ?? '')}
            >
                <input type="hidden" name={name} value={value} />
                <div className="relative">
                    <ComboboxInput
                        id={id}
                        placeholder={placeholder}
                        autoComplete="off"
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        onChange={(e) => {
                            const newVal = e.target.value;

                            setValue(newVal);

                            if (newVal.length < 2) {
                                setSuggestions([]);
                                setLoading(false);
                            }
                        }}
                    />
                    {loading && (
                        <Loader2 className="absolute top-2 right-2 size-4 animate-spin text-muted-foreground" />
                    )}
                </div>
                {suggestions.length > 0 && (
                    <ComboboxOptions className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover py-1 shadow-md">
                        {suggestions.map((s) => (
                            <ComboboxOption
                                key={s.name}
                                value={s.name}
                                className="cursor-pointer px-3 py-2 text-sm data-focus:bg-accent data-focus:text-accent-foreground"
                            >
                                <p className="font-medium">{s.name}</p>
                                {s.description && (
                                    <p className="text-muted-foreground text-xs">
                                        {s.description}
                                    </p>
                                )}
                            </ComboboxOption>
                        ))}
                    </ComboboxOptions>
                )}
            </Combobox>
        </div>
    );
}
