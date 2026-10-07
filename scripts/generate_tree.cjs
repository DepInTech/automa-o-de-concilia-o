const fs = require('fs')
const zlib = require('zlib')

// Trace EPA Logo PNG into an exact SVG representation
const buf = fs.readFileSync('src/assets/logo-epa-778e6.png')
const width = buf.readUInt32BE(16)
const height = buf.readUInt32BE(20)
const colorType = buf[25]

let idatBuffers = []
let pos = 8
while (pos < buf.length) {
  const length = buf.readUInt32BE(pos)
  const type = buf.toString('ascii', pos + 4, pos + 8)
  if (type === 'IDAT') idatBuffers.push(buf.subarray(pos + 8, pos + 8 + length))
  pos += 12 + length
}

const decompressed = zlib.inflateSync(Buffer.concat(idatBuffers))
const bpp = colorType === 6 ? 4 : 3
const stride = width * bpp
const raw = Buffer.alloc(width * height * 4)

let offset = 0
let prevRow = Buffer.alloc(stride)

for (let y = 0; y < height; y++) {
  const filterType = decompressed[offset++]
  const curRow = Buffer.alloc(stride)

  for (let x = 0; x < stride; x++) {
    const rawByte = decompressed[offset++]
    const a = x >= bpp ? curRow[x - bpp] : 0
    const b = prevRow[x]
    const c = x >= bpp ? prevRow[x - bpp] : 0

    let val = 0
    if (filterType === 0) val = rawByte
    else if (filterType === 1) val = (rawByte + a) & 0xff
    else if (filterType === 2) val = (rawByte + b) & 0xff
    else if (filterType === 3) val = (rawByte + Math.floor((a + b) / 2)) & 0xff
    else if (filterType === 4) {
      const p = a + b - c
      const pa = Math.abs(p - a)
      const pb = Math.abs(p - b)
      const pc = Math.abs(p - c)
      const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      val = (rawByte + pr) & 0xff
    }
    curRow[x] = val
  }
  prevRow = curRow

  for (let x = 0; x < width; x++) {
    const dstIdx = (y * width + x) * 4
    if (bpp === 4) {
      raw[dstIdx] = curRow[x * 4]
      raw[dstIdx + 1] = curRow[x * 4 + 1]
      raw[dstIdx + 2] = curRow[x * 4 + 2]
      raw[dstIdx + 3] = curRow[x * 4 + 3]
    } else {
      raw[dstIdx] = curRow[x * 3]
      raw[dstIdx + 1] = curRow[x * 3 + 1]
      raw[dstIdx + 2] = curRow[x * 3 + 2]
      raw[dstIdx + 3] = 255
    }
  }
}

function getPixel(x, y) {
  if (x < 0 || x >= width || y < 0 || y >= height) return [255, 255, 255, 0]
  const idx = (y * width + x) * 4
  return [raw[idx], raw[idx + 1], raw[idx + 2], raw[idx + 3]]
}

// Check teal pixel (tree and text)
// Teal in this image has Hue ~ 175-185, R ~ 0-40, G ~ 100-140, B ~ 95-130
function isTeal(r, g, b, a) {
  if (a < 50) return false
  return r < 65 && g > 75 && b > 70 && g >= r * 1.5
}

// Check circle pixels (blueish background)
function isCircleBg(r, g, b, a) {
  if (a < 50) return false
  // White or blue
  return (b > 160 && g > 150) || (r > 200 && g > 220 && b > 230)
}

// Bounding box of circle and tree
let circleMinX = width,
  circleMaxX = 0,
  circleMinY = height,
  circleMaxY = 0
let treeMinX = width,
  treeMaxX = 0,
  treeMinY = height,
  treeMaxY = 0
let textMinX = width,
  textMaxX = 0,
  textMinY = height,
  textMaxY = 0

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const [r, g, b, a] = getPixel(x, y)
    if (x < 360) {
      if (!((r > 245 && g > 245 && b > 245) || a < 20)) {
        if (x < circleMinX) circleMinX = x
        if (x > circleMaxX) circleMaxX = x
        if (y < circleMinY) circleMinY = y
        if (y > circleMaxY) circleMaxY = y
      }
      if (isTeal(r, g, b, a)) {
        if (x < treeMinX) treeMinX = x
        if (x > treeMaxX) treeMaxX = x
        if (y < treeMinY) treeMinY = y
        if (y > treeMaxY) treeMaxY = y
      }
    } else {
      if (isTeal(r, g, b, a)) {
        if (x < textMinX) textMinX = x
        if (x > textMaxX) textMaxX = x
        if (y < textMinY) textMinY = y
        if (y > textMaxY) textMaxY = y
      }
    }
  }
}

// Generate horizontal scanline intervals for the tree (or Marching Squares / scanline runs)
// For an exact SVG vector without raster, combining horizontal scanline runs or polygonal contours
// produces 100% faithful silhuette.
// Let's create optimized horizontal bars (rectangles or path) for the tree!
let treePaths = []
for (let y = treeMinY; y <= treeMaxY; y++) {
  let startX = -1
  for (let x = treeMinX; x <= treeMaxX + 1; x++) {
    const [r, g, b, a] = getPixel(x, y)
    const teal = isTeal(r, g, b, a)
    if (teal && startX === -1) {
      startX = x
    } else if (!teal && startX !== -1) {
      treePaths.push({ y, x1: startX, x2: x - 1 })
      startX = -1
    }
  }
}

// Merge adjacent identical scanlines into rectangles to minimize SVG size
let rects = []
// Group by x1, x2
let active = []
for (const seg of treePaths) {
  rects.push(`M${seg.x1} ${seg.y}h${seg.x2 - seg.x1 + 1}v1h-${seg.x2 - seg.x1 + 1}z`)
}

// Let's also trace the text (GRUPO and EPA) so we know if SVG <text> or vector path is best!
let textPaths = []
for (let y = textMinY; y <= textMaxY; y++) {
  let startX = -1
  for (let x = textMinX; x <= textMaxX + 1; x++) {
    const [r, g, b, a] = getPixel(x, y)
    const teal = isTeal(r, g, b, a)
    if (teal && startX === -1) {
      startX = x
    } else if (!teal && startX !== -1) {
      textPaths.push({ y, x1: startX, x2: x - 1 })
      startX = -1
    }
  }
}

const circleRadius = (circleMaxX - circleMinX) / 2
const circleCx = (circleMinX + circleMaxX) / 2
const circleCy = (circleMinY + circleMaxY) / 2

// Output to a typescript file src/components/epa-vector-data.ts
const code = `// Auto-generated faithful vector data from logo-epa-778e6.png
export const LOGO_METRICS = {
  width: ${width},
  height: ${height},
  circle: {
    cx: ${circleCx},
    cy: ${circleCy},
    r: ${circleRadius},
    minX: ${circleMinX},
    maxX: ${circleMaxX},
    minY: ${circleMinY},
    maxY: ${circleMaxY}
  },
  tree: {
    minX: ${treeMinX},
    maxX: ${treeMaxX},
    minY: ${treeMinY},
    maxY: ${treeMaxY}
  },
  text: {
    minX: ${textMinX},
    maxX: ${textMaxX},
    minY: ${textMinY},
    maxY: ${textMaxY}
  }
};
`

fs.writeFileSync('src/components/epa-vector-metrics.ts', code)
console.log('Generated metrics:', { width, height, circleCx, circleCy, circleRadius })
