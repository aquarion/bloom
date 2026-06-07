import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InstanceCombobox from './InstanceCombobox';

vi.mock('axios');

beforeEach(() => {
    vi.mocked(axios.get).mockReset();
});

describe('InstanceCombobox', () => {
    it('renders an input with the given id and placeholder', () => {
        render(
            <InstanceCombobox
                id="instance_url"
                name="instance_url"
                placeholder="mastodon.social"
            />,
        );

        const input = screen.getByRole('combobox');
        expect(input).toBeInTheDocument();
        expect(input).toHaveAttribute('placeholder', 'mastodon.social');
        expect(input).toHaveAttribute('id', 'instance_url');
    });

    it('does not fetch when fewer than 2 characters are typed', async () => {
        render(<InstanceCombobox id="instance_url" name="instance_url" />);

        await userEvent.type(screen.getByRole('combobox'), 'm');

        expect(axios.get).not.toHaveBeenCalled();
    });

    it('fetches and displays suggestions after typing 2+ characters', async () => {
        vi.mocked(axios.get).mockResolvedValue({
            data: [
                { name: 'mastodon.social', description: 'The original server' },
                { name: 'mastodon.world', description: 'A general instance' },
            ],
        });

        render(<InstanceCombobox id="instance_url" name="instance_url" />);

        await userEvent.type(screen.getByRole('combobox'), 'ma');

        await waitFor(() => {
            expect(screen.getByText('mastodon.social')).toBeInTheDocument();
            expect(screen.getByText('The original server')).toBeInTheDocument();
            expect(screen.getByText('mastodon.world')).toBeInTheDocument();
        });
    });

    it('fills the hidden input when a suggestion is selected', async () => {
        vi.mocked(axios.get).mockResolvedValue({
            data: [
                { name: 'mastodon.social', description: 'The original server' },
            ],
        });

        render(<InstanceCombobox id="instance_url" name="instance_url" />);

        await userEvent.type(screen.getByRole('combobox'), 'ma');

        await waitFor(() => {
            expect(screen.getByText('mastodon.social')).toBeInTheDocument();
        });

        await userEvent.click(screen.getByText('mastodon.social'));

        const hidden = document.querySelector(
            'input[name="instance_url"][type="hidden"]',
        ) as HTMLInputElement;
        expect(hidden?.value).toBe('mastodon.social');
    });

    it('shows no dropdown when the fetch returns an empty array', async () => {
        vi.mocked(axios.get).mockResolvedValue({ data: [] });

        render(<InstanceCombobox id="instance_url" name="instance_url" />);

        await userEvent.type(screen.getByRole('combobox'), 'zz');

        await waitFor(() => {
            expect(axios.get).toHaveBeenCalled();
        });

        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('shows no dropdown when the fetch errors', async () => {
        vi.mocked(axios.get).mockRejectedValue(new Error('Network error'));

        render(<InstanceCombobox id="instance_url" name="instance_url" />);

        await userEvent.type(screen.getByRole('combobox'), 'ma');

        await waitFor(() => {
            expect(axios.get).toHaveBeenCalled();
        });

        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
});
