var fs = require('fs')
var os = require('os')
var path = require('path')
var {URL} = require('url')
var {Volume} = require('memfs')
var {ufs} = require('unionfs')
var { Readable } = require('stream')
var glob = require('glob')
var {compressFile, compressDirectory, readPak} = require('./compress.js')
var checksumZip = require('./checksum.js')
//var {graphGame, loadDefaultDirectories, TEMP_NAME, BASEMOD, BASEMOD_LOWER, BASEMOD_DIRS} = require('../lib/asset.game.js')

var help = `
npm run start [options] [virtual path] [filesystem path]
NOTE: ./build/release-js-js is implied
--recursive -R - adds all directory files below current directory
--virtual -V - create virtual pk3dir out of pk3 and exclude pk3 files, opposite of repack
--write -wr - write all JSON files in every directory for CDN use
--repack -rp - repack on the fly as pk3/media/images/sound files are accessed
--hidden -H - include hidden files (uncommon)
--watch - watch files for changes
--help -h - print this help message and exit
e.g. npm run start -- -R -rp /assets/baseq3 /Applications/ioquake3/baseq3
TODO: live reloading
`

var recursive = false
var writeOut = true
var repackFiles = false
var virtualPk3dir = false
var runContentGeneration = false
var includeHidden = false
var watchChanges = false
var scanOptions = false
var TEMP_DIR = path.join(process.env.HOME || process.env.HOMEPATH 
  || process.env.USERPROFILE || os.tmpdir(), '/.quake3')
var GRAPH_PATH = path.join(process.env.HOME || process.env.HOMEPATH 
  || process.env.USERPROFILE || os.tmpdir(), '/Collections/lvlworld')

