import { test, expect } from '@playwright/test'
import type { Page, Route } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const knownCards = new Set([
    'Forest',
    'Island',
    'Mountain',
    'Llanowar Elves',
    'Counterspell',
    'Lightning Bolt',
    'Sol Ring',
])

async function scryfallResponse(route: Route): Promise<void> {
    const url = new URL(route.request().url())
    expect(url.pathname).toBe('/cards/named')
    expect([...url.searchParams.keys()]).toEqual(['exact'])
    expect(route.request().method()).toBe('GET')
    expect(route.request().postData()).toBeNull()
    expect(route.request().headers().referer).toBeUndefined()
    const name = url.searchParams.get('exact') ?? ''
    expect(name).not.toMatch(/[\r\n]/)
    await route.fulfill({
        status: knownCards.has(name) ? 200 : 404,
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
        body: JSON.stringify(
            knownCards.has(name)
                ? { name, legalities: { pauper: name === 'Sol Ring' ? 'not_legal' : 'legal' } }
                : { object: 'error', status: 404 }
        ),
    })
}

test.beforeEach(async ({ page }) => {
    await page.route('https://api.scryfall.com/**', scryfallResponse)
})

async function openApp(page: Page): Promise<void> {
    await page.goto('./')
    await expect(page.locator('.legality-info')).toContainText('Scryfall')
    await page.waitForLoadState('networkidle')
}

test('contribution footer links to GitHub without automatic external requests', async ({
    page,
}) => {
    const requests: string[] = []
    page.on('request', (request) => requests.push(request.url()))
    await openApp(page)
    const footer = page.locator('.contribution-footer')
    const repository = 'https://github.com/Daniele-Tentoni/vue-team-trio'
    await expect(footer.getByRole('heading', { name: 'Contribuisci a Trio' })).toBeVisible()
    await expect(footer.getByRole('link', { name: 'Repository GitHub' })).toHaveAttribute(
        'href',
        repository
    )
    await expect(footer.getByRole('link', { name: 'Segnala un problema' })).toHaveAttribute(
        'href',
        `${repository}/issues`
    )
    await expect(footer.getByRole('link', { name: 'Proponi una modifica' })).toHaveAttribute(
        'href',
        `${repository}/pulls`
    )
    await expect(footer.getByRole('link')).toHaveCount(3)
    const links = await footer.getByRole('link').all()
    for (const link of links) {
        await expect(link).toHaveAttribute('target', '_blank')
        await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
        await expect(link).toHaveAttribute('referrerpolicy', 'no-referrer')
    }
    expect(requests.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true)
    for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        await footer.scrollIntoViewIfNeeded()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
            true
        )
        await footer.screenshot({ path: test.info().outputPath(`contribution-${width}.png`) })
    }
})

test('GitHub Pages 404 redirects nested missing pages to the app and preserves its base path', async ({
    page,
}) => {
    const errorPage = await readFile('dist/404.html', 'utf8')
    await page.route('**/vue-team-trio/missing/deep-page', (route) =>
        route.fulfill({
            status: 404,
            contentType: 'text/html',
            body: errorPage,
        })
    )
    await page.goto('./missing/deep-page')
    await expect(page).toHaveURL('http://127.0.0.1:4173/vue-team-trio/')
    await expect(page.getByRole('link', { name: 'Trio, inizio' })).toHaveAttribute(
        'href',
        '/vue-team-trio/'
    )
    await expect(page.locator('.art-ribbon span')).toContainText('Crop Rotation')
})

async function fillValidDecks(page: Page): Promise<void> {
    for (const [seat, text] of [
        '60 Forest\nSIDEBOARD:\n1 Llanowar Elves',
        '60 Island\nSIDEBOARD:\n1 Counterspell',
        '60 Mountain\nSIDEBOARD:\n1 Lightning Bolt',
    ].entries())
        await page.locator(`#list-${seat}`).fill(text)
}

