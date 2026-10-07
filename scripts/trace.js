import fs from 'node:fs'
import zlib from 'node:zlib'

const pngPath = 'src/assets/logo-epa-778e6.png'
const buf = fs.readFileSync(pngPath)

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

// Check sample colors
function getHex(x, y) {
  const idx = (Math.round(y) * width + Math.round(x)) * 4
  return `#${raw[idx].toString(16).padStart(2, '0')}${raw[idx + 1].toString(16).padStart(2, '0')}${raw[idx + 2].toString(16).padStart(2, '0')}`
}

const samples = [
  { label: 'EPA letter E', hex: getHex(360, 250) },
  { label: 'Tree center', hex: getHex(150, 160) },
  { label: 'Circle top-center', hex: getHex(163, 20) },
  { label: 'Circle mid-right near edge', hex: getHex(320, 171) },
  { label: 'Circle bottom-left near edge', hex: getHex(40, 270) },
  { label: 'GRUPO letter G', hex: getHex(360, 100) },
]

fs.writeFileSync(
  'scripts/out.json',
  JSON.stringify(
    {
      samples,
      width,
      height,
    },
    null,
    2,
  ),
)
