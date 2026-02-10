import os from 'os'
import tar from 'targz'

/**
 * Creates an .tar.gz file containing the files in the directory
 * @param directory - The path to the directory with the journal files, to be zipped
 * @param func - The callback function
 */
export const compress = (
  directory: string,
  func: (err: Error | null, filename?: string) => void
): void => {
  const filename = os.tmpdir() + '/_jb_' + new Date().valueOf() + '.tar.gz'
  tar.compress(
    {
      src: directory,
      dest: filename
    },
    (err: Error | null) => {
      if (err) func(err)
      else func(null, filename)
    }
  )
}

/**
 * Decompresses a .tar.gz file.
 * @param filename - The .tar.gz to uncompress
 * @param func - The callback function
 */
export const decompress = (filename: string, func: (err?: Error) => void): void => {
  tar.decompress(
    {
      src: filename,
      dest: os.tmpdir() + '/_jbfiles',
      tar: {
        fmode: parseInt('777', 8),
        dmode: parseInt('777', 8)
      }
    },
    func
  )
}