test('uses MD3 components with a working local-icon format selector and readable mobile footer', async ({
    page,
}) => {
    await openApp(page)
    await expect(page.locator('.v-application')).toHaveClass(/v-theme--trio/)
    await expect(page.locator('.deck-panel.v-card')).toHaveCount(3)
    await expect(page.locator('.source-tabs.v-btn-group')).toHaveCount(3)
    await expect(page.locator('.v-select .v-icon svg')).toHaveClass(/lucide-chevron-down/)
    await page.locator('.tournament-format .v-field').click()
    await expect(page.getByRole('listbox')).toBeVisible()
    await page.getByRole('option', { name: 'Team Trio Pauper' }).click()
    await expect(page.getByRole('listbox')).toBeHidden()
    await page.setViewportSize({ width: 390, height: 900 })
    const caption = await page.locator('.page-footer > span').nth(1).boundingBox()
    expect(caption?.width).toBeGreaterThan(180)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('shows illegal cards, main/side warnings, syntax errors and matching conflict colors', async ({
    page,
}) => {
    await openApp(page)
    await page.locator('#list-0').fill('59 Forest\n1 Sol Ring\nSIDEBOARD:\n16 Island')
    await page.locator('#list-1').fill('60 Island\nSIDEBOARD:\n1 Forest')
    await page.locator('#list-2').fill('60 Mountain\nSIDEBOARD:\n1 Forest')
    await expect(page.locator('.card-illegal')).toHaveCount(1)
    await expect(page.locator('.size-warning')).toContainText('16/15')
    await expect(page.locator('.conflict-chip')).toHaveCount(2)
    await expect(page.getByRole('button', { name: 'Esporta il team' })).toHaveCount(0)
    const forests = page
        .locator('.card-conflict')
        .filter({ has: page.locator('.card-name', { hasText: /^Forest$/ }) })
    await expect(forests).toHaveCount(3)
    const colors = await forests.evaluateAll((elements) =>
        elements.map((element) => getComputedStyle(element).borderLeftColor)
    )
    expect(new Set(colors).size).toBe(1)
    await page.locator('.card-illegal').focus()
    await expect(page.locator('.card-illegal .card-tooltip')).toBeVisible()
    await expect(page.locator('.card-illegal .card-tooltip')).toContainText('Pauper')
    await page.locator('#list-0').fill('59 Forest\ninvalid line')
    await expect(page.locator('.size-warning').first()).toContainText('mancano 1 carte')
    await expect(page.locator('.parse-errors')).toContainText('Riga 2')
    await page.screenshot({ path: test.info().outputPath('conflicts-desktop.png'), fullPage: true })
})

test('exports an actual UTF-8 text file only after all lists and names are complete', async ({
    page,
}) => {
    await openApp(page)
    await fillValidDecks(page)
    const button = page.getByRole('button', { name: 'Esporta il team' })
    await expect(button).toBeVisible()
    await expect(button).toBeDisabled()
    await page.getByRole('textbox', { name: 'Nome del team', exact: true }).fill('Trio Riservato')
    for (const [seat, name] of ['Anna Rossi', 'Bruno Bianchi', 'Carla Verdi'].entries())
        await page.locator(`#name-${seat}`).fill(name)
    await expect(button).toBeEnabled()
    const downloadPromise = page.waitForEvent('download')
    await button.click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('Trio-Riservato-pauper.txt')
    const downloadPath = await download.path()
    assertDownloadPath(downloadPath)
    const contents = await readFile(downloadPath, 'utf8')
    expect(contents).toBe(
        '# Trio Riservato\n\n## A: Anna Rossi\n\n60 Forest\n\nSIDEBOARD:\n1 Llanowar Elves\n\n---\n\n## B: Bruno Bianchi\n\n60 Island\n\nSIDEBOARD:\n1 Counterspell\n\n---\n\n## C: Carla Verdi\n\n60 Mountain\n\nSIDEBOARD:\n1 Lightning Bolt\n'
    )
})

test('only queries Scryfall per card and reuses local cache without persisting team data', async ({
    page,
    context,
}) => {
    await openApp(page)
    const requests: { url: string; body: string | null }[] = []
    page.on('request', (request) => requests.push({ url: request.url(), body: request.postData() }))
    await page.getByRole('textbox', { name: 'Nome del team', exact: true }).fill('Secret Team')
    await page.locator('#name-0').fill('Private Player')
    await page
        .locator('.deck-panel')
        .first()
        .getByRole('button', { name: 'Moxfield', exact: true })
        .click()
    await page.locator('#link-0').fill('https://moxfield.com/decks/PRIVATE_SECRET_123')
    await expect(page.locator('.moxfield-note')).toContainText('Link riconosciuto')
    expect(requests).toEqual([])
    await page.locator('#list-0').fill('60 Forest\nSIDEBOARD:\n1 Unknown Card')
    await expect(page.locator('.card-illegal')).toHaveCount(1)
    await fillValidDecks(page)
    await expect(page.locator('.status-valid')).toHaveCount(3)
    const origin = new URL(page.url()).origin
    expect(
        requests.every((request) =>
            [origin, 'https://api.scryfall.com'].includes(new URL(request.url).origin)
        )
    ).toBe(true)
    const cardRequests = () =>
        requests.filter((request) => new URL(request.url).origin === 'https://api.scryfall.com')
    expect(cardRequests().length).toBeGreaterThan(0)
    expect(
        cardRequests().every(
            (request) => request.body === null && new URL(request.url).pathname === '/cards/named'
        )
    ).toBe(true)
    expect(
        cardRequests().filter(
            (request) => new URL(request.url).searchParams.get('exact') === 'Forest'
        )
    ).toHaveLength(1)
    expect(await context.cookies()).toEqual([])
    const storage = await page.evaluate(() => ({
        keys: Object.keys(localStorage),
        value: localStorage.getItem('trio:card-legality:v1'),
        session: sessionStorage.length,
    }))
    expect(storage.keys).toEqual(['trio:card-legality:v1'])
    expect(storage.session).toBe(0)
    expect(storage.value).not.toMatch(
        /Secret Team|Private Player|PRIVATE_SECRET_123|60 Forest|SIDEBOARD/
    )
    const coldRequests = cardRequests().length
    await page.reload()
    await expect(page.locator('#list-0')).toHaveValue('')
    await expect(page.locator('#name-0')).toHaveValue('')
    await expect(page.getByRole('textbox', { name: 'Nome del team', exact: true })).toHaveValue('')
    await fillValidDecks(page)
    await expect(page.locator('.status-valid')).toHaveCount(3)
    expect(cardRequests()).toHaveLength(coldRequests)
})

test('renders mobile, tablet and desktop without page overflow or external assets', async ({
    page,
}) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await openApp(page)
    for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
            true
        )
        await expect(page.locator('.deck-panel')).toHaveCount(3)
        await page.screenshot({
            path: test.info().outputPath(`viewport-${width}.png`),
            fullPage: true,
        })
    }
    const assets = await page.evaluate(() =>
        performance.getEntriesByType('resource').map((entry) => entry.name)
    )
    expect(assets.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true)
    expect(
        await page.locator('.art-ribbon').evaluate(async (element) => {
            const match = getComputedStyle(element).backgroundImage.match(/url\("?([^"\)]+)"?\)/)
            if (!match) return false
            const image = new Image()
            image.src = match[1]
            await image.decode()
            return image.naturalWidth > 0
        })
    ).toBe(true)
    expect(errors).toEqual([])
})

