async function decompress(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw')
  const stream = new Blob([data]).stream().pipeThrough(ds)
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value!)
    total += value!.length
  }
  const result = new Uint8Array(total)
  let pos = 0
  for (const chunk of chunks) {
    result.set(chunk, pos)
    pos += chunk.length
  }
  return result
}

function findDataSize(data: ArrayBuffer, start: number, view: DataView): number {
  for (let i = start; i < data.byteLength - 4; i++) {
    const sig = view.getUint32(i, true)
    if (sig === 0x08074b50) return view.getUint32(i + 8, true)
    if (sig === 0x04034b50 || sig === 0x02014b50) return i - start
  }
  return data.byteLength - start
}

function advanceOffset(
  view: DataView,
  dataStart: number,
  compSize: number,
  hasDD: boolean,
  dataLen: number,
): number {
  const afterData = dataStart + compSize
  if (!hasDD) return afterData
  if (afterData + 4 <= dataLen && view.getUint32(afterData, true) === 0x08074b50)
    return afterData + 16
  return afterData + 12
}

export async function extractZip(data: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>()
  const view = new DataView(data)
  let offset = 0

  while (offset < data.byteLength - 4) {
    if (view.getUint32(offset, true) !== 0x04034b50) break
    const flags = view.getUint16(offset + 6, true)
    const method = view.getUint16(offset + 8, true)
    let compSize = view.getUint32(offset + 18, true)
    const uncompSize = view.getUint32(offset + 22, true)
    const nameLen = view.getUint16(offset + 26, true)
    const extraLen = view.getUint16(offset + 28, true)
    const name = new TextDecoder().decode(new Uint8Array(data, offset + 30, nameLen))
    const dataStart = offset + 30 + nameLen + extraLen
    const hasDD = (flags & 0x08) !== 0

    if (hasDD && compSize === 0) compSize = findDataSize(data, dataStart, view)

    let fileData: Uint8Array
    if (method === 0) {
      const size = compSize > 0 ? compSize : uncompSize
      fileData = new Uint8Array(data, dataStart, size)
    } else if (method === 8) {
      fileData = await decompress(new Uint8Array(data, dataStart, compSize))
    } else {
      offset = advanceOffset(view, dataStart, compSize, hasDD, data.byteLength)
      continue
    }

    files.set(name.toLowerCase(), fileData)
    offset = advanceOffset(view, dataStart, compSize, hasDD, data.byteLength)
  }

  return files
}
