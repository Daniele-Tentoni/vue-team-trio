import { defineConfig } from '@playwright/test'

export default defineConfig({
    testDir: './e2e',
    fullyParallel: false,
    use: {
        baseURL: 'http://127.0.0.1:4173/vue-team-trio/',
        viewport: { width: 1440, height: 1100 },
        trace: 'retain-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: {
                browserName: 'chromium',
                channel: !process.env.CI && process.platform === 'win32' ? 'msedge' : undefined,
            },
        },
        ...(process.env.CI ? [{ name: 'firefox', use: { browserName: 'firefox' as const } }] : []),
    ],
    webServer: {
        command: 'npm run preview -- --port 4173 --strictPort',
        url: 'http://127.0.0.1:4173/vue-team-trio/',
        reuseExistingServer: false,
    },
})
