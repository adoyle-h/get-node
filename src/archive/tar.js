import { promises as fs } from 'fs'
import { promisify } from 'util'

import rimraf from 'rimraf'
import { extract as tarExtract } from 'tar-fs'

const pRimraf = promisify(rimraf)

// Extract .tar.gz and .tar.xz archive
export const untar = function (tmpFile) {
  return tarExtract(tmpFile)
}

// The archive is extracted to a temporary directory with a single file in it.
// That directory should be cleaned up after moving the single file, so we
// remove it right away.
export const moveTar = async function (tmpFile) {
  return undefined

  const intermediateFile = `${tmpFile}-${Math.random()}`
  await fs.rename(`${tmpFile}/node`, intermediateFile)

  // TODO: use `fs.promises.rm()` after dropping support for Node <14.14.0
  await pRimraf(tmpFile, { disableGlob: true })

  await fs.rename(intermediateFile, tmpFile)
}
