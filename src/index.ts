/// <reference types="node" />

import 'normalize.css/normalize.css'

interface PpmImage {
    cols: number
    rows: number
    rgbData: Uint8ClampedArray
}

interface DiffResult {
    pixelDiffPercent: number
    rgbDiffPercent: number
}

const ppmImages: { [key: string]: PpmImage } = {}

document.addEventListener('DOMContentLoaded', () => {
    const dropA = document.querySelector<HTMLDivElement>('#drop-file-a')!
    const dropB = document.querySelector<HTMLDivElement>('#drop-file-b')!
    const canvasA = document.querySelector<HTMLCanvasElement>('#canvas-file-a')!
    const canvasB = document.querySelector<HTMLCanvasElement>('#canvas-file-b')!
    const canvasDiff = document.querySelector<HTMLCanvasElement>('#canvas-diff')!
    const canvasDiffRgb = document.querySelector<HTMLCanvasElement>('#canvas-diff-rgb')!
    const diffButton = document.querySelector<HTMLButtonElement>('#button-diff')!
    const clearButton = document.querySelector<HTMLButtonElement>('#button-clear')!

    diffButton.addEventListener('click', () => {
        tryDiff()
    })

    clearButton.addEventListener('click', () => {
        ;[canvasA, canvasB, canvasDiff, canvasDiffRgb].forEach(canvas => {
            const context = canvas.getContext('2d')
            context!.clearRect(0, 0, canvas.width, canvas.height)
            delete ppmImages[canvas.id]
        })
    })

    dropA.ondragover = dropB.ondragover = event => {
        event.preventDefault()
    }

    dropA.ondrop = dropHandlerFor(canvasA)
    dropB.ondrop = dropHandlerFor(canvasB)
})

function dropHandlerFor(canvas: HTMLCanvasElement) {
    return (event: DragEvent) => {
        event.preventDefault()

        if (!event.dataTransfer) {
            return
        }

        if (!event.dataTransfer.files.length) {
            return
        }

        const file = event.dataTransfer.files.item(0)!
        const reader = new FileReader()
        reader.onload = () => {
            const result = reader.result as string
            loadPpm(result, canvas)
            tryDiff()
        }
        reader.readAsText(file)
    }
}

function tryDiff() {
    const canvasA = document.querySelector<HTMLCanvasElement>('#canvas-file-a')
    const canvasB = document.querySelector<HTMLCanvasElement>('#canvas-file-b')
    const canvasDiff = document.querySelector<HTMLCanvasElement>('#canvas-diff')
    const canvasDiffRgb = document.querySelector<HTMLCanvasElement>('#canvas-diff-rgb')
    const infoDiffPixel = document.querySelector<HTMLSpanElement>('#info-diff-pixel')
    const infoDiffRgb = document.querySelector<HTMLSpanElement>('#info-diff-rgb')
    if (!canvasA || !canvasB || !canvasDiff || !canvasDiffRgb || !infoDiffPixel || !infoDiffRgb) {
        return
    }

    const imgA = ppmImages[canvasA.id]
    const imgB = ppmImages[canvasB.id]

    if (!imgA || !imgB) {
        console.error('2 images required to diff')
        return
    }

    const diffResult = diffImage(imgA, imgB, canvasDiff, canvasDiffRgb)
    if (!diffResult) {
        console.error('Something went wrong with the diff.')
        return
    }

    const { pixelDiffPercent, rgbDiffPercent } = diffResult
    infoDiffPixel.textContent = `${(pixelDiffPercent * 100).toFixed(2)}`
    infoDiffRgb.textContent = `${(rgbDiffPercent * 100).toFixed(2)}`
}

