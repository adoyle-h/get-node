import { strict as assert } from 'assert'
import { join } from 'path'
import del from 'del'
import moveFile from 'move-file'
import pathExists from 'path-exists'
import { tmpName } from 'tmp-promise'
import { readdirSync } from 'fs'

import { getArch } from './arch.js'
import { downloadRuntime } from './archive/main.js'

// Download the Node.js binary for a specific `version`.
// If the file already exists, do nothing. This allows caching.
export const download = async function ({
  version,
  output,
  arch,
  platform,
  fetchOpts,
}) {
  const archA = getArch(arch)

  const nodeDir = output

  if (await pathExists(nodeDir)) {
    return nodeDir
  }

  await downloadFile({ version, nodeDir, arch: archA, platform, fetchOpts })

  return nodeDir
}

// Downloading the file should be atomic, so we don't leave partially written
// corrupted file executables. We cannot use libraries like `write-file-atomic`
// because they don't support streams. We download to the temporary directory
// first then move the file once download has completed.
// We use the temporary directory instead of creating a sibling file:
//  - this is to make sure if process is interrupted (e.g. with SIGINT), the
//    temporary file is cleaned up (without requiring libraries like
//    `signal-exit`)
//  - this means the file might be on a different partition
//    (https://github.com/ehmicky/get-node/issues/1), requiring copying it
//    instead of renaming it. This is done by the `move-file` library.
const downloadFile = async function ({
  version,
  nodeDir,
  arch,
  platform,
  fetchOpts,
}) {
  const tmpDir = await tmpName({ prefix: `get-node-${version}-${arch}` })

  try {
    await tmpDownload({ version, tmpFile: tmpDir, arch, platform, fetchOpts })

    // On Unix, `node` binaries are usually installed inside a `bin` directory.
    // This is for example how `nvm` works. Some tools assume this convention and
    // use `process.execPath` accordingly. For example `npm` or `yarn` do this to
    // find out the global Node directory (aka `prefix`).
    // However, on Windows, the directory is flat and the executable has `*.exe`.

    await moveTmpFile(tmpDir, nodeDir)
  } finally {
    await cleanTmpFile(tmpDir)
  }
}

const tmpDownload = async function ({
  version,
  tmpFile,
  arch,
  platform,
  fetchOpts,
}) {
  const checksumError = await safeDownload({
    version,
    tmpFile,
    platform,
    arch,
    fetchOpts,
  })

  // We throw checksum errors only after everything else worked, so that errors
  // due to wrong platform, connectivity or wrong `mirror` option are shown
  // instead of the checksum error.
  if (checksumError !== undefined) {
    throw new Error(await checksumError)
  }
}

const safeDownload = async function ({
  version,
  tmpFile,
  arch,
  platform,
  fetchOpts,
}) {
  try {
    return await downloadRuntime({
      version,
      tmpFile,
      arch,
      platform,
      fetchOpts,
    })
  } catch (error) {
    throw new Error(
      getDownloadError({
        message: error.message,
        version,
        arch,
        platform,
        fetchOpts,
      }),
    )
  }
}

const getDownloadError = function ({
  message,
  version,
  arch,
  platform,
  fetchOpts: { mirror },
}) {
  if (message.includes('getaddrinfo')) {
    return `Could not connect to ${mirror}`
  }

  // istanbul ignore else
  if (message.includes('404')) {
    return `No Node.js binaries available for ${version} on ${platform} ${arch}`
  }

  // Testing other HTTP errors is hard in CI.
  // istanbul ignore next
  return `Could not download Node.js ${version}: ${message}`
}

const moveTmpFile = async function (tmpFile, nodePath) {
  // Another parallel download might have been running
  if (await pathExists(nodePath)) {
    return
  }

  const files = readdirSync(tmpFile)
  assert(files.length === 1)

  await moveFile(join(tmpFile, files[0]), nodePath)
}

// The temporary file might still exist if:
//  - another parallel download was running
//  - an error was thrown
const cleanTmpFile = async function (tmpFile) {
  if (!(await pathExists(tmpFile))) {
    return
  }

  // This is usually a regular file but can be a directory if the tar archive
  // was extracted but not moved yet
  // TODO: use fs.mkdir(..., {recursive: true}) after dropping Node <12
  await del(tmpFile, { force: true })
}
