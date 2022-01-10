
I have intentionally put off "game code" development because the possibilities are so endless. Game-code is separate from "engine-code". There is a hard line, a fixed set of API calls that the game code makes to the engine. Things like RegisterModel() is a call from the game to the engine to load a specific model file. The game doesn't care what format the model is in, just that it looks like the specific model it needs, the renderers job is to decode the model format. The same thing applies to every graphic, the game doesn't care if the graphic is PNG, JPEG, that is the engine's job to figure out.

The following features I've added to baseq3a without affecting the networking protocol.


## Game Features:

  * Automatically skip to multiplayer menu TODO: and that connects to first available command server that we can request a map command. TODO: Remove the auto-connect code from javascript.
  * Configurable vote options based on roles.
  * Opening a web page from a map trigger.
  * Freezing a player like freeze tag. TODO: referee only, add freezing to game dynamics. TODO: treat frozen player like spectator.
  * More configureable physics cvars.
  * Power-up item timers.
  * Damage plum for showing hit damage near players.
  * Armor piercing rails
  * Bouncing rockets
  * Infinite invisibility cloak with \cloak command
  * Ladders shader for mapping and loading UrT maps
  * Flame thrower, TODO: add model from web like Elon Musks invention
  * Vortex Grenades. TODO: add vortex visual like warping BFG from Quake 4
  * Working Grappling Hook. TODO: add bot support. TODO: add to character class like Major only. Anyone can pick up if she drops it.
  * Lightening discharge under water like Quake 1
  * Location Damage, hitting a player on specific body parts. Also, slows and breaks legs if you fall too far like UrT.
  * Advanced weapon switching order for clients to set which weapons upgrade when they pick up.
  * Vulnerable missiles, rockets can be shot down mid air.
  * Player classes, changing starting weapon based on character model. TODO: change speed, and how much ammo can be carried.
  * Weapon dropping, using the \drop command will eject current weapon. TODO: eject picked-up items, eject ammo, eject active power-up, eject runes, eject persistent power-ups like guard and returns to podium.
  * Anti-gravity boots with \boots command.
  * Flashlight and laser commands. TODO: add visual for laser sight like battlefield when you are being targeted right in the eye.
  * Centered weapon positioning option.
  * Progressive zooming, can stop at any zoom level.
  * Rotating doors in maps for UrT support.
  * Beheading with headshot detection for Railgun only.
  * Alt weapon fire, twice as fast POC.
  * Cluster grenades.
  * Homing rockets.
  * Spread-fire power-up.
  * Server-side insta-gib gameplay.
  * Bots can spawn-camp, where they use spawn points as objectives for moving around. This was necessary for insta-gib because items are removed from the map.
  * More modes of death - ring out takes a point away from the person who falls into the void and gives a point to the last person that did knock-back damage to the player that died. "Void death" detection if someone fall a distance and then was killed by a world trigger. "from the grave" mode of death - when a grenade goes off an kills another player, after the person was already killed.
  * 60 different runes with colors, icons, and abilities from the original Rune Quake. TODO: implement runes.
  * Portals! Portal power-up can be placed anywhere, ground, mid-air, under water. Portal gun can replace the BFG with left and right click to place a portal on walls. Portal power-up `\give portal` is a free standing portal it will set 2 ends of a portal with the `\use` command. Both ends of free standing portals rotate to always face the camera in the same orientation. Shader portals can specify "world" key in the .map entities and can be used on any mod with the new engine and renderer.

