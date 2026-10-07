import fs from 'node:fs'
import zlib from 'node:zlib'

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
  const idx = (y * width + x) * 4
  return [raw[idx], raw[idx + 1], raw[idx + 2], raw[idx + 3]]
}

let circleMinX = width,
  circleMaxX = 0,
  circleMinY = height,
  circleMaxY = 0
let treeMinX = width,
  treeMaxX = 0,
  treeMinY = height,
  treeMaxY = 0
let grupoMinX = width,
  grupoMaxX = 0,
  grupoMinY = height,
  grupoMaxY = 0
let epaMinX = width,
  epaMaxX = 0,
  epaMinY = height,
  epaMaxY = 0

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const [r, g, b, a] = getPixel(x, y)
    const isWhite = (r > 240 && g > 240 && b > 240) || a < 20
    const isTeal = r < 70 && g > 70 && b > 60

    if (!isWhite && x < 350) {
      if (x < circleMinX) circleMinX = x
      if (x > circleMaxX) circleMaxX = x
      if (y < circleMinY) circleMinY = y
      if (y > circleMaxY) circleMaxY = y
    }

    if (isTeal && x < 350) {
      if (x < treeMinX) treeMinX = x
      if (x > treeMaxX) treeMaxX = x
      if (y < treeMinY) treeMinY = y
      if (y > treeMaxY) treeMaxY = y
    }

    if (isTeal && x >= 340) {
      if (y < 130) {
        if (x < grupoMinX) grupoMinX = x
        if (x > grupoMaxX) grupoMaxX = x
        if (y < grupoMinY) grupoMinY = y
        if (y > grupoMaxY) grupoMaxY = y
      } else {
        if (x < epaMinX) epaMinX = x
        if (x > epaMaxX) epaMaxX = x
        if (y < epaMinY) epaMinY = y
        if (y > epaMaxY) epaMaxY = y
      }
    }
  }
}

const stats = {
  width,
  height,
  circle: { circleMinX, circleMaxX, circleMinY, circleMaxY },
  tree: { treeMinX, treeMaxX, treeMinY, treeMaxY },
  grupo: { grupoMinX, grupoMaxX, grupoMinY, grupoMaxY },
  epa: { epaMinX, epaMaxX, epaMinY, epaMaxY },
}

fs.writeFileSync('scripts/stats.json', JSON.stringify(stats, null, 2))
console.log('Saved stats.json')
