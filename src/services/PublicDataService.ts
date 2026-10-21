export interface ArtCredit {
    card: string
    artist: string
}

export class PublicDataService {
    constructor(private readonly baseUrl = import.meta.env?.BASE_URL ?? '/') {}

    async loadArtCredit(): Promise<ArtCredit> {
        const response = await fetch(`${this.baseUrl}art-credit.json`, { credentials: 'omit' })
        if (!response.ok) throw new Error('Artwork credit unavailable')
        const data: unknown = await response.json()
        if (
            typeof data !== 'object' ||
            data === null ||
            !('card' in data) ||
            typeof data.card !== 'string' ||
            !('artist' in data) ||
            typeof data.artist !== 'string'
        )
            throw new Error('Invalid artwork credit')
        return { card: data.card, artist: data.artist }
    }
}
