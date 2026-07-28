import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { describe, expect, it } from 'vitest';

describe('react / react-dom versions', () => {
    it('stay in lockstep', () => {
        // react and react-dom ship in lockstep and react-dom refuses to
        // render (throws "Incompatible React versions") the moment they
        // drift apart. Dependabot can bump one without the other since
        // they're separate package.json entries, so this asserts what
        // every component test already assumes implicitly.
        expect(ReactDOM.version).toBe(React.version);
    });
});
