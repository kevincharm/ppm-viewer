/// <reference types="node" />

import 'normalize.css/normalize.css'

interface PpmImage {
    cols: number
    rows: number
    rgbData: Uint8Array
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
        const imgA = ppmImages[canvasA.id]
        const imgB = ppmImages[canvasB.id]
        if (!imgA || !imgB) {
            console.error('2 images required to diff')
            return
        }

        diffImage(imgA, imgB, canvasDiff, canvasDiffRgb)
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
    if (!canvasA || !canvasB || !canvasDiff || !canvasDiffRgb) {
        return
    }

    const imgA = ppmImages[canvasA.id]
    const imgB = ppmImages[canvasB.id]

    if (!imgA || !imgB) {
        console.error('2 images required to diff')
        return
    }

    diffImage(imgA, imgB, canvasDiff, canvasDiffRgb)
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
        rgbData: new Uint8Array(cols * rows * 3)
    }
    ppmImages[canvas.id] = ppmImage
    for (let y = 0; y < rows; y++) {
        const line = lines[3 + y].split(/\s/).map(Number)

        for (let x = 0; x < cols; x++) {
            const r = (255 * line[3 * x]) / maxValue
            const g = (255 * line[3 * x + 1]) / maxValue
            const b = (255 * line[3 * x + 2]) / maxValue
            const index = 3 * y * cols + x
            ppmImage.rgbData[index] = Math.round(r)
            ppmImage.rgbData[index + 1] = Math.round(g)
            ppmImage.rgbData[index + 2] = Math.round(b)
            context.fillStyle = `rgba(${r}, ${g}, ${b}, 1.0)`
            context.fillRect(x, y, 1, 1)
        }
    }
    console.log('Done')
}

function diffImage(
    imageA: PpmImage,
    imageB: PpmImage,
    canvasDiff: HTMLCanvasElement,
    canvasDiffRgb: HTMLCanvasElement
) {
    if (imageA.rows !== imageB.rows || imageA.cols !== imageB.cols) {
        console.error(`Dimensions don't match`)
        return
    }

    const { cols, rows } = imageA
    const ctxDiff = canvasDiff.getContext('2d')!
    canvasDiff.width = cols
    canvasDiff.height = rows
    ctxDiff.clearRect(0, 0, canvasDiff.width, canvasDiff.height)

    const ctxDiffRgb = canvasDiffRgb.getContext('2d')!
    canvasDiffRgb.width = cols
    canvasDiffRgb.height = rows
    ctxDiffRgb.clearRect(0, 0, canvasDiffRgb.width, canvasDiffRgb.height)

    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const index = 3 * y * cols + x
            const r = Math.abs(imageA.rgbData[index] - imageB.rgbData[index])
            const g = Math.abs(imageA.rgbData[index + 1] - imageB.rgbData[index + 1])
            const b = Math.abs(imageA.rgbData[index + 2] - imageB.rgbData[index + 2])
            ctxDiffRgb.fillStyle = `rgba(${Math.min(10 * r, 255)}, ${Math.min(10 * g, 255)}, ${Math.min(
                10 * b,
                255
            )}, 1.0)`
            ctxDiffRgb.fillRect(x, y, 1, 1)
            if (r !== 0 || g !== 0 || b !== 0) {
                ctxDiff.fillStyle = `rgba(${255}, ${0}, ${255}, 1.0)`
                ctxDiff.fillRect(x, y, 1, 1)
            }
        }
    }
    console.log('Done')
}
