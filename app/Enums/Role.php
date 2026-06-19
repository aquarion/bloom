<?php

namespace App\Enums;

enum Role: string
{
    case Admin = 'admin';
    case BetaTester = 'beta_tester';
    case Subscriber = 'subscriber';
}
