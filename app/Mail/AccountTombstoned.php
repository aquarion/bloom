<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class AccountTombstoned extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public readonly string $name) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Your account has been archived due to inactivity',
        );
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'mail.account-tombstoned',
        );
    }
}
