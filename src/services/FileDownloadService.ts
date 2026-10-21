export class FileDownloadService {
    save(filename: string, text: string): void {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = filename
        try {
            anchor.click()
        } finally {
            setTimeout(() => URL.revokeObjectURL(url), 1000)
        }
    }
}
