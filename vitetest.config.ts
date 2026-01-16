import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node', // fast-xml-parser works in Node.js and browsers
        coverage: {
            provider: 'v8',
        },
    },
});