## TODO

  * Finish portal interpolation, and seeing one portal surface through another portal, projectiles (distance from origin). Share entities between multiple server qagame QVMs, possibly through the engine itself or a new API call for game/g_*.c  Add `world` game commands when using inter-dimensional teleporters, and set the `sv_mvWorld` designation for managed cameras. Finish multiworld TODOs like not crashing after 10 maps and cvars. 
  * Rocket Arena maps. Place white return teleporters for arena 0 on player_start positions and going through a portal counts as a vote to white arena to play in. Or use drop command to drop portal connects and in RA mode return to arena 0. Always spawn in arena 0 during intermission until voted, or remove guns from arena 0 and repawn in voted arena.
  * Add entities through portals
  * Add autosprite flag to misc_model for rotating like portal always facing camera
  * Shoot portal gun twice in the same place to fill a specific area of space on the wall for the portal, generating a new portal model to fit the surface. The portal stretches to cover an entire wall. 3 kinds of portals. Shoot again and the portal goes back to small and round. Maximize at an optional 50 x 50 = 2500 area. Somehow visualize morphing from sphere to whole wall.
  * Use geometric content from previous campaigns Q1, Q2, but ruin the ability to speed run (smarter bots, more enemies, team based, disrupting events and puzzles, long missions like Q2 Ground Zero Research Hangar) then create a new mode called shortcuts, where alternate puzzles can be solved to jump through maps quickly.
  * Free standing portals should use gravity for like half a second, to land on the ground correctly, then figure out where the bounding box puts it and maybe add a stand.
  * Make a Doom style Prawler amygdala that you have to kill for in a boss fight to get teleportation abilities.
  * Temporal goggles to see where other players portals are created. Add temporal paths using botlib to show a stream like donny darko where portals lead. Other worlds lead out into space somewhere. Also show the rendering between portals should stretch the world around for a second.
  * Fix portals on walls, possibly using bounce for half a second? Then check for a flat/even surface on at least 4 corners, if it is not on the same plane show the little "portal failure" bubbles where the explosion would have been. At least player movement must be able to handle points, how is it possible to detect holes and other geometry? Disregard irregular vertices completely and hide every vertex within a 100u radius by moving them to 10000 * AngleVectors() to hide an protrusions. Holes will just get covered up or the portal would go through it.
  * Reportedly, Portal the game it is a developer responsibility to specify where portals can be placed, this seems incredibly difficult to me or it was much more linear than I thought (i.e. only one way to solve the puzzle). https://www.youtube.com/watch?v=eNKntZzwnAw
  * Portal has view-axis ROLL turning towards the pull of gravity. Splitgate uses roll, but it is much faster than Portal 1
  * Add Splitgate style if you go through someone else's portal it is black and unknown, might make for good traps, HAHA!
  * Trigger earthquake from kamikaze.
  * Optional for portals to be for 1 individual player, or any player can go through any players portal. NODRAW and SINGLECLIENT flags to be set.
  * Add auto-regen health shield thing?
  * Fix portal gun.  Use teleporter location to draw entities in relative locations on the other side of the jump.  Use a special flag on teleport to tell it where to interpolate for other players even though EF_TELEPORT_BIT is used, just follow velocity backwards one frame on personal teleporters. Looking through a standing portal has a weird repetitive effect because of depth write or sorting or something. Turn off depth in shader or skip entity in tr_main.c? Measure/cache midpoint of portal model and use on floor and wall alignment. Fix corners by tracing in server for edges. Add NOPORTAL surfaceParm. Still take falling damage for landing on a portal. Projectiles through portals. Face wall portals like 5 degrees towards player away from original angle. No falling damage while holding the portal gun.
  * Teach bots to use portals.
  * Add features to support other map types like Xonotic (warp zones are just automatically centered cameras with some fancy distortion shaders, Quake 1 did not normally have the camera feature) and QueToo (map format?) and Smokin' Guns probably added a surface parm.
  * Add tracer rounds, ammo clip sized packs for reloading, etc.
  * Infinite haste, how is this different than g_speed? Applies to only one player.
  * Boots that can climb steep slopes. 
  * Jump velocity as a part of anti-gravity boots. 
  * Power-ups cover entire body or just the gun setting from server and client setting. 
  * Add player state to UI QVM so multiple cursors can be shared, and players can see map and game configuration.
  * Add walk on walls, better movement than Trem.
  * Live-action minimap, using procedurally generated mini maps, draw small players top-down and glowing like quad damage.
  * Ricochet mode where damage only applies after projectile bounces/splash damage
  * Showing enemy health and armor above their head like an RPG
  * Extra UI menus with multiQVM, for voting on maps and bitcoin setup, Instant replay, consolidate all VM UIs scoreboard/postgame/HUD/menus in to 1 UI system, replace the menu address with an API call.
  * Many mod support, compiling and playing lots of different game types, capture the flag with 3+ teams
  * Campaign mode, playing older engine content and playing as enemy characters, new AI for old enemies
  * Keep away, where one team has to kill the flag carrier and return they flag to score.
  * Add light coming from player to flashlight command so even if you're pointing at the sky it looks like a flashlight is on.
  * Make "tech-demo" as an example of some game dynamic. Make a Matrix mod that loads the white loading program and jump simulation and UrT subway. Make a space to planet landing sequence with death modes. https://www.youtube.com/watch?v=sLqXFF8mlEU
  * Tie content together with lore. When Utu had success with creating life, The Father granted him immortality. Yog-Sothoth was jealous of Utus success with Earth he decided to poison the others Gods' worlds. Employing his monstrous creation Shug-Niggurath to create the first Quake. Reanimating souls from the dead to supply the army.
  * When the Earth's army took control of the slip-gate and killed Shub, the quest for immortality had failed. Furious Yog-Sothoth convinced Kahn Maykr from Urdak to give him the seeds of life so that he may become immortal. Kahn admitted his creation was "too perfect" and should merge with the decendents of Utu to create a hybrid race to plant their seeds of life and evil as slaves.
  * Together Kahn created the machinery and Yog harvested the bio-material required to develop the Strogg. Once the manufacturing facility was up and running on Stroggos, their supply chain harvested itself. This is the point Earthlings realized Yog had gone too far. Stroggos had to be destroyed with offensive action.
  * When Utu realized Yog intended to poison him, he travelled with Enki to another civilization he created with the same genome from Earth on the other side of the cosmos called Uru. There, they touched the D'ni, giving them the ability to create worlds of their own. Why should the Maykrs from Argent D'Nur be the only one's creating worlds? Unfortunately, this hubris only led to more problems. Dumuzid was left with watch over Earth, but Sog trapped him deep underground. This created a famine on Earth, making it easy for Sog to feed their new supply chain to Stroggos creating the 2 Quake.
  * Jealous of the benefits of war on Stroggos, the Vadrigar took control of supply chain on Stroggos, overrunning the humans immediately. It a purely death by numbers swarm. The Vadrigar has been harvesting souls to make Argent Energy for the Dark Lord for centuries, and profiting by skimming off the top for their Arena Games. A popular intergalactic television show on the outer worlds where species get bored. Creating the 3rd Quake.
  * Eventually, tired soldiers, earthlings and aliens alike rise up against the Vadrigar to destroy the supply chair with armies from their home worlds. Combine slip-gates, and content from Quake 4?
  * Quake 5 play on the home-worlds of each species, but in a mistakenly massive defeat of stop the Arenas on Vadrigas, they've expanded to each home world.
  * 2001 Space Odyssey to meet VEGA aka HAL aka SKYNET
  