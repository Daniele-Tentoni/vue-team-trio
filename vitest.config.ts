import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        restoreMocks: true,
        unstubGlobals: true,
        clearMocks: true,
        coverage: {
            provider: 'v8',
            include: ['src/stores/**/*.ts', 'src/services/**/*.ts'],
            reporter: ['text', 'html', 'lcov', 'json-summary'],
            thresholds: {
                perFile: true,
                statements: 90,
                branches: 90,
                functions: 90,
                lines: 90,
            },
        },
    },
})