// check the process args for a directory to serve as the baseq3 folders
ufs.use(fs)
var vol = Volume.fromJSON({})
var mountPoint = '/assets/baseq3'
var mountPoints = []
for(var i = 0; i < process.argv.length; i++) {
  var a = process.argv[i]
  if(a.match(/\/node$/ig)) continue
  if(a.match(/\/web\.js$/ig)) {
    scanOptions = true
    writeOut = false
    continue
  }
  if(fs.existsSync(a)) {
    // if running content script directly, automatically call each mount point 
    //   so the json files and zipped files can be generated
    if(a.match(/\/content\.js$/ig)) {
      console.log('Running content script')
      scanOptions = true
      writeOut = false
      runContentGeneration = true
      continue
    }
		console.log(`Linking ${mountPoint} -> ${a}`)
    // create a link for user specified directory that doesn't exist
    mountPoints.push([mountPoint, a])
  // use an absolute path as a mount point if it doesn't exist
  } else if (!scanOptions) {
    continue
  } else if(a == '--master') {
  } else if(a == '--recursive' || a == '-R') {
    console.log('Recursive')
    recursive = true
  } else if(a == '--hidden' || a == '-H') {
    console.log('Hidden files')
    includeHidden = true
  } else if(a == '--virtual' || a == '-V') {
    console.log('Virtual pk3dirs')
    virtualPk3dir = true
  } else if(a == '--write' || a == '-wr') {
    console.log('Writing index.json, not watching')
    writeOut = true
    watchChanges = false
  } else if(a == '--watch') {
    console.log('Watching for changes, not writing')
    watchChanges = true
    writeOut = false
  } else if(a == '--repack' || a == '-rp') {
    console.log('Live repacking')
    repackFiles = true
  } else if (a == '--temp') {
    if(ufs.existsSync(process.argv[i+1]) && ufs.statSync(process.argv[i+1]).isDirectory()) {
      TEMP_DIR = process.argv[i+1]
      console.log(`Temporary directory set to ${TEMP_DIR}`)
      i++
    } else {
      throw new Error(`Temp directory ${process.argv[i+1]} not found or not a directory`)
    }
  } else if (a.match(/^\//i)) {
		console.log('Using mount point ' + a)
    mountPoint = a
  } else if (a == '--help' || a == '-h') {
    console.log(help)
    process.exit(0)
  } else if (!runContentGeneration && parseInt(a) + '' === a) {
    // ignore, used by web.js and proxy.js both of them load this script
	} else {
    console.log(`ERROR: Unrecognized option "${a}"`)
  }
}
if(!writeOut) {
  ufs.use(vol)
}
if(mountPoints.length === 0 && fs.existsSync(TEMP_DIR)) {
  var defaultDirectories = fs.readdirSync(TEMP_DIR)
    .filter(f => f[0] != '.')
  defaultDirectories.forEach(f => {
    mountPoints.push([path.join(path.dirname(mountPoint), f), path.join(TEMP_DIR, f)])
  })
  console.log('I really hope this is what you meant: ', defaultDirectories.join(', '))
}
if(mountPoints.length === 0) {
  console.log('ERROR: No mount points, e.g. run `npm run start -- /Applications/ioquake3`')
}
mountPoints.sort((a, b) => a[0].localeCompare(b[0], 'en', { sensitivity: 'base' }))

function watchForChanges() {
  var chokidar = require('chokidar');
  var watcher = chokidar.watch(mountPoints.map(m => m[1] + '/**'), {
    interval: 1000,
    atomic: 1000,
    awaitWriteFinish: true
  })
  var doing = false
  watcher.on('change', function(changePath) {
    if(doing) return
    doing = true
    // remove all cache files from the directory tree
    var keys = Object.keys(vol.toJSON())
    for(var i = 0; i < mountPoints.length; i++) {
      if(changePath.includes(mountPoints[i][1])) {
        // remove all files in the affected mount point
        console.log(`Changes detected in ${mountPoints[i][1]}, unlinking...`)
        for(var j = 0; j < keys.length; j++) {
          if(keys[j].includes(mountPoints[i][1])) {
            try {
              // remove memfs cache of files
              vol.unlinkSync(keys[j])
            } catch (e) {
              // already removed?
              if(!e.code == 'ENOENT') throw e
            }
          }
        }
      }
    }
    doing = false
  })
}
if(watchChanges) {
  watchForChanges()
}

function pathToAbsolute(virtualPath) {
  var result
  if(mountPoints.length === 0) {
    return -1
  }
	for(var i = 0; i < mountPoints.length; i++) {
		if(virtualPath.includes(mountPoints[i][0])) {
      result = path.join(mountPoints[i][1],
        virtualPath.replace(mountPoints[i][0], ''))
      if(ufs.existsSync(result)) {
        if(ufs.statSync(result).isDirectory()
          && ufs.readdirSync(result).length === 0) {
          return -1
        }
        return result
      }
		}
	}
  return result
}

function readMultiDir(fullpath, forceRecursive) {
	var dir = []
  // skip pk3dirs in repack mode because they will be zipped by indexer
  if(repackFiles && !forceRecursive
    && fullpath.includes('.pk3dir')
    && ufs.statSync(fullpath).isDirectory()) {
    return dir
  }
  if(ufs.existsSync(fullpath)) {
    var files = ufs.readdirSync(fullpath)
      .map(f => path.join(fullpath, f))
      .filter(f => (includeHidden || path.basename(f)[0] != '.')
        && !f.match(/index.*\.json/))
    dir.push.apply(dir, files)
    if(recursive || forceRecursive) {
      for(var j = 0; j < files.length; j++) {
        if(ufs.statSync(files[j]).isDirectory()) {
          var moreFiles = readMultiDir(files[j], forceRecursive)
          dir.push.apply(dir, moreFiles)
        }
      }
    }
  } else {
    throw new Error(`Cannot find directory ${fullpath}`)
  }
	return dir
}

async function repackPk3Dir(fullpath) {
  if(!repackFiles) {
    return
  }
  if(!ufs.existsSync(fullpath) || !ufs.statSync(fullpath).isDirectory()) {
    throw new Error(`Provided path ${fullpath} is not a directory.`)
  }
  var newPk3 = fullpath.replace('.pk3dir', '.pk3')
  vol.mkdirpSync(path.dirname(fullpath))
  if(!ufs.existsSync(fullpath.replace('.pk3dir', '.pk3')) || writeOut) {
    console.log(`archiving ${newPk3}`)
    await compressDirectory(
      readMultiDir(fullpath, true),
      vol.createWriteStream(newPk3),
      fullpath
    )
  }
  return await compressFile(newPk3, vol)
}

async function cacheFile(fullpath) {
  vol.mkdirpSync(path.dirname(fullpath))
  return await compressFile(fullpath, vol)
}

async function makeIndexJson(filename, absolute, forceWrite, pk3dir) {
  // if there is no index.json, generate one
  if(filename && (!ufs.existsSync(absolute) || forceWrite)) {
    console.log(`Creating directory index ${absolute}`)
		var files = readMultiDir(path.dirname(absolute), (forceWrite && !pk3dir) || (recursive && !repackFiles))
		var manifest = {}
		for(var i = 0; i < files.length; i++) {
			var fullpath = files[i]
			if(!ufs.existsSync(fullpath)) continue
			var file = {}
      if(virtualPk3dir
        && fullpath.includes('.pk3')
        && ufs.statSync(fullpath).isFile()) {
        var filesInZip = await readPak(fullpath, progress)
        filesInZip.forEach(entry => {
          manifest[path.join(fullpath, entry.name)] = {
            compressed: entry.compressedSize,
            name: path.join(path.basename(fullpath), entry.name),
            size: entry.size,
            offset: entry.offset
          }
        })
        file = {name: fullpath.replace('.pk3', '.pk3dir')}
      } else if(ufs.statSync(fullpath).isFile()) {
        //if(writeOut) {
        //  file = await cacheFile(fullpath)
        //} else {
          file = {size: ufs.statSync(fullpath).size}
        //}
			} else if(repackFiles
        && fullpath.includes('.pk3dir')
        && ufs.statSync(fullpath).isDirectory()) {
        // only make the pk3 if we are intentionally writing or it doesn't already exist
        file = await repackPk3Dir(fullpath)
        fullpath = fullpath.replace('.pk3dir', '.pk3')
      }
      
      var key = fullpath.replace(
        path.dirname(absolute),
        '/base/' + path.basename(path.dirname(absolute)))
        .toLowerCase()
      if(typeof file.size == 'undefined') {
        key += '/'
      }
			manifest[key] = Object.assign({
        name: fullpath.replace(path.dirname(absolute), '')
      }, file)
		}
    console.log(`Writing directory index ${absolute}`)
    var writefs = writeOut || forceWrite ? fs : vol
		vol.mkdirpSync(path.dirname(absolute))
    writefs.writeFileSync(absolute, JSON.stringify(manifest, null, 2))    
  }
}

async function findMissingTextures(project, progress, previous) {
  if(!progress) progress = console.log
  if(BASEMOD_DIRS.length === 0) await loadDefaultDirectories()
  // compare pk3 index with bsp graph
  var game = await graphGame(previous, project, progress)
  // try to match up some missing textures from mods
  console.log(game.notfound)
  console.log.apply(console.log, game.baseq3.reduce((arr, l, i) => {
    arr.push(BASEMOD_DIRS[i])
    arr.push(l)
    return arr
  }, []))
  
  if(!previous)
    fs.writeFileSync(GRAPH_PATH + '/previous-graph-' + path.basename(project) + '.json', fs.readFileSync(TEMP_NAME))

  var initial = {}
  for(var j = 1; j < BASEMOD_DIRS.length; j++) {
    var pk3dir = path.basename(BASEMOD_DIRS[j]).replace(/-cc*/ig, '') + '.pk3dir'
    var missing = game.baseq3[j].map((search) => {
      var lookup = search
        .replace(/\/\//ig, '/')
        .replace(/\\/g, '/')
        .replace(/\.[^\.]*$/, '') // remove extension
        .toLowerCase() + '.'
      var match = Object.keys(BASEMOD_LOWER[j]).filter(i => BASEMOD_LOWER[j][i].includes(lookup))
      if(match.length == 0) return
      var stat = fs.statSync(path.join(BASEMOD_DIRS[j], BASEMOD[j][match[0]]))
      if(stat.isFile())
        return {
          name: path.join('/', pk3dir, BASEMOD[j][match[0]]),
          size: stat.size
        }
    }).reduce((obj, m) => {
      if(!m) return obj
      var newKey = path.join('/base/baseq3-cc', m.name.toLowerCase())
      if(!obj[newKey]) obj[newKey] = m
      return obj
    }, {})
    if(game.baseq3[j].length == 0 || Object.values(missing).length == 0) continue
    initial['/base/baseq3-cc/' + pk3dir.toLowerCase() + '/'] = {
      name: '/' + pk3dir
    }
    initial['/base/baseq3-cc/' + pk3dir.toLowerCase() + '/scripts/missing.shader'] = {
      name: '/' + pk3dir + '/scripts/missing.shader',
      size: 2
    }
    Object.assign(initial, missing)
  }
  return initial
}

async function makeMapIndex(project, outConverted, outRepacked, noGraph, progress, usePrevious) {
  var indexJson = path.join(outConverted, 'index.json')
  var indexFinalJson = path.join(outRepacked, 'index.json')
  var convertedIndex = {}
  try {
    convertedIndex = JSON.parse(fs.readFileSync(indexJson).toString('utf-8'))
  } catch (e) {
    if(e.code != 'ENOENT') throw e
    finalIndex = {}
  }

  await loadDefaultDirectories()

  var finalIndex
  try {
    finalIndex = JSON.parse(fs.readFileSync(indexFinalJson).toString('utf-8'))
  } catch (e) {
    if(e.code != 'ENOENT') throw e
    finalIndex = {}
  }
  await progress([[2, false], [1, false], [0, false]])
  await progress([[0, 0, 1, 'Counting assets.']])
  
  var prefixPath = path.join('/base', path.basename(outConverted))
  var pk3s = glob.sync('**/*.pk3', {nodir: true, cwd: project, nocase: true})
  pk3s.sort((a, b) => a[0].localeCompare(b[0], 'en', { sensitivity: 'base' }))

  await progress([[0, 0, 1, 'Making ' + pk3s.length + ' indexes']])
  for(var j = 0; j < pk3s.length; j++) {
    var index = await readPak(path.join(project, pk3s[j]))
    await progress([[1, j, pk3s.length, pk3s[j]]])

    var maps = index.filter(entry => entry.name.match(/\.bsp$/i))
    var dir = path.basename(pk3s[j]) + 'dir'
    if(!fs.existsSync(path.join(outConverted, dir))) {
      continue
    }
    var pk3files = glob.sync('**/*', {
      nodir: false, cwd: path.join(outConverted, dir), nocase: true
    })
    var initial = {}
    var pk3Key = path.join(prefixPath, dir).toLowerCase() + '/'
    var headerLongs = []
    var checksums = [...await checksumZip(index, headerLongs)]
    if(fs.existsSync(path.join(outRepacked, path.basename(pk3s[j])))) {
      checksums.push(...await checksumZip(path.join(outRepacked, dir)))
    }
    Object.values(finalIndex).forEach(f => {
      if(!f.name.includes(dir)) return
      if(typeof f.checksums == 'undefined') {
        f.checksums = []
      }
      f.checksums.push.apply(f.checksums, checksums)
      f.headerLongs = headerLongs
      f.checksums = f.checksums.filter((c, i, arr) => arr.indexOf(c) === i)
    })
    initial[pk3Key] = {
      name: path.join('/', dir).replace(/\/$/ig, ''),
      headerLongs: headerLongs,
      checksums: checksums
    }
    convertedIndex[pk3Key] = {
      name: path.join('/', dir).replace(/\/$/ig, ''),
      checksums: checksums
    }
    var manifest = pk3files.map(file => {
      var stat = fs.statSync(path.join(outConverted, dir, file))
      return stat.isDirectory() ? ({
        name: path.join('/', dir, file).replace(/\/$/ig, ''),
      }) : ({
        name: path.join('/', dir, file),
        size: stat.size
      })
    }).reduce((obj, o) => {
      var key = path.join(prefixPath, o.name).toLowerCase()
        + (typeof o.size == 'undefined' ? '/' : '')
      obj[key] = o
      return obj
    }, initial)

    if(!noGraph) {
      var previous = null
      if(usePrevious) {
        previous = JSON.parse(ufs.readFileSync(GRAPH_PATH + '/previous-graph-' + dir + '.json').toString('utf-8'))
      }
      var missing = await findMissingTextures(path.join(outConverted, dir), progress, previous)
      Object.assign(manifest, missing)
    }
    
    var manifestJson = JSON.stringify(manifest, null, 2)
    for(var i = 0; i < maps.length; i++) {
      var entry = maps[i]
      var mapName = path.basename(entry.name).toLowerCase().replace(/\.bsp/i, '')
      var outIndexFile = path.join(outConverted, 'index-' + mapName + '.json')
      var key = path.join(prefixPath, dir, entry.name).toLowerCase()
      fs.writeFileSync(outIndexFile, manifestJson)
      convertedIndex[key] = {
        name: path.join('/', dir, entry.name),
        size: fs.statSync(path.join(outConverted, dir, entry.name)).size
      }
    }
  }
  fs.writeFileSync(indexJson, JSON.stringify(convertedIndex, null, 2))
  if(fs.existsSync(path.dirname(indexFinalJson)))
    fs.writeFileSync(indexFinalJson, JSON.stringify(finalIndex, null, 2))
}

async function runContent() {
  if(runContentGeneration) {
    for(var i = 0; i < mountPoints.length; i++) {
      var absolute = pathToAbsolute(mountPoints[i][0])
      await makeIndexJson(mountPoints[i][0], mountPoints[i][1] + '/index.json')
    }
  }
}

runContent().catch(e => console.log(e))

module.exports = {
	makeIndexJson,
	pathToAbsolute,
  repackPk3Dir,
  makeMapIndex,
  findMissingTextures,
}