function assertDownloadPath(path: string | null): asserts path is string {
    if (path === null) throw new Error('The exported file was not downloaded locally')
}

test('blocks validation on Scryfall errors without marking cards illegal and recovers on retry', async ({
    page,
}) => {
    let available = false
    await page.route('https://api.scryfall.com/**', (route) =>
        available
            ? scryfallResponse(route)
            : route.fulfill({
                  status: 503,
                  headers: { 'access-control-allow-origin': '*' },
                  body: 'Unavailable',
              })
    )
    await openApp(page)
    await fillValidDecks(page)
    await expect(page.getByRole('alert')).toContainText('Scryfall non disponibile')
    await expect(page.getByRole('button', { name: 'Esporta il team' })).toHaveCount(0)
    await expect(page.locator('.status-valid')).toHaveCount(0)
    await expect(page.locator('.card-illegal')).toHaveCount(0)
    available = true
    await page.getByRole('button', { name: 'Riprova' }).click()
    await expect(page.locator('.status-valid')).toHaveCount(3)
})

test('forced refresh replaces cached legalities and keeps export blocked until completion', async ({
    page,
}) => {
    await openApp(page)
    await fillValidDecks(page)
    await expect(page.locator('.status-valid')).toHaveCount(3)
    await page.route('https://api.scryfall.com/**', (route) =>
        route.fulfill({
            headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
            body: JSON.stringify({
                name: new URL(route.request().url()).searchParams.get('exact'),
                legalities: { pauper: 'banned' },
            }),
        })
    )
    await page.getByRole('button', { name: 'Aggiorna legalità' }).click()
    await expect(page.getByRole('button', { name: 'Esporta il team' })).toHaveCount(0)
    await expect(page.locator('.card-illegal')).toHaveCount(6)
    await expect(page.locator('.status-valid')).toHaveCount(0)
})

test('reset requires confirmation and the privacy dialog closes with Escape', async ({ page }) => {
    await openApp(page)
    await page.locator('#list-0').fill('60 Forest')
    await page.getByRole('button', { name: 'Ricomincia', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: 'Annulla' }).click()
    await expect(page.locator('#list-0')).toHaveValue('60 Forest')
    await page.getByRole('button', { name: 'Ricomincia', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Ricomincia', exact: true }).click()
    await expect(page.locator('#list-0')).toHaveValue('')
    await page.getByRole('button', { name: 'Regole e riservatezza' }).click()
    await expect(page.getByRole('dialog')).toContainText('Le tue liste restano tue.')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
})
