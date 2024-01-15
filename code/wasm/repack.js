// middleware for repacking pk3 files
const fs = require('fs')
const path = require('path')
const {glob} = require('glob')
const process = require('child_process')


const SUPPORTED_FORMATS = [
  '.cfg', '.qvm', '.jts', '.bot',
  '.txt', '.hit',
  '.shader', '.shaderx',
  '.crosshair', '.skin', '.font',
  '.config', '.menu',
  '.defi', // CPMA game mode definition
  '.arena', // map based game mode definition
  // these can be compiled in game to run bot AI
  '.c', '.h', '.scc',
  // camera files
  '.cam',
  // can load async, but new repacking system includes small ones
  '.map', '.aas', '.md5',
  '.bsp', '.md3', '.iqm', '.mdr',
]

const FILE_TYPES = new RegExp('(' + SUPPORTED_FORMATS.join('|') + ')$|menu\/|gfx\/2d\/', 'ig')

let lockFunc = false
let lockPromise
async function compareZip(pk3File) {
  if(!lockPromise) {
    lockPromise = new Promise(resolve => lockFunc = resolve)
  } else {
    await lockPromise
  }
  // compare corresponding zip and mtime
  let sourcePath = path.join(__dirname, '../../docs/', pk3File + 'dir')
  // form a docs/demoq3/pak0.pk3dir style path
  let finishedPath = path.join(__dirname, '../../docs/maps/', pk3File)
  if(!finishedPath.includes('.pk3'))
    throw new Error('abort')

  if(!fs.existsSync(finishedPath)
    || fs.statSync(finishedPath).mtime < fs.statSync(sourcePath).mtime - 1000) {

    // compare contents of folder with directory contents
    const textFiles = (await glob('**/*', { 
      ignore: 'node_modules/**', 
      cwd: sourcePath 
    })).filter(f => f.match(FILE_TYPES))

    // TODO: repack the pk3 file
    let tempFile = 'Archive.' + (Date.now() + '').substring(20, -5)
    for(let pack_i = 0; pack_i < textFiles.length; pack_i++) {
      let startArgs = ['-v', '-9']
      //.concat(pack_i == textFiles.length - 1 ? ['-o'] : [])
        .concat(['-u', tempFile, textFiles[pack_i]])
      //console.log(startArgs)  
      
      await process.spawnSync('zip', startArgs, {
        cwd: sourcePath,
        timeout: 1000,
      })
      
      // slow it down a little or write locks won't work and junk files don't get merged in
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    if(fs.existsSync(finishedPath))
      fs.unlinkSync(finishedPath)

    fs.renameSync(path.join(sourcePath, tempFile), finishedPath)
  }

  Promise.resolve(lockPromise)
  lockFunc()
  lockPromise = false
}


async function checkForRepack(request, response, next) {

  let isPk3Path = request.originalUrl.includes('maps/')
    && request.originalUrl.includes('.pk3')
  let mapPath = request.originalUrl.substr(request.originalUrl.indexOf('maps/') + 5)
    .replace(/\?.*$/gi, '')
  // definitely requesting a repacked file
  if(isPk3Path) {
      // form a docs/demoq3/pak0.pk3dir style path
    if(fs.existsSync(path.join(__dirname, '../../docs/', mapPath + 'dir'))) {
      // compare contents of folder with contents of corresponding zip and mtime
      await compareZip(mapPath) 

      // return pk3 file guarunteed fresh
      let outputPath = path.join(__dirname, '../../docs/maps/', mapPath)
      fs.createReadStream(outputPath).pipe(response);
      return response
    }
  }

  return next()

}

module.exports = checkForRepack

