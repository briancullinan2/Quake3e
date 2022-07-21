```
,-------------------------------------------------------------------------------.
 _____  _               _   _ ______ _______    ____  _    _         _  ________ 
|  __ \| |        /\   | \ | |  ____|__   __|  / __ \| |  | |  /\   | |/ /  ____|
| |__) | |       /  \  |  \| | |__     | |    | |  | | |  | | /  \  | ' /| |__   
|  ___/| |      / /\ \ | . ` |  __|    | |    | |  | | |  | |/ /\ \ |  < |  __|  
| |    | |____ / ____ \| |\  | |____   | |    | |__| | |__| / ____ \| . \| |____ 
|_|    |______/_/    \_\_| \_|______|  |_|     \___\_\\____/_/    \_\_|\_\______|

'----------------------------- https://quake.games -----------------------------'
```

This project derives from https://github.com/ec-/Quake3e and https://github.com/inolen/quakejs.

To see a live demo, check out https://quake.games

Demo videos https://www.youtube.com/channel/UCPaZDuwY1sJOb5l-QHm9mDw

Go to [Releases](../../releases) section to download latest binaries for your platform.

The feature list has become so long that I needed separate README files to describe each piece. This list will only have a short, truncated description with links to the other read-mes.

More on what makes WebAssembly [difficult to build here](./docs/quakejs.md#reasons-i-quit-working-on-this).

This is not a cheat server. There are experimental features that can be used to make "cosmetic" improvements. For example, the UNCHEAT mod is for moving the weapon position (e.g. `cg_gunX`) on mods that support weapon positioning but have the settings marked as CVAR_CHEAT. But I think we can agree that the position of the gun on **my** screen isn't affecting **your** ability to score against me. Variables that are unCHEAT protected are sent to server administrators for filtering/temporary blocking. The server kindly asks the player to re-add the CHEAT protection in order to play.

## New Features

  * [Docker support](./docs/docker.md)
  * [WebAssembly build mode](./docs/quakejs.md)
  * [Lazy loading](./docs/lazyloading.md)
  * [Server-side demos](./docs/demos.md)
  * [Multiworld, multi-map loading](./docs/multiworld.md)
  * [Lightning Network bitcoin transactions](./docs/payments.md)
  * [Procedural map generation](./docs/procedural.md)
  * [Multiple game styles](./docs/games.md)
  * [Slim client/auto connect and more](./docs/client.md)
  * [Referee, persistent sessions, event system](./docs/server.md)
  * WebAssembly build target without Emscripten
  * PNG support
  * Drag and drop
  * Many, many bug fixes

## Coming soon!
  
  * Multi-world file-system.
  * demoMap rendering that maps a .dm file to a surface in game.
  * Advanced teleporting features like replacing Voids with teleporting back, addressable spawn points.
  * Convert entire build system to even more agnostic C# than UE5, this is getting silly.

## Future TODOs

  * Authenticated clients
  * Always on twitch.tv streaming at no expense to the game server
  * Copy kubernetes support https://github.com/criticalstack/quake-kube
  * Asynchronous rendering for portals, mirrors, demos, videos, multiple maps, etc
  * Make a simple thread manager https://stackoverflow.com/questions/7269709/sending-information-with-a-signal-in-linux or use oneTBB as an alternative?
  * Move more features like EULA, etc out of JS and in to C system.
  * Quake 3 1.16n and dm3 integrated support from https://github.com/zturtleman/lilium-arena-classic.
  * IN FAILURE: HTML and CSS menu renderer with RmlUI
  * IN FAILURE: webm/VPX/vorbis video format, SVG, GIF

## Console

See the console commands from ioq3 https://github.com/ioquake/ioq3#console

Some client variables have been set by default for compatibility, those are listed here:
https://github.com/briancullinan/planet_quake/blob/ioq3-quakejs/code/sys/sys_browser.js

## Building

Derives from [Quake3e Github](https://github.com/ec-/Quake3e#build-instructions) and 
[QuakeJS Github](https://github.com/inolen/quakejs#building-binaries)

## Contributing

Use [Issue tracker on Github](https://github.com/briancullinan/planet_quake/issues)

## Credits

Maintainers

  * Brian J. Cullinan <megamindbrian@gmail.com>
  * Anyone else? Looking for volunteers.

Significant contributions from

  * @klaussilveira, @inolen, @NTT123 (JS build mode)
  * Ryan C. Gordon <icculus@icculus.org>
  * Andreas Kohn <andreas@syndrom23.de>
  * Joerg Dietrich <Dietrich_Joerg@t-online.de>
  * Stuart Dalton <badcdev@gmail.com>
  * Vincent S. Cojot <vincent at cojot dot name>
  * optical <alex@rigbo.se>
  * Aaron Gyes <floam@aaron.gy>


## TODO (in this repo): User Story

* The player opens the web interface and navigate to a map called "Guns, Lot's of Guns"
* The player is teleported into an all white room with shelves oriented radially so 
   each isle can be walked down towards the center of the circle. Parallel 
   with each other but wider at the far side of the shelf to form a circle.
   Morpheus is standing in the center next to an arm-chair and an old fashioned
   television set. 
* When the player touched the television they are teleported
   to a city rooftop like Superman from UrT4. 
* When the player jumps off the roof to
   follow Morpheus the player falls, see the world around fall to pieces like
   [You'll Shoot Your Eye Out](https://lvlworld.com/votes/id:2238). 
* The player is then teleported to the Dojo Q3 map.
* The player moves the browser window out of the recording to reveal another window of
   a television set zoomed in so you can't see the borders. It shows 4 screens
   of a time delay from the previous 30 seconds of all the rooms the player recently passed 
   through. 
* It slowly pans backwards to reveal the televition set and DVR system.
   Behind the television set a figure begins to appear, the logo style like at the
   [end of the Quake 3 Intro](https://youtu.be/Rgps2D3LptY?t=72) begins to appear 
   but instead of Quake III, it says Enter The Matrix. 
* When the words become obvious, Agent Smith's head 
   begins to appear from behind the television set controlled by another player remotely.
* All players can navigate all 4 worlds, The loading room for weapons, the sky-scraper city,
   the dojo and Agent Smith's monitor (Camera's Lots Of Camera's) should be laid out like 
   the Guns map but with cameras set to view-point of every entity.

<sup><sub>powered by [void-zero](https://github.com/briancullinan/void-zero)</sub></sup>

