<?php

namespace App\Mail;

use App\Models\Tombstone;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class TombstoneRecovery extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly Tombstone $tombstone,
        public readonly string $recoveryUrl,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Your account was archived',
        );
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'mail.tombstone-recovery',
        );
    }
}