function loadPpm(content: string, canvas: HTMLCanvasElement) {
    const lines = content
        .replace(/\r/g, '')
        .split(/\n/)
        .filter(l => !!l)
    if (lines[0] !== 'P3') {
        console.error('Not a PPM file')
        return
    }

    const [cols, rows] = lines[1].split(/\s/).map(Number)
    const maxValue = Number(lines[2])
    console.info(`dim: ${cols} * ${rows}, max colour: ${maxValue}`)

    const context = canvas.getContext('2d')!
    canvas.width = cols
    canvas.height = rows
    const ppmImage: PpmImage = {
        cols,
        rows,
        rgbData: new Uint8ClampedArray(cols * rows * 4)
    }
    ppmImages[canvas.id] = ppmImage
    for (let y = 0; y < rows; y++) {
        const line = lines[3 + y].split(/\s/).map(Number)

        for (let x = 0; x < cols; x++) {
            const r = (255 * line[3 * x]) / maxValue
            const g = (255 * line[3 * x + 1]) / maxValue
            const b = (255 * line[3 * x + 2]) / maxValue
            const index = 4 * (y * cols + x)
            ppmImage.rgbData[index] = Math.round(r)
            ppmImage.rgbData[index + 1] = Math.round(g)
            ppmImage.rgbData[index + 2] = Math.round(b)
            ppmImage.rgbData[index + 3] = 255
        }
    }
    const imageData = new ImageData(ppmImage.rgbData, cols, rows)
    context.putImageData(imageData, 0, 0)
    console.log('Done')
}

function diffImage(
    imageA: PpmImage,
    imageB: PpmImage,
    canvasDiff: HTMLCanvasElement,
    canvasDiffRgb: HTMLCanvasElement
): DiffResult | null {
    if (imageA.rows !== imageB.rows || imageA.cols !== imageB.cols) {
        console.error(`Dimensions don't match`)
        return null
    }

    const begin = performance.now()

    const { cols, rows } = imageA
    const ctxDiff = canvasDiff.getContext('2d')!
    canvasDiff.width = cols
    canvasDiff.height = rows
    ctxDiff.clearRect(0, 0, canvasDiff.width, canvasDiff.height)
    const u8Diff = new Uint8ClampedArray(cols * rows * 4)

    const ctxDiffRgb = canvasDiffRgb.getContext('2d')!
    canvasDiffRgb.width = cols
    canvasDiffRgb.height = rows
    ctxDiffRgb.clearRect(0, 0, canvasDiffRgb.width, canvasDiffRgb.height)
    const u8DiffRgb = new Uint8ClampedArray(cols * rows * 4)

    // Count diff pixels
    let differentPixels = 0
    let differentChannels = 0

    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const index = 4 * (y * cols + x)
            const r = Math.abs(imageA.rgbData[index] - imageB.rgbData[index])
            const g = Math.abs(imageA.rgbData[index + 1] - imageB.rgbData[index + 1])
            const b = Math.abs(imageA.rgbData[index + 2] - imageB.rgbData[index + 2])

            differentChannels += (r !== 0 ? 1 : 0) + (g !== 0 ? 1 : 0) + (b !== 0 ? 1 : 0)
            u8DiffRgb[index] = Math.min(255, Math.round(r) * 10)
            u8DiffRgb[index + 1] = Math.min(255, Math.round(g) * 10)
            u8DiffRgb[index + 2] = Math.min(255, Math.round(b) * 10)
            u8DiffRgb[index + 3] = 255
            if (r !== 0 || g !== 0 || b !== 0) {
                // pixel is different
                differentPixels += 1
                u8Diff[index] = 255
                u8Diff[index + 1] = 0
                u8Diff[index + 2] = 255
                u8Diff[index + 3] = 255
            } else {
                u8Diff[index] = 255
                u8Diff[index + 1] = 255
                u8Diff[index + 2] = 255
                u8Diff[index + 3] = 255
            }
        }
    }
    const diffImageData = new ImageData(u8Diff, cols, rows)
    ctxDiff.putImageData(diffImageData, 0, 0)
    const diffRgbImageData = new ImageData(u8DiffRgb, cols, rows)
    ctxDiffRgb.putImageData(diffRgbImageData, 0, 0)

    const end = performance.now()
    console.log(`Diff finished in ${end - begin}ms.`)

    const totalPixels = cols * rows
    const totalChannels = cols * rows * 3
    return {
        pixelDiffPercent: differentPixels / totalPixels,
        rgbDiffPercent: differentChannels / totalChannels
    }
}
