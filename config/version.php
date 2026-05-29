<?php

return [
    'version' => env('APP_VERSION'),
    'pr_number' => env('APP_PR_NUMBER'),
    'branch' => env('APP_BRANCH'),
    'git_head_path' => base_path('.git/HEAD'),
];
