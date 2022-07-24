var {ufs} = require('unionfs')
var path = require('path')
var {mkdirpSync} = require('./compress.js')
var {execSync} = require('child_process');
var {
  findTypes, fileTypes, sourceTypes,
  audioTypes, imageTypes, findTypes,
  allTypes,
} = require('../bin/repack-whitelist.js')

function chext(file, ext) {
  return file.replace(new RegExp('\\' + path.extname(file) + '$'), ext)
}

function chroot(file, root, output) {
  // TODO: example of defensive programming
  if(file.substr(0, root.length).localeCompare(root) !== 0)
    throw new Error(`File not in root ${file}`)
  return path.join(output, file.substr(root.length))
}

async function convertNonAlpha(inFile, project, output, noOverwrite, palette) {
  var outFile
  var alphaCmd = '';
  var colorCmd = '';

  if(palette && typeof palette[inFile] == 'undefined') {
    // get average image color for palette
    try {
      colorCmd = execSync(`convert "${inFile}" -resize 1x1\! -format "%[fx:int(255*a+.5)],%[fx:int(255*r+.5)],%[fx:int(255*g+.5)],%[fx:int(255*b+.5)]" info:-`, {stdio : 'pipe'}).toString('utf-8')
      palette[inFile] = colorCmd
    } catch (e) {
      console.error(e.message, (e.output || '').toString('utf-8').substr(0, 1000))
    }
  }

  outFile = chroot(chext(inFile, '.png'), project, output)
  if(noOverwrite && ufs.existsSync(outFile)) return outFile
  outFile = chroot(chext(inFile, '.jpg'), project, output)
  if(noOverwrite && ufs.existsSync(outFile)) return outFile

  try {
    alphaCmd = execSync(`identify -format '%[opaque]' "${inFile}"`, {stdio : 'pipe'}).toString('utf-8')
  } catch (e) {
    console.error(e.message, (e.output || '').toString('utf-8').substr(0, 1000))
  }
  // if it is alpha
  if(/* true || TODO: allAlpha? */ alphaCmd.match(/false/ig)) {
    // convert everything else to png to support transparency
    outFile = chroot(chext(inFile, '.png'), project, output)
  } else {
    // if a jpg already exists, use that file for convert
    if(ufs.existsSync(chext(inFile, '.jpg'))) {
        inFile = chext(inFile, '.jpg')
    }
    // transfer low quality jpeg instead
    outFile = chroot(chext(inFile, '.jpg'), project, output)
  }
  mkdirpSync(path.dirname(outFile))
  if(noOverwrite && ufs.existsSync(outFile)) return outFile
  // convert, baseq3 already includes jpg
  try {
    // TODO: allAlpha? execSync(`convert "${inFile}" -alpha set -background none -channel A -evaluate multiply 0.5 +channel -auto-orient "${outFile}"`, {stdio : 'pipe'})
    execSync(`convert -strip -interlace Plane -sampling-factor 4:2:0 -quality 10% -auto-orient "${inFile}" "${outFile}"`, {stdio : 'pipe'})
  } catch (e) {
    console.error(e.message, (e.output || '').toString('utf-8').substr(0, 1000))
  }
  return outFile
}

async function convertAudio(inFile, project, output, noOverwrite) {
  var outFile = chroot(chext(inFile, '.ogg'), project, output)
  mkdirpSync(path.dirname(outFile))
  if(noOverwrite && ufs.existsSync(outFile)) return outFile
  try {
    execSync(`oggenc  -q 7 --downmix --resample 11025 --quiet "${inFile}" -n "${outFile}"`, {stdio : 'pipe'})
  } catch (e) {
    console.error(e.message, (e.output || '').toString('utf-8').substr(0, 1000))
  }
  return outFile
}

var MATCH_PALETTE = /palette\s"(.*?)"\s([0-9]+,[0-9]+,[0-9]+)/ig

async function convertGameFiles(gs, project, outConverted, noOverwrite, progress) {
  var palette = {}
  var existingPalette = ''
  if(ufs.existsSync(path.join(outConverted, 'scripts/palette.shader'))) {
    existingPalette = ufs.readFileSync(path.join(outConverted, 'scripts/palette.shader')).toString('utf-8')
    var m
    while((m = (MATCH_PALETTE).exec(existingPalette)) !== null) {
      palette[path.join(project, m[1])] = m[2]
    }
    existingPalette = existingPalette.replace(/palettes\/.*?\n*\{[\s\S]*?\}\n*/ig, '')
  }
  await progress([
    [2, false],
    [1, 0, 3, `Converting images`]
  ])
  var images = findTypes(imageTypes, gs.everything)
  for(var j = 0; j < images.length; j++) {
    await progress([[2, j, images.length, chroot(images[j], project, '')]])
    if(!ufs.existsSync(images[j])) continue
    var newFile = await convertNonAlpha(images[j], project, outConverted, noOverwrite, palette)
    Object.keys(gs.ordered).forEach(k => {
      var index = gs.ordered[k].indexOf(images[j])
      if(index > -1) gs.ordered[k][index] = newFile
    })
  }
  
  // save palette to shader file
  existingPalette = `palettes/default
{
${Object.keys(palette).map(k => `  palette "${chroot(k, project + '/', '')}" ${palette[k]}`).join('\n')}
}
` + existingPalette
  ufs.writeFileSync(path.join(outConverted, 'scripts/palette.shader'), existingPalette)
  
  await progress([
    [2, false],
    [1, 1, 3, `Converting audio`]
  ])
  var audio = findTypes(audioTypes, gs.everything)
  for(var j = 0; j < audio.length; j++) {
    await progress([[2, j, audio.length, chroot(audio[j], project, '')]])
    if(!ufs.existsSync(audio[j])) continue
    var newFile = await convertAudio(audio[j], project, outConverted, noOverwrite)
    Object.keys(gs.ordered).forEach(k => {
      var index = gs.ordered[k].indexOf(audio[j])
      if(index > -1) gs.ordered[k][index] = newFile
    })
  }
  
  // TODO: convert videos to different qualities like YouTubes
  
  await progress([
    [2, false],
    [1, 2, 3, `Copying known files`]
  ])
  var known = findTypes(allTypes, gs.everything)
    .filter(f => !images.includes(f) && !audio.includes(f) && !f.match(/\.pk3$/i))
  for(var j = 0; j < known.length; j++) {
    await progress([[2, j, known.length, chroot(known[j], project, '')]])
    var newFile = chroot(known[j], project, outConverted)
    if(!ufs.existsSync(known[j])) continue
    mkdirpSync(path.dirname(newFile))
    if(!noOverwrite || !ufs.existsSync(newFile)) {
      ufs.copyFileSync(known[j], newFile)
    }
    Object.keys(gs.ordered).forEach(k => {
      var index = gs.ordered[k].indexOf(known[j])
      if(index > -1) gs.ordered[k][index] = newFile
    })
  }
  
  await progress([[2, false]])
}

module.exports = {
  convertNonAlpha,
  convertAudio,
  convertGameFiles
}
