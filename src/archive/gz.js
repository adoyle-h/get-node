import { platform } from 'process'
import { pipeline } from 'stream'
import { promisify } from 'util'
import { createGunzip } from 'zlib'

import { fetchNodeUrl, promiseOrFetchError } from '../fetch.js'

import { untar, moveTar } from './tar.js'

const pPipeline = promisify(pipeline)

// Downloads .tar.gz archive and extract it
export const downloadGz = async function ({
  version,
  arch,
  tmpFile,
  fetchOpts,
}) {
  const { response, checksumError } = await fetchNodeUrl(
    version,
    `node-v${version}-${platform}-${arch}.tar.gz`,
    fetchOpts,
  )
  const promise = pPipeline(response, createGunzip(), untar(tmpFile))

  await promiseOrFetchError(promise, response)

  await moveTar(tmpFile)

  return checksumError
}
