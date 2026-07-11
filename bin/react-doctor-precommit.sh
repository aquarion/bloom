#!/bin/bash

############################################################################
##### Pre-commit gate: blocks staged React Doctor regressions
############################################################################

output=$(react-doctor --staged --blocking warning 2>&1) && exit 0

{
    printf "%s\n" "$output" ""
    echo "React Doctor found staged regressions."
    echo "Run react-doctor --staged --blocking warning to inspect."
    echo "Want them fixed? Ask your agent to run that command and resolve the findings."
} >&2
exit 1
