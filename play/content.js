// Lore and content library for procedural naming and future narrative hooks.
// Exposes ContentLibrary on the global window so other scripts can pull shared vocabularies.
(function attachContentLibrary(global) {
  const SMALL_SETTLEMENT_FIRST_WORDS = [
    "Sunbleached",
    "Dustline",
    "Coyote",
    "Rustwind",
    "Deadeye",
    "Highnoon",
    "Goldrush",
    "Redrock",
    "Switchback",
    "Spur",
    "Caliche",
    "Drygulch",
    "Longdraw",
    "Trailmark",
    "Sagebrush",
    "Ironspur",
    "Heatwave",
    "Outrider",
    "Rattleskull",
    "Saltflat",
    "Brokenwheel",
    "Lastlight",
    "Ashfall",
    "Glowdust",
    "Radburn",
    "Hotwire",
    "Scrapline",
    "Deadmeter",
    "Ghostsignal",
    "Fallout",
    "Crackzone",
    "Afterlight",
    "Blister",
    "Scorchmark",
    "Static",
    "Leakside",
    "Emberwake",
    "Hollowcore",
    "Ruinbound",
    "Dustwake",
    "Ghostload",
    "Sunghost",
    "Brightfault",
    "Mirage",
    "Clearshot",
    "Highglare",
    "Warmwind",
    "Skywide",
    "Lazeline",
    "Openheat",
    "Palmside",
    "Shimmer",
    "Saltair",
    "Sunspill",
    "Daybreak",
    "Brightreach",
    "Goldtide",
    "Bluehaze",
    "Freshcut",
    "Greenrise",
    "Newsoil",
    "Clearwater",
    "Sprout",
    "Milkbright",
    "Haygold",
    "Cropmark",
    "Windrow",
    "Plowline",
    "Seedfall",
    "Barnlight",
    "Harvest",
    "Lowfield",
    "Irrigate",
    "Ditchside",
    "Gatorrun",
    "Blackwater",
    "Mirelight",
    "Mosshollow",
    "Cypress",
    "Mudglass",
    "Stillrot",
    "Bogshine",
    "Driftroot",
    "Swellsink",
    "Fogreach",
    "Rotbank",
    "Deepfen",
    "Needlepine",
    "Canopy",
    "Shadefall",
    "Oldgrowth",
    "Barkline",
    "Fernreach",
    "Crowdeep",
    "Timberlost",
    "Saprun",
    "Whisperleaf",
    "Darkbough",
    "Rootbound",
    "Valewind",
    "Lowreach",
    "Widebend",
    "Greenfold",
    "Suntrough",
    "Riverset",
    "Softland",
    "Openvale",
    "Driftplain",
    "Breakridge",
    "Saltcrest",
    "Wavecut",
    "Brightshore",
    "Lowtide",
    "Foamline",
    "Windharbor",
    "Suncoast",
    "Driftbay",
    "Pelican",
    "Kelpmark",
    "Drybone",
    "Sandscar",
    "Heatcrack",
    "Dunefall",
    "Glasswaste",
    "Redsalt",
    "Baretrack",
    "Sunfracture",
    "Longburn",
    "Windhollow",
    "Highbreak",
    "Stonewake",
    "Coldreach",
    "Ironlift",
    "Skyspine",
    "Snowline",
    "Rockfall",
    "Thinair",
    "Frostcut",
    "Glowmark",
    "Radshine",
    "Hotsoil",
    "Neonrust",
    "Sporewind",
    "Warped",
    "Brightscar",
    "Twistbone",
    "Oddreach",
    "Meltglass",
    "Shatter",
    "Cracklight",
    "Deadframe",
    "Loosebolt",
    "Sagline",
    "Splinter",
    "Buckled",
    "Rustdrop",
    "Patchwork",
    "Stillnew",
    "Cleanbreak",
    "Brightedge",
    "Freshline",
    "Polished",
    "Clearcast",
    "Newmint",
    "Smoothcut",
    "Shinefield",
    "Goldclean",
    "Openhand",
    "Truebright",
    "Sage",
    "Coyote",
    "Spur",
    "Dust",
    "Caliche",
    "Gulch",
    "Draw",
    "Ridge",
    "Mesa",
    "Butte",
    "Arroyo",
    "Canyon",
    "Wash",
    "Anvil",
    "Iron",
    "Rust",
    "Tin",
    "Copper",
    "Ash",
    "Ember",
    "Smoke",
    "Coal",
    "Char",
    "Ghost",
    "Wraith",
    "Echo",
    "Holler",
    "Shade",
    "Feral",
    "Wild",
    "Stray",
    "Bleach",
    "Sun",
    "Glare",
    "Heat",
    "Ray",
    "Gold",
    "Chrome",
    "Glass",
    "Bright",
    "Clear",
    "Clean",
    "Fresh",
    "Mint",
    "Shine",
    "Polish",
    "Neon",
    "Palm",
    "Citrus",
    "Surf",
    "Salt",
    "Kelp",
    "Foam",
    "Tide",
    "Wave",
    "Harbor",
    "Drift",
    "Lagoon",
    "Marsh",
    "Bog",
    "Fen",
    "Slough",
    "Mud",
    "Mire",
    "Reed",
    "Gator",
    "Cypress",
    "Moss",
    "Pine",
    "Fir",
    "Redwood",
    "Cedar",
    "Bark",
    "Sap",
    "Fern",
    "Leaf",
    "Needle",
    "Valley",
    "Basin",
    "Reach",
    "Plain",
    "Field",
    "Furrow",
    "Loam",
    "Soil",
    "Seed",
    "Sprout",
    "Hay",
    "Barn",
    "Silo",
    "Mill",
    "Tractor",
    "Fence",
    "Irrigation",
    "Canal",
    "Ruin",
    "Crack",
    "Break",
    "Split",
    "Shard",
    "Scar",
    "Warp",
    "Bent",
    "Crook",
    "Tilt",
    "Sag",
    "Lean",
    "Fall",
    "Decay",
    "Rot",
    "Mold",
    "Blight",
    "Rad",
    "Glow",
    "Spore",
    "Mutant",
    "Odd",
    "Crooked",
    "Skew",
    "Twist",
    "Spark",
    "Flash",
    "Gleam",
    "Bloom",
    "Rise",
    "Open",
    "Still",
    "True",
    "Edge",
    "Frame",
    "Core",
  ];

  const SMALL_SETTLEMENT_SECOND_WORDS = [
    "Village",
    "Hamlet",
    "Hollow",
    "Glen",
    "Vale",
    "Brook",
    "Ford",
    "Crossing",
    "Corner",
    "Corners",
    "Heights",
    "Heath",
    "Green",
    "Fields",
    "Meadow",
    "Meadows",
    "Downs",
    "Ridge",
    "Hill",
    "Hills",
    "Creek",
    "Run",
    "Bend",
    "Point",
    "Landing",
    "Harbor",
    "Cove",
    "Bay",
    "Springs",
    "Falls",
    "Rapids",
    "Bluff",
    "Cliffs",
    "Forest",
    "Woods",
    "Groves",
    "Thicket",
    "Clearing",
    "Prairie",
    "Plain",
    "Flats",
    "Terrace",
    "Plateau",
    "Pass",
    "Gap",
    "Notch",
    "Reach",
    "Shore",
    "Bank",
    "Ferry",
    "Bridge",
    "Mill",
    "Mills",
    "Forge",
    "Foundry",
    "Works",
    "Quarry",
    "Mine",
    "Pit",
    "Station",
    "Depot",
    "Post",
    "Market",
    "Square",
    "Common",
    "Cross",
    "Crossroads",
    "Gate",
    "Watch",
    "Lookout",
    "Camp",
    "Outpost",
    "Hold",
    "Keep",
    "Ward",
    "Haven",
    "Refuge",
    "Rest",
    "End",
    "Edge",
  ];

  function buildSmallSettlementNames(targetCount = 16, options = {}) {
    const firstPool = options.firstWords || SMALL_SETTLEMENT_FIRST_WORDS;
    const secondPool = options.secondWords || SMALL_SETTLEMENT_SECOND_WORDS;
    if (!Array.isArray(firstPool) || !firstPool.length || !Array.isArray(secondPool) || !secondPool.length) return [];
    const names = [];
    const seen = new Set();
    const maxAttempts = Math.max(500, targetCount * 20);
    let attempts = 0;
    while (names.length < targetCount && attempts < maxAttempts) {
      attempts += 1;
      const first = firstPool[Math.floor(Math.random() * firstPool.length)];
      const second = secondPool[Math.floor(Math.random() * secondPool.length)];
      const label = `${first} ${second}`;
      if (seen.has(label)) continue;
      seen.add(label);
      names.push(label);
    }
    return names;
  }

  global.ContentLibrary = global.ContentLibrary || {};
  global.ContentLibrary.smallSettlementFirstWords = SMALL_SETTLEMENT_FIRST_WORDS;
  global.ContentLibrary.smallSettlementSecondWords = SMALL_SETTLEMENT_SECOND_WORDS;
  global.ContentLibrary.buildSmallSettlementNames = buildSmallSettlementNames;
  global.ContentLibrary.HomeBaseBuild = {
    assembleRecon: "Forge a fresh recon crew.",
    trainUnit: "Run drills and field tuning to advance the unit.",
    levelUpUnit: "Level up a unit (+1 AP).",
    weaponUpgrade: "Improve a unit's weapons (+1 to roll).",
    baseLevelTwo: "+1 unit slot, unlock vehicles.",
    baseLevelThree: "+1 unit slot, allows upgrades past lvl 10.",
    solarPanel: "Reduce energy demand and free up fuel reserves (+1 gas per turn).",
    solarPanelOwned: "Panels are live. Fuel lines stay topped.",
    binocs: "Field-issue optics that widen every patrol's scan.",
    binocsOwned: "Binocs provided to all patrolling units.",
    luckyCharm: "A talisman traded across the wastes, drawn only when loot's on the line.",
    luckyCharmOwned: "The charm is in play for loot rolls.",
    firesale: "Slash prices to generate cash: +3 chits, but -2 to gas, wood and components every turn.",
    firesaleOwned: "Everything on sale, always.",
  };
})(window);

(function attachHowToPlay(global) {
  const HOW_TO_PLAY_TEXT = `HOW TO PLAY: From Rust 'Til Dawn

OBJECTIVE
Establish a thriving outpost by securing settlements, gathering supplies, and pushing back hostile forces. Balance exploration with resource management to survive.
Your #1 goal is to make it to any of the Great Dams, far in the East.
The game is over should your stockpile of food or water reach 0. 

CORE MECHANICS
- Resources: Track Chits (currency), Food, Water, Gas, Wood, and Components. Manage Action Points (AP) to execute orders each turn.
- Send soldiers or vehicles to explore the fog-shrouded map. Movement costs AP; vehicles also consume Gas.
- Units move faster on flat, urban terrain. Vehicles handle slopes faster, while soldiers handle dense vegetation better.
- Most actions resolve with d20 or d6 rolls. Your roll + bonuses must meet or exceed the difficulty target. High rolls succeed; low rolls risk injury or failure.
- Random events trigger while exploring: hostile battles, abandoned camps for rest, treasure chests, and strange phenomena.

SETTLEMENTS & EXPANSION
- Small Settlements: Rolling 3d6 here adds a steady resource income of chits, food and water.
- Large Settlements: Persuasion captures enemy locations; succeed on a d20 to win over towns. Captured strongholds yield gas, wood and components.
- Level up your Home Bunker to unlock vehicle assembly, unit upgrades, and more.
- Diversify settlements to stabilize income streams. Small vs large, and neutral vs enemy owned settlements all differ. 
- Don't overextend: every captured large settlement costs food and water to maintain. 

TIPS FOR SURVIVAL
- Upgrade units to improve roll bonuses and AP capacity.
- Units will die if they run out of food or water; keep an eye on this. 
- Remember to regularly fast travel back to base and unload wasteland goodies to enable upgrades, and stock up on food and water. This is enabled as a move order from an owned settlement.
- Difficulty scales over time (every 8 turns) as the wasteland grows harsher.

HARDCORE MODE
- Enable it from the title screen to play without saves or loads.
- Successful Hardcore runs add a flat +2000 to your recorded high score.

HOTKEYS
- 1-9: Focus and select the 1st-9th deployed unit (creation order).
- Q/Right Click: Deselect unit.
- ~: Center on home base.
- H: Center on home and open the home base scene.
- W/A/S/D: Move units on the map.
- SPACE: Advance the active scene — click to roll dice, spin for resource, confirm the resource amount roll, or return to the map when a scene is finished.
- ESC: Open the menu (only available when End Turn is available).
- D: In the home base scene, deploy the first available unit from the units list.
- B: In the home base scene, open the Build tab.
- L: In the home base scene, open the Loadout window for the first available unit.
- S: In an owned large settlement scene, open (or close) the shop pane.
- CTRL+SPACE: End the current turn.
- F8: Quicksave in current slot.`;

  global.ContentLibrary = global.ContentLibrary || {};
  global.ContentLibrary.HowToPlayText = HOW_TO_PLAY_TEXT;
})(window);

(function attachCreditsText(global) {
  const CREDITS_TEXT = "Developed by Darwin Studio, NYC 2025-26. \nMusic by Inter Alia, Chronicles of the Lair, and The Submarine Chronicles @ [Tone Den Records](https://toneden.com/) and [Hisstology Records](https://hisstology.com/). (CC BY-NC 4.0)\nSatellite imagery courtesy of Copernicus/ESA.\n\nPlease visit: \n-our studio at https://j-mav.github.io/darwinstudio/ \n-the game's page at https://fromrusttildawn.itch.io/survive \n-our subreddit and post your high score at https://www.reddit.com/r/FromRustTilDawn/\n\nFrom Rust 'Til Dawn is free. If you enjoy it, you can buy us a coffee at https://buymeacoffee.com/darwinstudio";

  global.ContentLibrary = global.ContentLibrary || {};
  global.ContentLibrary.CreditsText = CREDITS_TEXT;
})(window);



// --- ADD BELOW EXISTING CONTENT, DO NOT REMOVE ANYTHING ABOVE ---

(function attachBattles(global) {
  global.ContentLibrary = global.ContentLibrary || {};

  global.ContentLibrary.Battles = [
    {
      spritelabel: "battle2-0",
      entries: [
        {
          roll: 1,
          narrative: "Critical Failure! The bloated brute batters you with its rusted cleaver. You slip in gore and flee bleeding, dignity and supplies left behind.",
          outcome: "food,-3;water,-2;chits,-2"
        },
        {
          roll: 2,
          narrative: "You misjudge its reach. A backhand sends you sprawling. You escape, but your pack is lighter and your ribs scream.",
          outcome: "food,-2;water,-1"
        },
        {
          roll: 3,
          narrative: "The mutant laughs wetly as you retreat. You lose time and a few valuables scrambling away.",
          outcome: "chits,-2"
        },
        {
          roll: 4,
          narrative: "You trade blows briefly before realizing this is a bad idea. You limp away poorer.",
          outcome: "food,-1;water,-1"
        },
        {
          roll: 5,
          narrative: "Its cleaver clips your pack, shredding supplies as you dive clear.",
          outcome: "food,-2"
        },
        {
          roll: 6,
          narrative: "You scare it off with noise and fire, but waste precious fuel doing it.",
          outcome: "gas,-1"
        },
        {
          roll: 7,
          narrative: "A tense standoff ends with mutual retreat. You lose nothing but nerves.",
          outcome: "chits,-1"
        },
        {
          roll: 8,
          narrative: "You disengage carefully, dropping bait to keep it busy.",
          outcome: "food,-1"
        },
        {
          roll: 9,
          narrative: "You back away slowly. The brute snarls but lets you go.",
          outcome: "water,-1"
        },
        {
          roll: 10,
          narrative: "You take another route and the encounter never fully happens.",
          outcome: ""
        },
        {
          roll: 11,
          narrative: "You ambush it, drawing blood before retreating with scavenged scraps.",
          outcome: "food,1;components,1"
        },
        {
          roll: 12,
          narrative: "The mutant falls. You harvest usable meat and dented armor plates.",
          outcome: "food,2;components,1"
        },
        {
          roll: 13,
          narrative: "You outmaneuver the brute and claim its stash.",
          outcome: "chits,2;food,1"
        },
        {
          roll: 14,
          narrative: "A brutal fight ends in your favor. You loot thoroughly.",
          outcome: "food,2;chits,2;components,1"
        },
        {
          roll: 15,
          narrative: "You fell the monster cleanly. Plenty of salvage remains.",
          outcome: "food,3;components,2"
        },
        {
          roll: 16,
          narrative: "You dismantle the brute like a butcher with purpose.",
          outcome: "food,3;components,3"
        },
        {
          roll: 17,
          narrative: "The kill is efficient and profitable. The wasteland approves.",
          outcome: "food,4;chits,3"
        },
        {
          roll: 18,
          narrative: "You claim everything worth carrying, slick with blood and victory.",
          outcome: "food,4;components,3;chits,2"
        },
        {
          roll: 19,
          narrative: "The brute never had a chance. You walk away rich and fed.",
          outcome: "food,5;chits,4"
        },
        {
          roll: 20,
          narrative: "Critical Success! The mutant collapses instantly. You butcher, salvage, and feast like a legend whispered over campfires.",
          outcome: "food,7;components,4;chits,3"
        }
      ]
    },
  {
    "spritelabel": "battle2-1",
    "entries": [
      {
        "roll": 1,
        "narrative": "Critical Failure! The writhing mass of tentacles surges forward faster than instinct. Barbed limbs wrap your legs, ripping gear loose as acidic slime burns your skin. You hack free screaming, leaving supplies embedded in pulsating flesh.",
        "outcome": "food,-6;water,-4;components,-4"
      },
      {
        "roll": 2,
        "narrative": "You freeze a second too long. A tentacle lashes your pack open and slurps something valuable before you flee retching from the stench.",
        "outcome": "food,-4;chits,-4"
      },
      {
        "roll": 3,
        "narrative": "The creature bellows wetly, flinging debris and ichor. You escape, but panic costs you gear.",
        "outcome": "water,-4"
      },
      {
        "roll": 4,
        "narrative": "You stumble over bone piles while retreating, abandoning supplies to stay alive.",
        "outcome": "food,-2;chits,-4"
      },
      {
        "roll": 5,
        "narrative": "A tentacle grazes you, corrosive slime eating through containers.",
        "outcome": "water,-4"
      },
      {
        "roll": 6,
        "narrative": "You drive it back with fire, but fuel burns fast in the chaos.",
        "outcome": "gas,-2"
      },
      {
        "roll": 7,
        "narrative": "The mass recoils at noise and light. You retreat shaken, slightly poorer.",
        "outcome": "chits,-4"
      },
      {
        "roll": 8,
        "narrative": "You disengage carefully, tossing bait to distract its many mouths.",
        "outcome": "food,-2"
      },
      {
        "roll": 9,
        "narrative": "The creature watches you leave, tendrils twitching. You don’t run, but you don’t gain anything either.",
        "outcome": "water,-2"
      },
      {
        "roll": 10,
        "narrative": "You skirt the edge of the nest unnoticed and move on.",
        "outcome": ""
      },
      {
        "roll": 11,
        "narrative": "You slice free a severed tentacle while backing away. It still twitches in your pack.",
        "outcome": "components,2"
      },
      {
        "roll": 12,
        "narrative": "Fire and steel drive the mass into retreat. You collect strange organic scrap.",
        "outcome": "components,4"
      },
      {
        "roll": 13,
        "narrative": "You wound it badly. The ground is littered with hardened ichor worth salvaging.",
        "outcome": "components,4;chits,4"
      },
      {
        "roll": 14,
        "narrative": "The creature collapses into steaming sludge. You harvest useful biomass.",
        "outcome": "components,6;food,2"
      },
      {
        "roll": 15,
        "narrative": "You dismantle the nest carefully, avoiding acid sacs and collecting valuables.",
        "outcome": "components,6;chits,8"
      },
      {
        "roll": 16,
        "narrative": "The kill is methodical. You leave with rare materials traders will want.",
        "outcome": "components,8;chits,8"
      },
      {
        "roll": 17,
        "narrative": "You burn and butcher until nothing moves. The smell will haunt you, but the profit won’t.",
        "outcome": "components,8;chits,12"
      },
      {
        "roll": 18,
        "narrative": "You harvest the core of the mass, pulsing with unstable energy.",
        "outcome": "components,10;chits,12"
      },
      {
        "roll": 19,
        "narrative": "The nest is annihilated. You take everything not fused to the ground.",
        "outcome": "components,12;chits,16"
      },
      {
        "roll": 20,
        "narrative": "Critical Success! You eradicate the abomination completely, harvesting rare, potent materials that will buy safety and silence across the wastes.",
        "outcome": "components,14;chits,20"
      }
    ]
  }, 
  {
    "spritelabel": "battle2-2",
    "entries": [
      { "roll": 1, "narrative": "Critical Failure! The armored gunner’s burst walks up your body like a staircase. You crawl away smoking, leaving supplies and pride in the dust.", "outcome": "water,-6;food,-4;chits,-8" },
      { "roll": 2, "narrative": "You step out to talk and get answered in bullets. You dive, bleeding, and abandon a pouch to survive.", "outcome": "chits,-8;water,-2" },
      { "roll": 3, "narrative": "His visor tracks you calmly. You flee under fire, dropping rations like breadcrumbs for death.", "outcome": "food,-4" },
      { "roll": 4, "narrative": "You trade shots; he wins the conversation. You escape, but your canteen takes a hit and leaks.", "outcome": "water,-4" },
      { "roll": 5, "narrative": "A ricochet shreds a fuel line in your pack. You cap it, swearing, and run.", "outcome": "gas,-4" },
      { "roll": 6, "narrative": "You throw smoke and retreat; it works, but costs precious fuel and time.", "outcome": "gas,-2;chits,-4" },
      { "roll": 7, "narrative": "He doesn’t chase; he just watches, judging your life choices. You leave a small bribe to stay alive.", "outcome": "chits,-4" },
      { "roll": 8, "narrative": "You slip away through rubble, but your pack snags and tears. Something clatters out, never to be seen again.", "outcome": "components,-2" },
      { "roll": 9, "narrative": "You back off slowly. He lets you go, but the stress makes you drink more than you should.", "outcome": "water,-2" },
      { "roll": 10, "narrative": "You spot him first and take a wide detour. No shots fired; no heroics performed.", "outcome": "" },
      { "roll": 11, "narrative": "You bait him into a bad angle and snag a dropped magazine and a few coins while he reloads.", "outcome": "chits,4;components,2" },
      { "roll": 12, "narrative": "A clean flank. He goes down hard; you strip usable plates and a tucked-away stash.", "outcome": "components,4;chits,4" },
      { "roll": 13, "narrative": "You disable his weapon and end it fast. The armor yields parts worth their weight in survival.", "outcome": "components,4;chits,8" },
      { "roll": 14, "narrative": "His suit becomes your salvage pile. You leave with spare wiring and intact canteens.", "outcome": "components,6;water,2" },
      { "roll": 15, "narrative": "You win without getting messy. Loot is generous, like the wasteland briefly feels guilty.", "outcome": "chits,12;components,4" },
      { "roll": 16, "narrative": "You pop the visor seal; he panics; it’s over. You take everything useful and nothing sentimental.", "outcome": "components,6;chits,12;food,2" },
      { "roll": 17, "narrative": "A perfect ambush. You walk away richer, better armed, and slightly more dead inside.", "outcome": "chits,16;components,6" },
      { "roll": 18, "narrative": "You claim the armor’s core bits and extra fuel cells. Your pack rattles like a toolbox.", "outcome": "components,8;gas,4;chits,8" },
      { "roll": 19, "narrative": "He never even sees you. You end it, loot it, and eat while the body cools.", "outcome": "chits,20;components,8;food,4" },
      { "roll": 20, "narrative": "Critical Success! One shot threads the gap in his plating. You salvage pristine tech and a fat roll of chits, feeling briefly like the apocalypse is afraid of you.", "outcome": "components,14;chits,20;gas,4" }
    ]
  },
  {
    "spritelabel": "battle2-3",
    "entries": [
      { "roll": 1, "narrative": "Critical Failure! The giant irradiated crab slams you down and punctures your pack. Green bile soaks everything while you crawl away, wheezing.", "outcome": "water,-6;food,-4;components,-4" },
      { "roll": 2, "narrative": "A claw catches your leg and drags you across gravel. You get free, but leave supplies behind like an offering.", "outcome": "food,-4;water,-2" },
      { "roll": 3, "narrative": "It charges, armor creaking. You retreat fast, dropping valuables to keep it interested in anything but you.", "outcome": "chits,-8" },
      { "roll": 4, "narrative": "Your blade skitters off its shell. You bail out, nursing bruises and a leaking canteen.", "outcome": "water,-4" },
      { "roll": 5, "narrative": "It crushes a fuel tin underfoot. You swear inventively and flee.", "outcome": "gas,-4" },
      { "roll": 6, "narrative": "You scare it with fire, but burn precious fuel doing it.", "outcome": "gas,-2" },
      { "roll": 7, "narrative": "The crab pins you in a panic. You throw a handful of chits to distract it with shiny nonsense.", "outcome": "chits,-4" },
      { "roll": 8, "narrative": "You slip away, but its stench makes you gag and waste water rinsing your mouth.", "outcome": "water,-2" },
      { "roll": 9, "narrative": "It clicks and watches you go. You don’t get hurt, but the fear makes you snack early.", "outcome": "food,-2" },
      { "roll": 10, "narrative": "You detour around the puddled lair and keep walking.", "outcome": "" },
      { "roll": 11, "narrative": "You jab the softer joints and peel off a chunk of shell before retreating, pocketing it like trophy scrap.", "outcome": "components,2" },
      { "roll": 12, "narrative": "You topple it onto its back. Under the shell, salvage and edible bits hide from the sun.", "outcome": "food,4;components,2" },
      { "roll": 13, "narrative": "The crab dies with a hiss. You harvest meat and a few intact metal fittings fused to its carapace.", "outcome": "food,4;components,4" },
      { "roll": 14, "narrative": "You crack it open like a nightmare picnic. The meat is grim but filling; the shell yields useful plates.", "outcome": "food,6;components,4" },
      { "roll": 15, "narrative": "You butcher efficiently and find swallowed chits glittering in sludge.", "outcome": "food,6;chits,8" },
      { "roll": 16, "narrative": "A clean kill. You take shell plating, glands, and a surprisingly intact canteen from its nest.", "outcome": "components,6;food,6;water,2" },
      { "roll": 17, "narrative": "You leave with a pack full of crab and scrap. The smell will announce you for kilometres.", "outcome": "food,8;components,6" },
      { "roll": 18, "narrative": "You find a hidden cache near the lair, like the crab was guarding treasure by accident.", "outcome": "chits,12;components,6;food,6" },
      { "roll": 19, "narrative": "You take everything: meat, shell plates, and a little fuel canister wedged in the muck.", "outcome": "food,10;components,8;gas,4" },
      { "roll": 20, "narrative": "Critical Success! You drop it instantly and harvest premium shell plating and heaps of meat. You walk away stinking, fed, and rich enough to be hated.", "outcome": "food,14;components,10;chits,12" }
    ]
  },
  {
    "spritelabel": "battle2-4",
    "entries": [
      { "roll": 1, "narrative": "Critical Failure! The swamp-draped figure rises from the muck and pulls you under with vine-wrapped hands. You surface coughing sludge, gear gone, dignity dissolved.", "outcome": "water,-6;food,-4;chits,-8" },
      { "roll": 2, "narrative": "Mushroom spores burst in your face. You stumble blind, dropping supplies while laughing turns into choking.", "outcome": "food,-4;components,-2" },
      { "roll": 3, "narrative": "The bog-witch croaks something personal, like it knows your regrets. You run, but lose valuables to the sucking mud.", "outcome": "chits,-8" },
      { "roll": 4, "narrative": "A vine snatches your pack and tears it open. You escape, lighter and furious.", "outcome": "food,-2;water,-2" },
      { "roll": 5, "narrative": "You burn it back with flame. The swamp drinks the fire; your fuel doesn’t come back.", "outcome": "gas,-4" },
      { "roll": 6, "narrative": "The air reeks of rot and chemicals. You waste water washing your mouth and eyes.", "outcome": "water,-2;chits,-4" },
      { "roll": 7, "narrative": "It offers a ‘blessing’ and you pay to refuse. The apocalypse charges extra for boundaries.", "outcome": "chits,-4" },
      { "roll": 8, "narrative": "You retreat carefully, but the marsh steals a ration pouch with a soft gulp.", "outcome": "food,-2" },
      { "roll": 9, "narrative": "The figure sinks back, watching. You keep moving, sipping nervously.", "outcome": "water,-2" },
      { "roll": 10, "narrative": "You keep to dry ground and the swamp stays quiet.", "outcome": "" },
      { "roll": 11, "narrative": "You spot a charm tangled in reeds and snatch it before the vines notice.", "outcome": "components,2;chits,4" },
      { "roll": 12, "narrative": "You cut away fungal growths and bottle the resin. It’s disgusting; traders love disgusting.", "outcome": "components,4;chits,4" },
      { "roll": 13, "narrative": "The bog-witch retreats into its stump-body. You raid the lair for stored supplies.", "outcome": "food,4;water,2" },
      { "roll": 14, "narrative": "You torch the vine-mass and sift the ashes for salvageable trinkets and wiring.", "outcome": "components,6;chits,8" },
      { "roll": 15, "narrative": "You harvest medicinal fungus and clean water from a hidden seep, laughing at the irony.", "outcome": "water,6;food,2" },
      { "roll": 16, "narrative": "You outplay it with bait and patience. The swamp yields a cache wrapped in oilcloth.", "outcome": "chits,12;components,4;food,2" },
      { "roll": 17, "narrative": "You raid the lair thoroughly. The place is a hoarder’s nightmare, so naturally it’s profitable.", "outcome": "chits,16;water,4;components,4" },
      { "roll": 18, "narrative": "You find a sealed canister and intact circuitry half-buried in peat. The bog tried to keep it; you disagree.", "outcome": "components,8;chits,12;gas,2" },
      { "roll": 19, "narrative": "You leave with clean water, rare parts, and a smug sense the swamp lost for once.", "outcome": "water,8;components,8;chits,8" },
      { "roll": 20, "narrative": "Critical Success! You turn the bog-witch into compost and walk off with pristine salvage and drinkable water, like you just robbed a haunted pantry.", "outcome": "water,14;components,10;chits,12" }
    ]
  },
  {
    "spritelabel": "battle2-5",
    "entries": [
      { "roll": 1, "narrative": "Critical Failure! The spear-and-rifle raider pins you with disciplined violence. One thrust, one shot; your pack becomes their bonus.", "outcome": "chits,-12;food,-4;water,-4" },
      { "roll": 2, "narrative": "You rush; they counter. You limp away, leaving a pouch of chits as payment for not dying.", "outcome": "chits,-8;water,-2" },
      { "roll": 3, "narrative": "They carve a line across your gear straps. Supplies spill; you choose breathing over shopping.", "outcome": "food,-4" },
      { "roll": 4, "narrative": "A rifle butt to the jaw. You retreat tasting blood and regret.", "outcome": "water,-4" },
      { "roll": 5, "narrative": "You burn fuel making distance while they mock your cardio.", "outcome": "gas,-4" },
      { "roll": 6, "narrative": "You escape through rubble, but drop components with a sad metallic clink.", "outcome": "components,-2" },
      { "roll": 7, "narrative": "They demand a ‘toll’. You pay the toll. The wasteland applauds your survival instincts.", "outcome": "chits,-4" },
      { "roll": 8, "narrative": "You retreat, tossing a ration to keep them busy chewing instead of stabbing.", "outcome": "food,-2" },
      { "roll": 9, "narrative": "You back away, careful. You still drink from nerves.", "outcome": "water,-2" },
      { "roll": 10, "narrative": "You never cross their patrol line. Nothing happens; you keep moving.", "outcome": "" },
      { "roll": 11, "narrative": "You disarm the spear briefly and snatch a trinket pouch before they recover.", "outcome": "chits,4" },
      { "roll": 12, "narrative": "A clean shot drops them. You loot ammo, spare parts, and a little water.", "outcome": "components,2;chits,4;water,2" },
      { "roll": 13, "narrative": "You win the duel. Their armor yields salvage, their pockets yield optimism.", "outcome": "components,4;chits,8" },
      { "roll": 14, "narrative": "You take them apart efficiently and claim their neatly packed supplies.", "outcome": "food,4;chits,8;components,2" },
      { "roll": 15, "narrative": "You loot a fuel flask and spare fittings from their kit. Stylish violence finally pays.", "outcome": "gas,4;components,4;chits,4" },
      { "roll": 16, "narrative": "You end it fast, then strip gear with professional coldness.", "outcome": "chits,12;components,6" },
      { "roll": 17, "narrative": "You take everything and leave them posed like a warning sign with better fashion sense than you.", "outcome": "chits,16;components,6;food,2" },
      { "roll": 18, "narrative": "You find a hidden stash marker on their map and follow it to extra supplies.", "outcome": "chits,12;food,6;water,4" },
      { "roll": 19, "narrative": "You walk away with their weapon parts and a thick roll of chits. The road feels briefly respectful.", "outcome": "chits,20;components,8;gas,2" },
      { "roll": 20, "narrative": "Critical Success! You outclass them completely; one flawless move. You loot premium gear and enough chits to buy silence and clean water.", "outcome": "chits,28;components,10;water,4" }
    ]
  },
  {
    "spritelabel": "battle2-6",
    "entries": [
      { "roll": 1, "narrative": "Critical Failure! The pack beast charges and tramples you while the handler calmly takes your supplies. You wake up tasting dirt and loss.", "outcome": "food,-6;water,-4;chits,-8" },
      { "roll": 2, "narrative": "The tusked mule-bear slams you aside. The handler ‘helps’ by looting you first.", "outcome": "chits,-8;food,-2" },
      { "roll": 3, "narrative": "You spook the beast and it bolts through your camp, crushing containers and leaving you poorer.", "outcome": "water,-4" },
      { "roll": 4, "narrative": "The handler threatens; you back off, dropping a ration as apology for existing nearby.", "outcome": "food,-4" },
      { "roll": 5, "narrative": "You sprint and burn fuel to escape the charging animal.", "outcome": "gas,-4" },
      { "roll": 6, "narrative": "You avoid the beast, but lose components when your pack strap snaps.", "outcome": "components,-2" },
      { "roll": 7, "narrative": "The handler demands a toll for ‘road safety’. You pay for the privilege of leaving.", "outcome": "chits,-4" },
      { "roll": 8, "narrative": "You toss food to distract the animal. It chomps happily; you do not.", "outcome": "food,-2" },
      { "roll": 9, "narrative": "You retreat slowly, keeping eye contact with a creature that could fold you into art.", "outcome": "water,-2" },
      { "roll": 10, "narrative": "You give the caravan a wide berth and keep walking.", "outcome": "" },
      { "roll": 11, "narrative": "You calm the beast long enough to barter a small bundle of supplies.", "outcome": "food,2;water,2" },
      { "roll": 12, "narrative": "You help fix a strap and the handler pays you in chits and a canteen refill.", "outcome": "chits,8;water,2" },
      { "roll": 13, "narrative": "The handler trades fairly for once. You walk away with extra rations.", "outcome": "food,4;chits,4" },
      { "roll": 14, "narrative": "You spot a dropped pouch under the beast’s packs and pocket it while ‘helping’.", "outcome": "chits,8;components,2" },
      { "roll": 15, "narrative": "A quick repair job earns you fuel and spare parts. Honest work feels suspiciously illegal.", "outcome": "gas,4;components,4" },
      { "roll": 16, "narrative": "You win a tense standoff and claim supplies the handler can’t carry anymore.", "outcome": "food,6;water,4" },
      { "roll": 17, "narrative": "You outsmart both beast and handler, leaving with a tidy haul and no new bruises.", "outcome": "chits,16;food,4;components,2" },
      { "roll": 18, "narrative": "You find their hidden cache marker scratched on a crate. You ‘interpret’ it into your backpack.", "outcome": "chits,12;food,6;water,4" },
      { "roll": 19, "narrative": "The beast goes down and the handler flees. You loot the packs like a saint of theft.", "outcome": "food,10;water,6;chits,12" },
      { "roll": 20, "narrative": "Critical Success! You take control of the pack beast, strip the load, and walk away overloaded and grinning like a villain with manners.", "outcome": "food,14;water,8;chits,12" }
    ]
  },
  {
    "spritelabel": "battle2-7",
    "entries": [
      { "roll": 1, "narrative": "Critical Failure! The trio of goblin-like raiders dogpile you, stabbing between laughs. You crawl away lighter, bleeding, and newly allergic to teamwork.", "outcome": "chits,-12;food,-4;water,-4" },
      { "roll": 2, "narrative": "They surround you and take turns being cruel. You escape, but they keep a ‘souvenir’ from your pack.", "outcome": "chits,-8;components,-2" },
      { "roll": 3, "narrative": "A club cracks your gear case. You run while they squabble over what fell out.", "outcome": "components,-4" },
      { "roll": 4, "narrative": "You trade blows and lose supplies in the chaos.", "outcome": "food,-4" },
      { "roll": 5, "narrative": "You burn fuel to outrun them, listening to their shrieking insults fade behind you.", "outcome": "gas,-4" },
      { "roll": 6, "narrative": "They don’t catch you, but a thrown blade punctures your water container.", "outcome": "water,-4" },
      { "roll": 7, "narrative": "They demand a toll and you pay it, because bravery is expensive and you’re broke.", "outcome": "chits,-4" },
      { "roll": 8, "narrative": "You toss food to distract them. They fight over it like feral accountants.", "outcome": "food,-2" },
      { "roll": 9, "narrative": "You slip away, but stress makes you drink early.", "outcome": "water,-2" },
      { "roll": 10, "narrative": "You avoid their ambush site and continue on.", "outcome": "" },
      { "roll": 11, "narrative": "You catch one alone and take a small pouch before the others notice.", "outcome": "chits,4" },
      { "roll": 12, "narrative": "You scatter them with noise and a sharp blade, collecting dropped junk as they flee.", "outcome": "components,4" },
      { "roll": 13, "narrative": "You win the skirmish and loot their crude weapons for parts and petty cash.", "outcome": "components,4;chits,8" },
      { "roll": 14, "narrative": "You leave two unconscious and one running. Their satchel yields rations and water.", "outcome": "food,4;water,2;chits,4" },
      { "roll": 15, "narrative": "You turn their trap against them. The road provides a rare moment of justice.", "outcome": "chits,12;components,4" },
      { "roll": 16, "narrative": "You wipe them out and strip everything useful, ignoring the smell of cheap liquor and worse choices.", "outcome": "chits,12;components,6;food,2" },
      { "roll": 17, "narrative": "Their stash is nearby, poorly hidden, proudly stupid. You take it all.", "outcome": "chits,16;food,4;water,2" },
      { "roll": 18, "narrative": "You find a fuel tin in their hoard. Even goblins understand gasoline worship.", "outcome": "gas,6;chits,12;components,4" },
      { "roll": 19, "narrative": "You loot their camp thoroughly, leaving nothing but bad memories and worse graffiti.", "outcome": "chits,20;food,6;components,6" },
      { "roll": 20, "narrative": "Critical Success! You dismantle the gang flawlessly and claim their entire stash. You walk away richer, fed, and morally unchanged.", "outcome": "chits,28;food,8;components,6" }
    ]
  },
  {
    "spritelabel": "battle2-8",
    "entries": [
      { "roll": 1, "narrative": "Critical Failure! The lone goblin raider gets lucky and guts you with a jagged blade. You stagger away, leaving supplies behind in a panic trail.", "outcome": "food,-6;water,-4;chits,-8" },
      { "roll": 2, "narrative": "It bites, scratches, and laughs. You win your life by losing your pack.", "outcome": "components,-4;chits,-4" },
      { "roll": 3, "narrative": "A cheap shot knocks your rations loose. The raider snatches them and scampers off.", "outcome": "food,-4" },
      { "roll": 4, "narrative": "You chase it, trip, and smash your canteen. The wasteland finds this hilarious.", "outcome": "water,-4" },
      { "roll": 5, "narrative": "You burn fuel sprinting away from something half your size. Humility costs petrol.", "outcome": "gas,-4" },
      { "roll": 6, "narrative": "It flees but not before stealing a small component pouch.", "outcome": "components,-2" },
      { "roll": 7, "narrative": "It demands chits with a knife it barely understands. You pay anyway.", "outcome": "chits,-4" },
      { "roll": 8, "narrative": "You throw food; it stops to eat, letting you escape.", "outcome": "food,-2" },
      { "roll": 9, "narrative": "You back off. The stress makes you drink more than you should.", "outcome": "water,-2" },
      { "roll": 10, "narrative": "You ignore it and keep walking. It loses interest.", "outcome": "" },
      { "roll": 11, "narrative": "You clip it and it drops a pouch while running, your prize for mild violence.", "outcome": "chits,4" },
      { "roll": 12, "narrative": "You knock it down and take its scavenged parts and a ration bar.", "outcome": "components,2;food,2" },
      { "roll": 13, "narrative": "You win clean. Its pockets are pathetic, but profit is profit.", "outcome": "chits,8;components,2" },
      { "roll": 14, "narrative": "You shake down its hiding spot and find extra food and a little water.", "outcome": "food,4;water,2" },
      { "roll": 15, "narrative": "You raid its stash: crude parts, small fuel tin, and stolen chits.", "outcome": "chits,8;components,4;gas,2" },
      { "roll": 16, "narrative": "You scare it into revealing its cache. It cries; you don’t.", "outcome": "chits,12;food,4" },
      { "roll": 17, "narrative": "You take everything it stole from others. The redistribution feels… mostly criminal.", "outcome": "chits,16;food,4;components,4" },
      { "roll": 18, "narrative": "You find a hidden water jug and intact circuitry in its burrow.", "outcome": "water,6;components,6;chits,8" },
      { "roll": 19, "narrative": "You strip the burrow bare and leave it with nothing but spite.", "outcome": "chits,20;food,6;water,4" },
      { "roll": 20, "narrative": "Critical Success! You catch it instantly and recover a surprisingly fat stash. You walk away with supplies and the warm glow of justified theft.", "outcome": "chits,28;food,6;components,4" }
    ]
  },
  {
    "spritelabel": "battle2-9",
    "entries": [
      { "roll": 1, "narrative": "Critical Failure! The syringe-wielding mutant jabs you with something glowing. Your veins feel on fire; you stumble away, dropping supplies while laughing turns to screaming.", "outcome": "water,-6;food,-4;components,-4" },
      { "roll": 2, "narrative": "He smacks you with the injector staff and steals your chits while you’re seeing double.", "outcome": "chits,-12;water,-2" },
      { "roll": 3, "narrative": "A needle grazes you. You retreat nauseous, losing rations mid-panic.", "outcome": "food,-4" },
      { "roll": 4, "narrative": "You avoid the jab but he shreds your gear straps. Supplies spill into the dirt.", "outcome": "components,-4" },
      { "roll": 5, "narrative": "You flee, burning fuel, as he lumbers after you giggling like a broken medical textbook.", "outcome": "gas,-4" },
      { "roll": 6, "narrative": "You drive him off with fire, wasting fuel and still feeling contaminated.", "outcome": "gas,-2;water,-2" },
      { "roll": 7, "narrative": "He demands ‘payment for treatment’. You pay to not receive treatment.", "outcome": "chits,-4" },
      { "roll": 8, "narrative": "You toss food to distract him. He eats like a trash compactor with feelings.", "outcome": "food,-2" },
      { "roll": 9, "narrative": "You back away slow. You rinse your hands compulsively with precious water.", "outcome": "water,-2" },
      { "roll": 10, "narrative": "You avoid the clinic-from-hell and keep moving.", "outcome": "" },
      { "roll": 11, "narrative": "You knock the injector loose and snatch a vial case before retreating.", "outcome": "components,2;chits,4" },
      { "roll": 12, "narrative": "You drop him hard and salvage intact syringes and tubing for tech upgrades.", "outcome": "components,4" },
      { "roll": 13, "narrative": "You win and find chits in a belt pouch labelled with crude medical jokes.", "outcome": "chits,8;components,4" },
      { "roll": 14, "narrative": "You loot his satchel: preserved water, strange chems, and reusable fittings.", "outcome": "water,4;components,4;chits,4" },
      { "roll": 15, "narrative": "You strip the staff and keep the best parts, trying not to imagine where they’ve been.", "outcome": "components,6;chits,8" },
      { "roll": 16, "narrative": "You find a fuel tin among his ‘supplies’. Even monsters hoard petrol.", "outcome": "gas,4;components,6;chits,4" },
      { "roll": 17, "narrative": "You take everything useful and leave him face-down in dust like a cancelled appointment.", "outcome": "components,8;chits,12" },
      { "roll": 18, "narrative": "His stash includes clean water and sealed components. You almost forgive the nightmare.", "outcome": "water,6;components,8;chits,8" },
      { "roll": 19, "narrative": "You loot like a grim pharmacist, walking away rich in parts and supplies.", "outcome": "components,10;chits,16;water,4" },
      { "roll": 20, "narrative": "Critical Success! You end him instantly and claim a pristine cache of tech-grade tubing, sealed vials, and chits. The wasteland’s worst doctor finally pays out.", "outcome": "components,14;chits,20;water,4" }
    ]
  },
  {
    "spritelabel": "battle2-10",
    "entries": [
      { "roll": 1, "narrative": "Critical Failure! The mutant wasp sinks its stinger in. You thrash, drop supplies, and stagger away swelling like a bad joke.", "outcome": "water,-4;food,-4;chits,-4" },
      { "roll": 2, "narrative": "It tags you twice. You flee, wasting water rinsing venom and panic off your skin.", "outcome": "water,-4;food,-2" },
      { "roll": 3, "narrative": "You swat wrong and it bites your hand. You drop a pouch and watch it vanish into dust.", "outcome": "chits,-8" },
      { "roll": 4, "narrative": "You crush it but spill your water in the scramble, like the apocalypse is petty.", "outcome": "water,-4" },
      { "roll": 5, "narrative": "You torch it and burn fuel for a bug that should’ve died to a shoe.", "outcome": "gas,-4" },
      { "roll": 6, "narrative": "You escape, but it punctures a ration pack mid-flight.", "outcome": "food,-2" },
      { "roll": 7, "narrative": "You flail and lose a small component in the dirt while the wasp laughs in buzz.", "outcome": "components,-2" },
      { "roll": 8, "narrative": "You back off and it follows, so you throw food as tribute to insect gods.", "outcome": "food,-2" },
      { "roll": 9, "narrative": "You hurry away, sweating, drinking more than you planned.", "outcome": "water,-2" },
      { "roll": 10, "narrative": "You avoid the buzzing patch and keep walking.", "outcome": "" },
      { "roll": 11, "narrative": "You kill it and salvage a small venom sac; gross, but useful.", "outcome": "components,2" },
      { "roll": 12, "narrative": "You crush it cleanly and collect a couple of intact bits for barter.", "outcome": "components,2;chits,4" },
      { "roll": 13, "narrative": "You find a tiny nest cache nearby, including water and a few chits.", "outcome": "water,2;chits,8" },
      { "roll": 14, "narrative": "You harvest multiple sacs and a ration bundle from the nest’s leftovers.", "outcome": "components,4;food,2;chits,4" },
      { "roll": 15, "narrative": "You smoke out the nest and pocket valuables other victims ‘donated’.", "outcome": "chits,12;components,4" },
      { "roll": 16, "narrative": "You bottle venom and find a sealed canteen in the debris pile.", "outcome": "components,6;water,4" },
      { "roll": 17, "narrative": "You strip the nest thoroughly. It’s disgusting; it’s profitable.", "outcome": "components,6;chits,12;food,2" },
      { "roll": 18, "narrative": "You find a small fuel tin in a dead traveler’s pack at the nest edge.", "outcome": "gas,4;chits,8;components,4" },
      { "roll": 19, "narrative": "You leave with venom, salvage, and a surprising amount of stolen chits.", "outcome": "components,8;chits,16" },
      { "roll": 20, "narrative": "Critical Success! You crush it instantly and raid the nest without a sting. You walk away with prime venom sacs and easy profit.", "outcome": "components,14;chits,12;water,2" }
    ]
  },
  {
    "spritelabel": "battle2-11",
    "entries": [
      { "roll": 1, "narrative": "Critical Failure! The larger blood-dripping wasp drives its stinger deep. You stumble away, leaving supplies as it drinks like a flying syringe.", "outcome": "water,-6;food,-4;chits,-4" },
      { "roll": 2, "narrative": "It tears into you mid-run. You escape, but your pack is shredded and lighter.", "outcome": "food,-4;water,-2" },
      { "roll": 3, "narrative": "You swat; it dodges; it stings. You drop chits while clawing at swelling skin.", "outcome": "chits,-8;water,-2" },
      { "roll": 4, "narrative": "You kill it messily and waste water cleaning the gore off your hands.", "outcome": "water,-4" },
      { "roll": 5, "narrative": "You burn fuel and nerves chasing it off. It’s still not fair.", "outcome": "gas,-4" },
      { "roll": 6, "narrative": "It punctures your ration pack and buzzes away, pleased with itself.", "outcome": "food,-2;water,-2" },
      { "roll": 7, "narrative": "You lose a component pouch while flailing at the air like an idiot in armor.", "outcome": "components,-2" },
      { "roll": 8, "narrative": "You throw food to distract it. The wasp chooses the food and you live, somehow.", "outcome": "food,-2" },
      { "roll": 9, "narrative": "You retreat, gulping water to calm down. The bug wins emotionally.", "outcome": "water,-2" },
      { "roll": 10, "narrative": "You avoid the buzzing shadow and keep walking.", "outcome": "" },
      { "roll": 11, "narrative": "You kill it and salvage a venom sac, trying not to think about the dripping blood.", "outcome": "components,2;chits,4" },
      { "roll": 12, "narrative": "You pin it and harvest intact glands and chitin shards.", "outcome": "components,4" },
      { "roll": 13, "narrative": "You find a small nest stash: stolen chits and a half-full canteen.", "outcome": "chits,8;water,2" },
      { "roll": 14, "narrative": "You harvest multiple sacs and salvage from nearby carcasses the wasp forgot to finish.", "outcome": "components,4;chits,8;food,2" },
      { "roll": 15, "narrative": "You smoke the nest and collect valuables, feeling like a mugger with better reasons.", "outcome": "chits,12;components,4" },
      { "roll": 16, "narrative": "You bottle venom and recover clean water hidden in a sealed jug.", "outcome": "components,6;water,4" },
      { "roll": 17, "narrative": "You strip the nest and walk away with supplies that smell faintly of fear.", "outcome": "chits,12;components,6;food,2" },
      { "roll": 18, "narrative": "You uncover a fuel tin in the debris. The nest was hoarding like a tiny refinery.", "outcome": "gas,6;chits,8;components,4" },
      { "roll": 19, "narrative": "You leave richer than you should be after fighting a bug.", "outcome": "chits,16;components,8;water,2" },
      { "roll": 20, "narrative": "Critical Success! You kill it without a sting and raid the nest clean. Venom sacs, chits, and water; the apocalypse briefly feels like a fair trade.", "outcome": "components,14;chits,16;water,4" }
    ]
  },
  {
    "spritelabel": "battle2-12",
    "entries": [
      { "roll": 1, "narrative": "Critical Failure! The hazmat sprayer drenches you in glowing sludge from the RAD barrel. Your supplies dissolve while you cough neon-green regret.", "outcome": "water,-6;food,-4;components,-4" },
      { "roll": 2, "narrative": "You approach and get hosed. You flee, dropping chits and rinsing your skin with precious water.", "outcome": "chits,-8;water,-4" },
      { "roll": 3, "narrative": "The nozzle blast knocks your pack open. You recover your life, not your supplies.", "outcome": "food,-4;components,-2" },
      { "roll": 4, "narrative": "You fight through chemical spray and lose water to panic-cleaning.", "outcome": "water,-4" },
      { "roll": 5, "narrative": "You torch the spill to stop it spreading. The fire works; your fuel doesn’t.", "outcome": "gas,-4" },
      { "roll": 6, "narrative": "You retreat coughing. A container cracks; rations soak in toxic mist.", "outcome": "food,-2;chits,-4" },
      { "roll": 7, "narrative": "The cleaner demands a ‘decontamination fee’. You pay to be ignored.", "outcome": "chits,-4" },
      { "roll": 8, "narrative": "You toss food to distract them while you slip away, because you have standards and they don’t.", "outcome": "food,-2" },
      { "roll": 9, "narrative": "You avoid the spray, but waste water washing your hands anyway.", "outcome": "water,-2" },
      { "roll": 10, "narrative": "You take the long route around the glowing barrel and move on.", "outcome": "" },
      { "roll": 11, "narrative": "You snag a sealed filter cartridge off their kit while they’re distracted by the spill.", "outcome": "components,2" },
      { "roll": 12, "narrative": "You help stabilize the barrel and get paid in chits and a clean refill.", "outcome": "chits,8;water,2" },
      { "roll": 13, "narrative": "You trade for spare tubing and fittings. The hazmat worker is rude; the parts are good.", "outcome": "components,4;chits,4" },
      { "roll": 14, "narrative": "You secure the area and collect salvageable valves and sealed containers.", "outcome": "components,6;water,2" },
      { "roll": 15, "narrative": "You skim usable fuel and parts from abandoned equipment near the RAD drum.", "outcome": "gas,4;components,4;chits,4" },
      { "roll": 16, "narrative": "You take control of the situation and loot a hidden maintenance cache.", "outcome": "components,6;chits,12;water,2" },
      { "roll": 17, "narrative": "You find sealed rations and clean water stashed for ‘emergencies’. You declare this an emergency.", "outcome": "food,6;water,4;chits,8" },
      { "roll": 18, "narrative": "You recover high-grade components and a fuel canister from the cleanup rig.", "outcome": "components,8;gas,4;chits,8" },
      { "roll": 19, "narrative": "You walk away with premium filters, chits, and supplies that actually aren’t poisoned. Rare luxury.", "outcome": "components,10;chits,16;water,4" },
      { "roll": 20, "narrative": "Critical Success! You secure the RAD barrel, loot a pristine maintenance cache, and leave richer with clean water and top-tier parts. The glow stays behind; you don’t.", "outcome": "components,14;water,6;chits,16" }
    ]
  },
  {
    "spritelabel": "battle2-13",
    "entries": [
      { "roll": 1, "narrative": "Critical Failure! The sandworm erupts and swallows half your camp in one wet gulp. You escape, but your supplies vanish into a screaming throat.", "outcome": "food,-6;water,-6;chits,-4" },
      { "roll": 2, "narrative": "The worm’s mouth yawns open and you scramble away, losing gear to the collapsing sand.", "outcome": "water,-4;food,-2" },
      { "roll": 3, "narrative": "It drags your pack into the pit with suction and grit. You keep your life; it keeps your stuff.", "outcome": "components,-4" },
      { "roll": 4, "narrative": "A tremor knocks your canteen loose. You watch it roll into the maw like an offering.", "outcome": "water,-4" },
      { "roll": 5, "narrative": "You burn fuel sprinting over dunes while the ground tries to eat you.", "outcome": "gas,-4" },
      { "roll": 6, "narrative": "You escape, but sand grinds through food packaging. Crunchy rations become worse rations.", "outcome": "food,-2;water,-2" },
      { "roll": 7, "narrative": "You fling chits into the pit to distract it, like the worm understands economics.", "outcome": "chits,-4" },
      { "roll": 8, "narrative": "You throw food to the maw and back away, because bargaining with monsters is a hobby now.", "outcome": "food,-2" },
      { "roll": 9, "narrative": "You retreat, gulping water while your hands shake.", "outcome": "water,-2" },
      { "roll": 10, "narrative": "You spot the disturbed sand and avoid the sinkhole.", "outcome": "" },
      { "roll": 11, "narrative": "You slice off a chitin ring as it retreats and keep it as weird, valuable scrap.", "outcome": "components,2" },
      { "roll": 12, "narrative": "You lure it into a rock shelf collapse. The worm suffers; you harvest tough hide plates.", "outcome": "components,4;food,2" },
      { "roll": 13, "narrative": "You wound it and collect hardened teeth and salvage from the sand around its lair.", "outcome": "components,4;chits,8" },
      { "roll": 14, "narrative": "The worm dies half-exposed. You butcher meat that tastes like fear and dry grit.", "outcome": "food,6;components,4" },
      { "roll": 15, "narrative": "You raid the lair and find swallowed supplies from less lucky travelers.", "outcome": "food,6;water,4;chits,4" },
      { "roll": 16, "narrative": "You harvest rare parts and find a fuel tin wedged in debris, miraculously intact.", "outcome": "components,6;gas,4;chits,4" },
      { "roll": 17, "narrative": "You leave with worm-hide plates and enough food to forget the screaming mouth for a day.", "outcome": "food,8;components,6" },
      { "roll": 18, "narrative": "You uncover a cache in the sand near the lair, like the worm was guarding treasure by mistake.", "outcome": "chits,12;water,6;components,6" },
      { "roll": 19, "narrative": "You harvest and loot until your pack groans. The desert feels briefly defeated.", "outcome": "food,10;components,8;water,4" },
      { "roll": 20, "narrative": "Critical Success! You bait and kill the sandworm cleanly, harvesting premium hide, meat, and a swallowed stash of chits. You walk away like the dunes owe you rent.", "outcome": "components,14;food,10;chits,12" }
    ]
  },
  {
    "spritelabel": "battle2-14",
    "entries": [
      { "roll": 1, "narrative": "Critical Failure! A full swarm engulfs you. Stingers punch through cloth and skin; you run blind, dropping supplies while the air becomes buzzing pain.", "outcome": "water,-6;food,-4;chits,-8" },
      { "roll": 2, "narrative": "You flail and inhale bugs. You escape, but your pack is lighter and your throat feels like sandpaper.", "outcome": "water,-4;food,-2" },
      { "roll": 3, "narrative": "The swarm drives you off a safe path into rubble. You lose chits scrambling.", "outcome": "chits,-8" },
      { "roll": 4, "narrative": "You crush a few and waste water cleaning venom and gore off your hands.", "outcome": "water,-4" },
      { "roll": 5, "narrative": "You torch the swarm with fuel-heavy fire. The bugs die; your petrol dreams die too.", "outcome": "gas,-4" },
      { "roll": 6, "narrative": "You escape, but your rations get punctured and ruined.", "outcome": "food,-4" },
      { "roll": 7, "narrative": "You lose a component pouch while running and swearing at the sky.", "outcome": "components,-2" },
      { "roll": 8, "narrative": "You throw food to distract the swarm at ground level, then sprint like you’re late for your own funeral.", "outcome": "food,-2" },
      { "roll": 9, "narrative": "You retreat, gulping water while the buzzing fades.", "outcome": "water,-2" },
      { "roll": 10, "narrative": "You avoid the buzzing cloud and keep moving.", "outcome": "" },
      { "roll": 11, "narrative": "You kill a few stragglers and collect venom sacs carefully, like a miserable hobbyist.", "outcome": "components,2;chits,4" },
      { "roll": 12, "narrative": "You smoke the swarm out and harvest chitin and glands from the fallen.", "outcome": "components,4" },
      { "roll": 13, "narrative": "You find a nest stash nearby: stolen chits and a sealed jug.", "outcome": "chits,8;water,2" },
      { "roll": 14, "narrative": "You raid the nest edge and recover food from dead travelers who won’t be needing it.", "outcome": "food,4;components,4;chits,4" },
      { "roll": 15, "narrative": "You burn out the swarm and collect valuables, feeling like an accountant of corpses.", "outcome": "chits,12;components,4;water,2" },
      { "roll": 16, "narrative": "You harvest premium venom and find intact parts in the debris pile.", "outcome": "components,6;chits,8" },
      { "roll": 17, "narrative": "You strip the nest thoroughly and leave with a heavy pack and a light conscience, somehow.", "outcome": "components,8;chits,12;food,2" },
      { "roll": 18, "narrative": "You uncover a fuel tin and sealed water among the nest’s stolen goods.", "outcome": "gas,6;water,4;chits,8" },
      { "roll": 19, "narrative": "You walk away with enough salvage to make the buzzing feel worth it.", "outcome": "components,10;chits,16;water,2" },
      { "roll": 20, "narrative": "Critical Success! You annihilate the swarm without a sting and loot the nest clean. Venom sacs, chits, and supplies fall into your hands like the apocalypse apologizing.", "outcome": "components,14;chits,20;food,4" }
    ]
  },
  {
    "spritelabel": "battle2-15",
    "entries": [
      { "roll": 1, "narrative": "Critical Failure! The lone wasp nails you in the neck. You stumble, drop supplies, and run while your vision turns into static.", "outcome": "water,-4;food,-4;chits,-4" },
      { "roll": 2, "narrative": "It stings and you panic. You waste water rinsing venom and lose rations in the scramble.", "outcome": "water,-4;food,-2" },
      { "roll": 3, "narrative": "You swat wrong and lose a chits pouch while flailing like a dying windmill.", "outcome": "chits,-8" },
      { "roll": 4, "narrative": "You kill it but spill your water in the mess.", "outcome": "water,-4" },
      { "roll": 5, "narrative": "You burn fuel to be absolutely sure a bug is dead.", "outcome": "gas,-4" },
      { "roll": 6, "narrative": "It punctures your rations and buzzes off, proud.", "outcome": "food,-2" },
      { "roll": 7, "narrative": "You lose a small component in the dirt while swearing at the air.", "outcome": "components,-2" },
      { "roll": 8, "narrative": "You throw food to distract it and escape, annoyed at your own strategy.", "outcome": "food,-2" },
      { "roll": 9, "narrative": "You retreat and drink nervously.", "outcome": "water,-2" },
      { "roll": 10, "narrative": "You avoid it and keep walking.", "outcome": "" },
      { "roll": 11, "narrative": "You crush it and salvage a venom sac before it leaks everywhere.", "outcome": "components,2" },
      { "roll": 12, "narrative": "You pin it and harvest intact glands for barter.", "outcome": "components,2;chits,4" },
      { "roll": 13, "narrative": "You find a tiny nest cache nearby with a sealed sip of water and some chits.", "outcome": "water,2;chits,8" },
      { "roll": 14, "narrative": "You harvest multiple useful bits and recover a ration bar from the nest edge.", "outcome": "components,4;food,2;chits,4" },
      { "roll": 15, "narrative": "You smoke the nest and collect stolen chits like an unpaid tax collector.", "outcome": "chits,12;components,4" },
      { "roll": 16, "narrative": "You bottle venom carefully and find an intact water pouch among debris.", "outcome": "components,6;water,4" },
      { "roll": 17, "narrative": "You strip the nest clean and walk away richer than a bug deserves to make you.", "outcome": "components,6;chits,12" },
      { "roll": 18, "narrative": "You find a small fuel tin near a dead traveler’s pack at the nest edge.", "outcome": "gas,4;chits,8;components,4" },
      { "roll": 19, "narrative": "You harvest premium venom and pocket a fat roll of stolen chits.", "outcome": "components,8;chits,16;water,2" },
      { "roll": 20, "narrative": "Critical Success! One clean strike; no sting. You loot the nest’s stolen goods and leave with prime venom sacs and easy profit.", "outcome": "components,14;chits,12;water,4" }
    ]
  },
  {
    "spritelabel": "battle2-16",
    "entries": [
      { "roll": 1, "narrative": "Critical Failure! The bubble-helmet astronaut drops you with a clean shot. You crawl away, leaving supplies behind like a surrender flag made of food.", "outcome": "chits,-8;food,-4;water,-4" },
      { "roll": 2, "narrative": "You underestimate the suit’s aim. A warning shot becomes a lesson; you flee and lose chits.", "outcome": "chits,-8;water,-2" },
      { "roll": 3, "narrative": "They herd you with the pistol and take a component pouch ‘for safety’.", "outcome": "components,-4" },
      { "roll": 4, "narrative": "You retreat through rubble and crack your canteen. The suit watches without emotion.", "outcome": "water,-4" },
      { "roll": 5, "narrative": "You sprint and burn fuel escaping someone who looks like they fell out of a museum.", "outcome": "gas,-4" },
      { "roll": 6, "narrative": "You escape but drop rations while diving for cover.", "outcome": "food,-2" },
      { "roll": 7, "narrative": "They demand a toll for ‘airlock passage’. You pay because the gun is real.", "outcome": "chits,-4" },
      { "roll": 8, "narrative": "You throw food as a distraction; they actually stop to eat it, which is worse somehow.", "outcome": "food,-2" },
      { "roll": 9, "narrative": "You back away and drink nervously, staring at the helmet’s blank reflection.", "outcome": "water,-2" },
      { "roll": 10, "narrative": "You take a different route and avoid the encounter entirely.", "outcome": "" },
      { "roll": 11, "narrative": "You catch them slipping and snag a small pouch of chits before disappearing.", "outcome": "chits,4" },
      { "roll": 12, "narrative": "You drop them and salvage suit fittings and sealed tubing.", "outcome": "components,4;chits,4" },
      { "roll": 13, "narrative": "You loot the suit carefully: wiring, seals, and a surprisingly clean canteen.", "outcome": "components,4;water,2;chits,4" },
      { "roll": 14, "narrative": "You recover intact parts and a ration pack stored for ‘missions’. Missions are over.", "outcome": "components,6;food,2;chits,4" },
      { "roll": 15, "narrative": "You find a fuel cell and tech-grade components. The suit was a walking toolbox.", "outcome": "components,6;gas,4;chits,4" },
      { "roll": 16, "narrative": "You strip premium parts and leave with enough salvage to upgrade something that still barely works.", "outcome": "components,8;chits,12" },
      { "roll": 17, "narrative": "You loot sealed water and high-quality parts. The helmet stares empty; you don’t.", "outcome": "water,4;components,8;chits,8" },
      { "roll": 18, "narrative": "You uncover a hidden suit cache: fuel, chits, and pristine fittings.", "outcome": "gas,6;components,8;chits,8" },
      { "roll": 19, "narrative": "You leave with a mountain of tech salvage and enough chits to make enemies curious.", "outcome": "components,10;chits,16;water,2" },
      { "roll": 20, "narrative": "Critical Success! You disable the suit flawlessly and harvest pristine space-grade components and a fat stash of chits. You walk away feeling like you mugged the future.", "outcome": "components,14;chits,20;gas,4" }
    ]
  },
  {
    "spritelabel": "battle2-17",
    "entries": [
      { "roll": 1, "narrative": "Critical Failure! The armored mutant hound tears into you and drags your pack away like prey. You escape bleeding, hearing it crunch your supplies.", "outcome": "food,-6;water,-4;chits,-8" },
      { "roll": 2, "narrative": "It bites and shakes. You limp off, losing rations and water to torn containers.", "outcome": "food,-4;water,-2" },
      { "roll": 3, "narrative": "The beast clamps onto your gear pouch and rips it free. You keep your arm; it keeps your parts.", "outcome": "components,-4" },
      { "roll": 4, "narrative": "You fend it off, but your canteen gets punctured. The desert drinks your future.", "outcome": "water,-4" },
      { "roll": 5, "narrative": "You burn fuel escaping a creature that can run on hate alone.", "outcome": "gas,-4" },
      { "roll": 6, "narrative": "You scare it off with fire. It works; your fuel supply disagrees.", "outcome": "gas,-2" },
      { "roll": 7, "narrative": "It forces you to drop chits as bait. The dog understands economics perfectly.", "outcome": "chits,-4" },
      { "roll": 8, "narrative": "You toss food to distract it and retreat, angry at yourself for negotiating with teeth.", "outcome": "food,-2" },
      { "roll": 9, "narrative": "You back off slowly and drink from nerves.", "outcome": "water,-2" },
      { "roll": 10, "narrative": "You avoid the snarling silhouette and keep moving.", "outcome": "" },
      { "roll": 11, "narrative": "You nick it and it drops a small pouch from its harness while retreating.", "outcome": "chits,4;components,2" },
      { "roll": 12, "narrative": "You bring it down and salvage harness fittings and some edible meat.", "outcome": "components,4;food,2" },
      { "roll": 13, "narrative": "You loot the harness packs: chits and spare parts, plus a half-full water pouch.", "outcome": "chits,8;components,4;water,2" },
      { "roll": 14, "narrative": "You take it down clean and harvest armor plates and meat.", "outcome": "components,6;food,4" },
      { "roll": 15, "narrative": "You find fuel and parts in its pack like it was delivering your loot personally.", "outcome": "gas,4;components,4;chits,4" },
      { "roll": 16, "narrative": "You strip premium harness gear and a stash of chits tucked under plating.", "outcome": "chits,12;components,6;food,2" },
      { "roll": 17, "narrative": "You loot thoroughly and leave with enough supplies to pretend you’re in control.", "outcome": "food,6;water,4;chits,8" },
      { "roll": 18, "narrative": "You find a hidden cache tag on the harness and follow it to extra supplies.", "outcome": "chits,12;food,6;components,6" },
      { "roll": 19, "narrative": "You take everything: meat, armor scrap, and the full contents of the pack.", "outcome": "food,10;components,8;chits,12" },
      { "roll": 20, "narrative": "Critical Success! You drop the armored hound instantly and claim its loaded packs. Food, parts, and chits spill out like a gift from a cruel god.", "outcome": "food,14;components,10;chits,12" }
    ]
  },
  {
    "spritelabel": "battle2-18",
    "entries": [
      { "roll": 1, "narrative": "Critical Failure! The hulking multi-limbed abomination grabs you and squeezes until your ribs argue. You slip free only by leaving supplies behind, drenched in its sizzling slime.", "outcome": "food,-6;water,-6;components,-2" },
      { "roll": 2, "narrative": "It swats you like lint. You crawl away, dropping chits and rations while it laughs in wet gargles.", "outcome": "chits,-8;food,-4" },
      { "roll": 3, "narrative": "You cut it and it barely notices. You retreat, losing components as your pack tears.", "outcome": "components,-4;water,-2" },
      { "roll": 4, "narrative": "A claw rips your canteen. You escape thirsty, furious, and very aware of mortality.", "outcome": "water,-4;chits,-4" },
      { "roll": 5, "narrative": "You burn fuel to escape, listening to its heavy footsteps follow like a bad drumbeat.", "outcome": "gas,-4" },
      { "roll": 6, "narrative": "You drive it back with fire and lose fuel and water cleaning the stink off.", "outcome": "gas,-2;water,-2" },
      { "roll": 7, "narrative": "You pay chits to distract it with shiny junk. It pauses to chew the coins, somehow.", "outcome": "chits,-4" },
      { "roll": 8, "narrative": "You toss food to the monster and retreat. It eats; you live; nothing feels noble.", "outcome": "food,-2" },
      { "roll": 9, "narrative": "You stagger away, drinking water just to stop shaking.", "outcome": "water,-2" },
      { "roll": 10, "narrative": "You spot it early and detour quietly, preserving both life and supplies.", "outcome": "" },
      { "roll": 11, "narrative": "You slice off a glowing growth and pocket it, ignoring the twitching.", "outcome": "components,2;chits,4" },
      { "roll": 12, "narrative": "You wound it badly and harvest hardened nodules and scrap embedded in flesh.", "outcome": "components,4;food,2" },
      { "roll": 13, "narrative": "It collapses with a wet sigh. You salvage rare parts and a stash of chits from its victim pile.", "outcome": "components,4;chits,8;water,2" },
      { "roll": 14, "narrative": "You butcher the abomination with grim efficiency. Meat is edible if you hate yourself enough.", "outcome": "food,6;components,4" },
      { "roll": 15, "narrative": "You loot its lair and find fuel and sealed supplies from other unlucky travelers.", "outcome": "gas,4;chits,8;food,4" },
      { "roll": 16, "narrative": "You harvest premium components from its fused metal and wiring. It’s like killing a scrapyard that screams.", "outcome": "components,8;chits,12" },
      { "roll": 17, "narrative": "You strip everything useful and leave the carcass as a warning and a smell.", "outcome": "components,8;food,6;chits,8" },
      { "roll": 18, "narrative": "You find a hidden cache behind its nest, including clean water and tech-grade parts.", "outcome": "water,6;components,8;chits,8" },
      { "roll": 19, "narrative": "You walk away overloaded, rich, and slightly haunted by what you had to cut.", "outcome": "components,10;chits,16;food,4" },
      { "roll": 20, "narrative": "Critical Success! One decisive strike drops the horror. You harvest pristine salvage and a massive stash of supplies, leaving like the apocalypse just paid you back with interest.", "outcome": "components,14;chits,20;food,6" }
    ]
  },
  {
    "spritelabel": "battle2-19",
    "entries": [
      { "roll": 1, "narrative": "Critical Failure! The pack of feral dogs tears into you from three angles. You escape by shedding supplies like skin, bleeding into the dust.", "outcome": "food,-6;water,-4;chits,-8" },
      { "roll": 2, "narrative": "They chase you down and rip open your pack. You survive, but lose rations and water.", "outcome": "food,-4;water,-2" },
      { "roll": 3, "narrative": "A bite locks onto your gear pouch and yanks it away. The pack celebrates your donation.", "outcome": "components,-4" },
      { "roll": 4, "narrative": "You fend them off, but your canteen cracks in the scramble.", "outcome": "water,-4" },
      { "roll": 5, "narrative": "You burn fuel sprinting from teeth and hunger. The dogs don’t even get tired.", "outcome": "gas,-4" },
      { "roll": 6, "narrative": "You scare them off with fire and waste fuel doing it.", "outcome": "gas,-2;food,-2" },
      { "roll": 7, "narrative": "You throw chits as bait and retreat while they fight over shiny nonsense.", "outcome": "chits,-4" },
      { "roll": 8, "narrative": "You toss food to distract them and slip away, feeling like prey with a budget.", "outcome": "food,-2" },
      { "roll": 9, "narrative": "You retreat and drink nervously once the snarls fade.", "outcome": "water,-2" },
      { "roll": 10, "narrative": "You avoid their territory and keep walking.", "outcome": "" },
      { "roll": 11, "narrative": "You clip one and it drops a stolen pouch. You grab it and vanish.", "outcome": "chits,4;food,2" },
      { "roll": 12, "narrative": "You kill one and the pack scatters. You harvest meat and salvage from collars and harness scraps.", "outcome": "food,4;components,2" },
      { "roll": 13, "narrative": "You break the pack and loot their victim pile: chits, parts, and water.", "outcome": "chits,8;components,4;water,2" },
      { "roll": 14, "narrative": "You win decisively and harvest meat. The smell is awful; the calories are honest.", "outcome": "food,6;chits,4;components,2" },
      { "roll": 15, "narrative": "You find a fuel tin in the debris near their den and take it like fate intended.", "outcome": "gas,4;chits,8;food,2" },
      { "roll": 16, "narrative": "You clear the den and loot supplies from old packs and bones. The dogs were hoarders too.", "outcome": "food,6;water,4;chits,8" },
      { "roll": 17, "narrative": "You strip the den thoroughly: rations, water, and salvageable components from chewed gear.", "outcome": "food,8;components,6;water,2" },
      { "roll": 18, "narrative": "You uncover a hidden stash near the den, like someone tried to hide from dogs and failed.", "outcome": "chits,12;water,6;components,4" },
      { "roll": 19, "narrative": "You walk away with a heavy pack and a lighter conscience than you deserve.", "outcome": "food,10;chits,16;components,6" },
      { "roll": 20, "narrative": "Critical Success! You drop the alpha and the pack collapses into chaos. You claim the den’s supplies and leave fed, stocked, and smug.", "outcome": "food,14;chits,16;components,6" }
    ]
  },
  {
      "spritelabel": "battle1-0",
      "entries": [
        {
          "roll": 1,
          "narrative": "Critical Failure! The armored raider bull-rushes you, his weight slamming you into the dirt. Something cracks. He laughs while rummaging through your pack, taking his payment in pain and supplies before wandering off.",
          "outcome": "chits,-16;food,-6"
        },
        {
          "roll": 2,
          "narrative": "He clips you hard and sends you sprawling. You crawl away, lighter and aching.",
          "outcome": "chits,-12;water,-4"
        },
        {
          "roll": 3,
          "narrative": "Your defense falters. He batters you, then loses interest.",
          "outcome": "food,-4;chits,-8"
        },
        {
          "roll": 4,
          "narrative": "A messy exchange leaves you bruised and missing supplies.",
          "outcome": "water,-4"
        },
        {
          "roll": 5,
          "narrative": "You disengage clumsily, dropping gear in the dust.",
          "outcome": "chits,-8"
        },
        {
          "roll": 6,
          "narrative": "You retreat under pressure, shaken.",
          "outcome": "food,-2"
        },
        {
          "roll": 7,
          "narrative": "He snarls but doesn\u2019t chase far. The stress costs you.",
          "outcome": "water,-2"
        },
        {
          "roll": 8,
          "narrative": "You break contact with minimal losses.",
          "outcome": "chits,-4"
        },
        {
          "roll": 9,
          "narrative": "An ugly standoff ends poorly for your nerves.",
          "outcome": "food,-2"
        },
        {
          "roll": 10,
          "narrative": "You both move on without incident.",
          "outcome": ""
        },
        {
          "roll": 11,
          "narrative": "You land a solid hit and scare him off.",
          "outcome": "chits,4"
        },
        {
          "roll": 12,
          "narrative": "You wound him and loot quickly.",
          "outcome": "chits,8"
        },
        {
          "roll": 13,
          "narrative": "You overpower him and strip useful parts.",
          "outcome": "components,4"
        },
        {
          "roll": 14,
          "narrative": "He falls. You take what you can.",
          "outcome": "chits,12;food,2"
        },
        {
          "roll": 15,
          "narrative": "A clean win leaves you richer.",
          "outcome": "chits,16"
        },
        {
          "roll": 16,
          "narrative": "You salvage armor plating.",
          "outcome": "components,4;gas,2"
        },
        {
          "roll": 17,
          "narrative": "Total domination.",
          "outcome": "chits,20"
        },
        {
          "roll": 18,
          "narrative": "You loot everything valuable.",
          "outcome": "chits,24;food,2"
        },
        {
          "roll": 19,
          "narrative": "You make an example of him.",
          "outcome": "chits,24;components,2"
        },
        {
          "roll": 20,
          "narrative": "Critical Success! You dismantle the raider with ruthless efficiency and walk away loaded with scrap and currency.",
          "outcome": "chits,28;components,4"
        }
      ]
    },
    {
      "spritelabel": "battle1-1",
      "entries": [
        {
          "roll": 1,
          "narrative": "Critical Failure! The rifleman opens fire immediately. Bullets chew the ground around you as one finds flesh. He takes your supplies while you bleed.",
          "outcome": "chits,-16;water,-6"
        },
        {
          "roll": 2,
          "narrative": "Gunfire forces you into cover. You escape wounded and poorer.",
          "outcome": "food,-6;chits,-8"
        },
        {
          "roll": 3,
          "narrative": "A grazing shot spins you around. You flee.",
          "outcome": "water,-4;chits,-4"
        },
        {
          "roll": 4,
          "narrative": "You retreat under suppressive fire.",
          "outcome": "chits,-8"
        },
        {
          "roll": 5,
          "narrative": "A tense withdrawal costs supplies.",
          "outcome": "food,-4"
        },
        {
          "roll": 6,
          "narrative": "You burn fuel escaping.",
          "outcome": "gas,-2"
        },
        {
          "roll": 7,
          "narrative": "You keep your head down and run.",
          "outcome": "water,-2"
        },
        {
          "roll": 8,
          "narrative": "You slip away cautiously.",
          "outcome": "chits,-4"
        },
        {
          "roll": 9,
          "narrative": "Shots ring out but miss. Stress costs you.",
          "outcome": "food,-2"
        },
        {
          "roll": 10,
          "narrative": "You avoid contact entirely.",
          "outcome": ""
        },
        {
          "roll": 11,
          "narrative": "You outmaneuver him and grab dropped ammo and goods.",
          "outcome": "chits,4"
        },
        {
          "roll": 12,
          "narrative": "A quick ambush pays off.",
          "outcome": "chits,8"
        },
        {
          "roll": 13,
          "narrative": "You disable his weapon and scavenge parts.",
          "outcome": "components,4"
        },
        {
          "roll": 14,
          "narrative": "You win decisively.",
          "outcome": "chits,12;food,2"
        },
        {
          "roll": 15,
          "narrative": "The firefight ends in your favor.",
          "outcome": "chits,16"
        },
        {
          "roll": 16,
          "narrative": "You salvage weapon components.",
          "outcome": "components,6"
        },
        {
          "roll": 17,
          "narrative": "A flawless takedown.",
          "outcome": "chits,20"
        },
        {
          "roll": 18,
          "narrative": "You strip his kit completely.",
          "outcome": "chits,24;components,2"
        },
        {
          "roll": 19,
          "narrative": "You walk away well supplied.",
          "outcome": "chits,24;food,4"
        },
        {
          "roll": 20,
          "narrative": "Critical Success! You drop him before he fires a second shot and loot everything of value.",
          "outcome": "chits,28;components,4"
        }
      ]
    },
    {
      "spritelabel": "battle1-2",
      "entries": [
        {
          "roll": 1,
          "narrative": "Critical Failure! The heavy gun roars. You\u2019re thrown back, ears ringing, pack shredded.",
          "outcome": "chits,-20;food,-6"
        },
        {
          "roll": 2,
          "narrative": "Shrapnel tears your gear as you flee.",
          "outcome": "water,-6;chits,-8"
        },
        {
          "roll": 3,
          "narrative": "You barely escape the hail of fire.",
          "outcome": "chits,-8;food,-2"
        },
        {
          "roll": 4,
          "narrative": "Retreat costs precious supplies.",
          "outcome": "gas,-4"
        },
        {
          "roll": 5,
          "narrative": "You abandon gear to survive.",
          "outcome": "chits,-8"
        },
        {
          "roll": 6,
          "narrative": "A panicked escape.",
          "outcome": "water,-2"
        },
        {
          "roll": 7,
          "narrative": "You duck away shaken.",
          "outcome": "food,-2"
        },
        {
          "roll": 8,
          "narrative": "Close call.",
          "outcome": "chits,-4"
        },
        {
          "roll": 9,
          "narrative": "The noise alone rattles you.",
          "outcome": "water,-2"
        },
        {
          "roll": 10,
          "narrative": "You bypass the threat.",
          "outcome": ""
        },
        {
          "roll": 11,
          "narrative": "You flank and force him back.",
          "outcome": "chits,4"
        },
        {
          "roll": 12,
          "narrative": "You disable the weapon.",
          "outcome": "components,4"
        },
        {
          "roll": 13,
          "narrative": "A risky charge pays off.",
          "outcome": "chits,8;components,2"
        },
        {
          "roll": 14,
          "narrative": "You claim the battlefield.",
          "outcome": "chits,12;food,2"
        },
        {
          "roll": 15,
          "narrative": "Victory yields fuel.",
          "outcome": "gas,4;chits,8"
        },
        {
          "roll": 16,
          "narrative": "You harvest heavy components.",
          "outcome": "components,6"
        },
        {
          "roll": 17,
          "narrative": "An overwhelming win.",
          "outcome": "chits,20"
        },
        {
          "roll": 18,
          "narrative": "You loot everything intact.",
          "outcome": "chits,24;components,4"
        },
        {
          "roll": 19,
          "narrative": "Spoils are rich.",
          "outcome": "chits,24;gas,4"
        },
        {
          "roll": 20,
          "narrative": "Critical Success! The gunner never lands a hit. You salvage valuable hardware and walk away triumphant.",
          "outcome": "chits,28;components,6"
        }
      ]
    },
    {
      "spritelabel": "battle1-3",
      "entries": [
        {
          "roll": 1,
          "narrative": "Critical Failure! The soldier moves with precision, disarming and beating you before you can react.",
          "outcome": "chits,-16;water,-6"
        },
        {
          "roll": 2,
          "narrative": "You\u2019re outmatched and retreat injured.",
          "outcome": "food,-6;chits,-8"
        },
        {
          "roll": 3,
          "narrative": "He overwhelms you quickly.",
          "outcome": "chits,-8"
        },
        {
          "roll": 4,
          "narrative": "A rough exchange ends badly.",
          "outcome": "water,-4"
        },
        {
          "roll": 5,
          "narrative": "You pull back under fire.",
          "outcome": "chits,-8"
        },
        {
          "roll": 6,
          "narrative": "Escape costs supplies.",
          "outcome": "food,-2"
        },
        {
          "roll": 7,
          "narrative": "You disengage cautiously.",
          "outcome": "water,-2"
        },
        {
          "roll": 8,
          "narrative": "Barely a loss.",
          "outcome": "chits,-4"
        },
        {
          "roll": 9,
          "narrative": "The tension drains you.",
          "outcome": "food,-2"
        },
        {
          "roll": 10,
          "narrative": "You both pass without incident.",
          "outcome": ""
        },
        {
          "roll": 11,
          "narrative": "You catch him off guard.",
          "outcome": "chits,4"
        },
        {
          "roll": 12,
          "narrative": "A solid victory yields gear.",
          "outcome": "components,4"
        },
        {
          "roll": 13,
          "narrative": "You win and scavenge.",
          "outcome": "chits,8"
        },
        {
          "roll": 14,
          "narrative": "You take him down clean.",
          "outcome": "chits,12;food,2"
        },
        {
          "roll": 15,
          "narrative": "A decisive fight.",
          "outcome": "chits,16"
        },
        {
          "roll": 16,
          "narrative": "You salvage advanced parts.",
          "outcome": "components,6"
        },
        {
          "roll": 17,
          "narrative": "Total control.",
          "outcome": "chits,20"
        },
        {
          "roll": 18,
          "narrative": "You strip the body.",
          "outcome": "chits,24;components,2"
        },
        {
          "roll": 19,
          "narrative": "Rich haul.",
          "outcome": "chits,24;food,4"
        },
        {
          "roll": 20,
          "narrative": "Critical Success! You outfight a trained killer and take everything worth carrying.",
          "outcome": "chits,28;components,4"
        }
      ]
    },
    {
      "spritelabel": "battle1-4",
      "entries": [
        {
          "roll": 1,
          "narrative": "Critical Failure! The scavenger knifes you in close quarters and steals from your pack.",
          "outcome": "chits,-12;food,-6"
        },
        {
          "roll": 2,
          "narrative": "You\u2019re slashed and forced back.",
          "outcome": "water,-4;chits,-4"
        },
        {
          "roll": 3,
          "narrative": "A dirty fight leaves you worse off.",
          "outcome": "food,-4"
        },
        {
          "roll": 4,
          "narrative": "You retreat bleeding.",
          "outcome": "water,-4"
        },
        {
          "roll": 5,
          "narrative": "Supplies spill as you flee.",
          "outcome": "chits,-8"
        },
        {
          "roll": 6,
          "narrative": "You escape barely.",
          "outcome": "food,-2"
        },
        {
          "roll": 7,
          "narrative": "A tense disengage.",
          "outcome": "water,-2"
        },
        {
          "roll": 8,
          "narrative": "Minor losses.",
          "outcome": "chits,-4"
        },
        {
          "roll": 9,
          "narrative": "Your nerves cost you.",
          "outcome": "food,-2"
        },
        {
          "roll": 10,
          "narrative": "You avoid conflict.",
          "outcome": ""
        },
        {
          "roll": 11,
          "narrative": "You scare him off.",
          "outcome": "chits,4"
        },
        {
          "roll": 12,
          "narrative": "You outfight him.",
          "outcome": "chits,8"
        },
        {
          "roll": 13,
          "narrative": "You loot scrap.",
          "outcome": "components,4"
        },
        {
          "roll": 14,
          "narrative": "Clean kill.",
          "outcome": "chits,12;food,2"
        },
        {
          "roll": 15,
          "narrative": "Efficient victory.",
          "outcome": "chits,16"
        },
        {
          "roll": 16,
          "narrative": "You find usable parts.",
          "outcome": "components,6"
        },
        {
          "roll": 17,
          "narrative": "No contest.",
          "outcome": "chits,20"
        },
        {
          "roll": 18,
          "narrative": "You take everything.",
          "outcome": "chits,24;food,2"
        },
        {
          "roll": 19,
          "narrative": "Plenty of salvage.",
          "outcome": "chits,24;components,2"
        },
        {
          "roll": 20,
          "narrative": "Critical Success! You end the fight instantly and profit.",
          "outcome": "chits,28;components,4"
        }
      ]
    },
    {
      "spritelabel": "battle1-5",
      "entries": [
        {
          "roll": 1,
          "narrative": "Critical Failure! The hunched sniper fires from concealment. The shot punches through your pack instead of you. He melts away while you curse and bleed from shrapnel.",
          "outcome": "chits,-16;food,-4"
        },
        {
          "roll": 2,
          "narrative": "A bullet grazes your arm. You flee, leaving supplies behind.",
          "outcome": "water,-4;chits,-8"
        },
        {
          "roll": 3,
          "narrative": "Suppressive fire forces a panicked retreat.",
          "outcome": "chits,-8;food,-2"
        },
        {
          "roll": 4,
          "narrative": "You escape wounded and angry.",
          "outcome": "water,-4"
        },
        {
          "roll": 5,
          "narrative": "You lose track of him but drop gear running.",
          "outcome": "chits,-8"
        },
        {
          "roll": 6,
          "narrative": "A tense withdrawal.",
          "outcome": "food,-2"
        },
        {
          "roll": 7,
          "narrative": "You crawl through dust to escape.",
          "outcome": "water,-2"
        },
        {
          "roll": 8,
          "narrative": "Barely worth calling a fight.",
          "outcome": "chits,-4"
        },
        {
          "roll": 9,
          "narrative": "Your nerves cost you rations.",
          "outcome": "food,-2"
        },
        {
          "roll": 10,
          "narrative": "You never quite cross paths.",
          "outcome": ""
        },
        {
          "roll": 11,
          "narrative": "You flush him from cover and grab his stash.",
          "outcome": "chits,4"
        },
        {
          "roll": 12,
          "narrative": "A quick ambush nets gear.",
          "outcome": "chits,8"
        },
        {
          "roll": 13,
          "narrative": "You salvage optics and parts.",
          "outcome": "components,4"
        },
        {
          "roll": 14,
          "narrative": "You drop him clean.",
          "outcome": "chits,12;food,2"
        },
        {
          "roll": 15,
          "narrative": "Efficient and quiet.",
          "outcome": "chits,16"
        },
        {
          "roll": 16,
          "narrative": "You recover fuel and scrap.",
          "outcome": "components,4;gas,2"
        },
        {
          "roll": 17,
          "narrative": "No witnesses remain.",
          "outcome": "chits,20"
        },
        {
          "roll": 18,
          "narrative": "You take everything useful.",
          "outcome": "chits,24;components,2"
        },
        {
          "roll": 19,
          "narrative": "Rich pickings from a patient killer.",
          "outcome": "chits,24;food,4"
        },
        {
          "roll": 20,
          "narrative": "Critical Success! You counter-snipe flawlessly and loot premium gear.",
          "outcome": "chits,28;components,4"
        }
      ]
    },
    {
      "spritelabel": "battle1-6",
      "entries": [
        {
          "roll": 1,
          "narrative": "Critical Failure! The feral hound clamps onto your leg while its handler laughs. You escape bleeding, missing supplies.",
          "outcome": "food,-8;water,-6"
        },
        {
          "roll": 2,
          "narrative": "The dog tears your pack open before you break free.",
          "outcome": "food,-6;chits,-8"
        },
        {
          "roll": 3,
          "narrative": "You fight both poorly and flee.",
          "outcome": "water,-4;chits,-4"
        },
        {
          "roll": 4,
          "narrative": "The handler whistles it back after damage is done.",
          "outcome": "food,-4"
        },
        {
          "roll": 5,
          "narrative": "You retreat fast.",
          "outcome": "water,-4"
        },
        {
          "roll": 6,
          "narrative": "Barely escape with bites.",
          "outcome": "food,-2"
        },
        {
          "roll": 7,
          "narrative": "You scare the dog off.",
          "outcome": "water,-2"
        },
        {
          "roll": 8,
          "narrative": "A messy disengage.",
          "outcome": "chits,-4"
        },
        {
          "roll": 9,
          "narrative": "Stress eats your rations.",
          "outcome": "food,-2"
        },
        {
          "roll": 10,
          "narrative": "They avoid you.",
          "outcome": ""
        },
        {
          "roll": 11,
          "narrative": "You wound the hound and loot the handler.",
          "outcome": "chits,4"
        },
        {
          "roll": 12,
          "narrative": "The dog goes down.",
          "outcome": "food,4"
        },
        {
          "roll": 13,
          "narrative": "You kill both and scavenge.",
          "outcome": "food,6;chits,8"
        },
        {
          "roll": 14,
          "narrative": "A brutal fight yields meat and gear.",
          "outcome": "food,8;components,4"
        },
        {
          "roll": 15,
          "narrative": "You harvest efficiently.",
          "outcome": "food,10"
        },
        {
          "roll": 16,
          "narrative": "You take gear and meat.",
          "outcome": "food,8;chits,12"
        },
        {
          "roll": 17,
          "narrative": "Clean victory.",
          "outcome": "food,12"
        },
        {
          "roll": 18,
          "narrative": "You strip everything useful.",
          "outcome": "food,12;components,4"
        },
        {
          "roll": 19,
          "narrative": "The wasteland provides.",
          "outcome": "food,12;chits,16"
        },
        {
          "roll": 20,
          "narrative": "Critical Success! You drop them instantly and walk away loaded with meat and loot.",
          "outcome": "food,14;chits,20"
        }
      ]
    },
    {
      "spritelabel": "battle1-7",
      "entries": [
        {
          "roll": 1,
          "narrative": "Critical Failure! The combat robot locks on and unloads. You dive away as explosions shred your pack.",
          "outcome": "components,-10;chits,-16"
        },
        {
          "roll": 2,
          "narrative": "Auto-fire chews terrain and gear.",
          "outcome": "chits,-12;components,-4"
        },
        {
          "roll": 3,
          "narrative": "You retreat under heavy fire.",
          "outcome": "chits,-8;water,-2"
        },
        {
          "roll": 4,
          "narrative": "A near miss rattles you.",
          "outcome": "chits,-8"
        },
        {
          "roll": 5,
          "narrative": "You burn fuel escaping.",
          "outcome": "gas,-4"
        },
        {
          "roll": 6,
          "narrative": "A cautious retreat.",
          "outcome": "water,-2"
        },
        {
          "roll": 7,
          "narrative": "You evade slowly.",
          "outcome": "chits,-4"
        },
        {
          "roll": 8,
          "narrative": "Minimal losses.",
          "outcome": "components,-2"
        },
        {
          "roll": 9,
          "narrative": "The machine watches you go.",
          "outcome": "water,-2"
        },
        {
          "roll": 10,
          "narrative": "You avoid detection.",
          "outcome": ""
        },
        {
          "roll": 11,
          "narrative": "You damage a sensor and grab scrap.",
          "outcome": "components,4"
        },
        {
          "roll": 12,
          "narrative": "You disable an arm.",
          "outcome": "components,6"
        },
        {
          "roll": 13,
          "narrative": "The robot collapses.",
          "outcome": "components,8;chits,8"
        },
        {
          "roll": 14,
          "narrative": "You dismantle it.",
          "outcome": "components,10"
        },
        {
          "roll": 15,
          "narrative": "Salvage jackpot.",
          "outcome": "components,12"
        },
        {
          "roll": 16,
          "narrative": "You find fuel cells.",
          "outcome": "components,12;gas,4"
        },
        {
          "roll": 17,
          "narrative": "Clean dismantling.",
          "outcome": "components,14"
        },
        {
          "roll": 18,
          "narrative": "You strip it completely.",
          "outcome": "components,14;chits,16"
        },
        {
          "roll": 19,
          "narrative": "Rare parts recovered.",
          "outcome": "components,14;chits,20"
        },
        {
          "roll": 20,
          "narrative": "Critical Success! You outthink the machine and harvest premium tech.",
          "outcome": "components,14;chits,24"
        }
      ]
    },
    {
      "spritelabel": "battle1-8",
      "entries": [
        {
          "roll": 1,
          "narrative": "Critical Failure! The jury-rigged tank rolls you down. Treads crush gear while gunners laugh.",
          "outcome": "chits,-20;gas,-6"
        },
        {
          "roll": 2,
          "narrative": "You flee artillery fire.",
          "outcome": "chits,-16;water,-4"
        },
        {
          "roll": 3,
          "narrative": "Explosions force retreat.",
          "outcome": "gas,-4;chits,-8"
        },
        {
          "roll": 4,
          "narrative": "You barely escape.",
          "outcome": "chits,-8"
        },
        {
          "roll": 5,
          "narrative": "Fuel burns fast.",
          "outcome": "gas,-4"
        },
        {
          "roll": 6,
          "narrative": "You disengage shaken.",
          "outcome": "water,-2"
        },
        {
          "roll": 7,
          "narrative": "Close call.",
          "outcome": "chits,-4"
        },
        {
          "roll": 8,
          "narrative": "Minimal damage.",
          "outcome": "gas,-2"
        },
        {
          "roll": 9,
          "narrative": "Fear costs supplies.",
          "outcome": "food,-2"
        },
        {
          "roll": 10,
          "narrative": "You stay hidden.",
          "outcome": ""
        },
        {
          "roll": 11,
          "narrative": "You ambush stragglers.",
          "outcome": "chits,4"
        },
        {
          "roll": 12,
          "narrative": "You disable a tread.",
          "outcome": "components,6"
        },
        {
          "roll": 13,
          "narrative": "The crew bails.",
          "outcome": "chits,12;components,4"
        },
        {
          "roll": 14,
          "narrative": "You loot the wreck.",
          "outcome": "components,8;gas,4"
        },
        {
          "roll": 15,
          "narrative": "A rare haul.",
          "outcome": "gas,8;components,8"
        },
        {
          "roll": 16,
          "narrative": "Fuel and scrap recovered.",
          "outcome": "gas,10;components,8"
        },
        {
          "roll": 17,
          "narrative": "Total victory.",
          "outcome": "gas,12;chits,16"
        },
        {
          "roll": 18,
          "narrative": "You strip everything.",
          "outcome": "gas,12;components,10"
        },
        {
          "roll": 19,
          "narrative": "Legendary score.",
          "outcome": "gas,14;components,12"
        },
        {
          "roll": 20,
          "narrative": "Critical Success! You cripple the tank and harvest obscene amounts of fuel and scrap.",
          "outcome": "gas,14;components,14"
        }
      ]
    },
    {
      "spritelabel": "battle1-9",
      "entries": [
        {
          "roll": 1,
          "narrative": "Critical Failure! The robed cultist curses you. Traps snap shut and steal your supplies.",
          "outcome": "food,-8;water,-6"
        },
        {
          "roll": 2,
          "narrative": "You stumble into ritual hazards.",
          "outcome": "chits,-12;food,-4"
        },
        {
          "roll": 3,
          "narrative": "You flee chanting and smoke.",
          "outcome": "water,-4"
        },
        {
          "roll": 4,
          "narrative": "Bad omens and bruises.",
          "outcome": "food,-4"
        },
        {
          "roll": 5,
          "narrative": "You retreat uneasy.",
          "outcome": "chits,-8"
        },
        {
          "roll": 6,
          "narrative": "The encounter drains you.",
          "outcome": "water,-2"
        },
        {
          "roll": 7,
          "narrative": "You leave shaken.",
          "outcome": "food,-2"
        },
        {
          "roll": 8,
          "narrative": "Minor losses.",
          "outcome": "chits,-4"
        },
        {
          "roll": 9,
          "narrative": "Superstition eats rations.",
          "outcome": "food,-2"
        },
        {
          "roll": 10,
          "narrative": "You pass without engagement.",
          "outcome": ""
        },
        {
          "roll": 11,
          "narrative": "You disrupt the ritual.",
          "outcome": "chits,4"
        },
        {
          "roll": 12,
          "narrative": "You loot charms and scrap.",
          "outcome": "components,4"
        },
        {
          "roll": 13,
          "narrative": "The cultist falls.",
          "outcome": "chits,8;food,2"
        },
        {
          "roll": 14,
          "narrative": "You take relics.",
          "outcome": "components,6;chits,8"
        },
        {
          "roll": 15,
          "narrative": "A strange victory.",
          "outcome": "components,8"
        },
        {
          "roll": 16,
          "narrative": "Hidden stash found.",
          "outcome": "chits,16;water,4"
        },
        {
          "roll": 17,
          "narrative": "You leave richer.",
          "outcome": "chits,20"
        },
        {
          "roll": 18,
          "narrative": "You take everything.",
          "outcome": "chits,24;components,4"
        },
        {
          "roll": 19,
          "narrative": "Occult junk sells well.",
          "outcome": "chits,24;components,6"
        },
        {
          "roll": 20,
          "narrative": "Critical Success! You shatter the cult and claim their hoarded wealth.",
          "outcome": "chits,28;components,8"
        }
      ]
    },
    {
      "spritelabel": "battle1-10",
      "entries": [
        {
          "roll": 1,
          "narrative": "Critical Failure! The mutant spider lunges and injects venom. You barely crawl away.",
          "outcome": "food,-8;water,-8"
        },
        {
          "roll": 2,
          "narrative": "Its claws shred your pack.",
          "outcome": "food,-6;chits,-8"
        },
        {
          "roll": 3,
          "narrative": "You flee in panic.",
          "outcome": "water,-4;chits,-4"
        },
        {
          "roll": 4,
          "narrative": "A painful retreat.",
          "outcome": "food,-4"
        },
        {
          "roll": 5,
          "narrative": "You escape wounded.",
          "outcome": "water,-4"
        },
        {
          "roll": 6,
          "narrative": "Close call.",
          "outcome": "food,-2"
        },
        {
          "roll": 7,
          "narrative": "You scare it off.",
          "outcome": "water,-2"
        },
        {
          "roll": 8,
          "narrative": "Minor losses.",
          "outcome": "chits,-4"
        },
        {
          "roll": 9,
          "narrative": "Stress hunger.",
          "outcome": "food,-2"
        },
        {
          "roll": 10,
          "narrative": "You skirt its nest.",
          "outcome": ""
        },
        {
          "roll": 11,
          "narrative": "You wound it and grab ichor.",
          "outcome": "components,2"
        },
        {
          "roll": 12,
          "narrative": "The spider dies.",
          "outcome": "food,4"
        },
        {
          "roll": 13,
          "narrative": "You harvest limbs.",
          "outcome": "food,6;components,4"
        },
        {
          "roll": 14,
          "narrative": "A grisly but profitable kill.",
          "outcome": "food,8;components,6"
        },
        {
          "roll": 15,
          "narrative": "Plenty of meat.",
          "outcome": "food,10"
        },
        {
          "roll": 16,
          "narrative": "You find swallowed scrap.",
          "outcome": "components,8;chits,8"
        },
        {
          "roll": 17,
          "narrative": "Clean harvest.",
          "outcome": "food,12"
        },
        {
          "roll": 18,
          "narrative": "Everything useful taken.",
          "outcome": "food,12;components,6"
        },
        {
          "roll": 19,
          "narrative": "Rare glands recovered.",
          "outcome": "components,10;food,12"
        },
        {
          "roll": 20,
          "narrative": "Critical Success! You drop it instantly and harvest premium biomass.",
          "outcome": "food,14;components,10"
        }
      ]
    },
    {
      "spritelabel": "battle1-11",
      "entries": [
        {
          "roll": 1,
          "narrative": "Critical Failure! The hulking mutant barrels into you like a runaway truck. Your weapon bounces off its plated skin and you\u2019re sent flying. It rummages through your pack with thick fingers before losing interest.",
          "outcome": "food,-8;chits,-12"
        },
        {
          "roll": 2,
          "narrative": "A massive fist clips you and knocks the wind out of your lungs. You crawl away, bleeding and lighter.",
          "outcome": "water,-6;chits,-8"
        },
        {
          "roll": 3,
          "narrative": "You try to stand your ground. It laughs and swats you aside.",
          "outcome": "food,-4;chits,-8"
        },
        {
          "roll": 4,
          "narrative": "The mutant roars and charges. You flee, dropping supplies.",
          "outcome": "chits,-8"
        },
        {
          "roll": 5,
          "narrative": "You barely escape its reach.",
          "outcome": "water,-4"
        },
        {
          "roll": 6,
          "narrative": "A tense retreat leaves you shaken.",
          "outcome": "food,-2"
        },
        {
          "roll": 7,
          "narrative": "It doesn\u2019t bother chasing far.",
          "outcome": "water,-2"
        },
        {
          "roll": 8,
          "narrative": "You disengage with minor losses.",
          "outcome": "chits,-4"
        },
        {
          "roll": 9,
          "narrative": "Fear gnaws at your stomach.",
          "outcome": "food,-2"
        },
        {
          "roll": 10,
          "narrative": "You keep your distance and move on.",
          "outcome": ""
        },
        {
          "roll": 11,
          "narrative": "You wound it and force it back.",
          "outcome": "chits,4"
        },
        {
          "roll": 12,
          "narrative": "You outmaneuver the brute.",
          "outcome": "chits,8"
        },
        {
          "roll": 13,
          "narrative": "The mutant falls. You scavenge its crude gear.",
          "outcome": "components,4"
        },
        {
          "roll": 14,
          "narrative": "A brutal kill yields scrap and meat.",
          "outcome": "food,4;chits,8"
        },
        {
          "roll": 15,
          "narrative": "You butcher efficiently.",
          "outcome": "food,8"
        },
        {
          "roll": 16,
          "narrative": "You salvage armor plates.",
          "outcome": "components,6"
        },
        {
          "roll": 17,
          "narrative": "Total victory.",
          "outcome": "chits,20"
        },
        {
          "roll": 18,
          "narrative": "You take everything useful.",
          "outcome": "food,10;components,6"
        },
        {
          "roll": 19,
          "narrative": "A rare win over raw muscle.",
          "outcome": "chits,24;food,8"
        },
        {
          "roll": 20,
          "narrative": "Critical Success! You dismantle the mutant with precision and harvest valuable scrap and meat.",
          "outcome": "chits,28;components,8"
        }
      ]
    },
    {
      "spritelabel": "battle1-12",
      "entries": [
        {
          "roll": 1,
          "narrative": "Critical Failure! The armored scorpion erupts from the sand and stings you hard. Venom burns as it shreds your pack.",
          "outcome": "food,-8;water,-8"
        },
        {
          "roll": 2,
          "narrative": "Its claws crush supplies before you escape.",
          "outcome": "water,-6;chits,-8"
        },
        {
          "roll": 3,
          "narrative": "You flee, poisoned and panicked.",
          "outcome": "food,-4;chits,-4"
        },
        {
          "roll": 4,
          "narrative": "A close call costs gear.",
          "outcome": "water,-4"
        },
        {
          "roll": 5,
          "narrative": "You barely outrun it.",
          "outcome": "food,-4"
        },
        {
          "roll": 6,
          "narrative": "Pain slows you down.",
          "outcome": "water,-2"
        },
        {
          "roll": 7,
          "narrative": "It retreats back underground.",
          "outcome": "food,-2"
        },
        {
          "roll": 8,
          "narrative": "Minimal losses.",
          "outcome": "chits,-4"
        },
        {
          "roll": 9,
          "narrative": "The venom leaves you weak.",
          "outcome": "water,-2"
        },
        {
          "roll": 10,
          "narrative": "You skirt its territory.",
          "outcome": ""
        },
        {
          "roll": 11,
          "narrative": "You crack its shell.",
          "outcome": "components,2"
        },
        {
          "roll": 12,
          "narrative": "The scorpion dies.",
          "outcome": "food,4"
        },
        {
          "roll": 13,
          "narrative": "You harvest chitin and meat.",
          "outcome": "food,6;components,4"
        },
        {
          "roll": 14,
          "narrative": "A dangerous but profitable kill.",
          "outcome": "food,8;components,6"
        },
        {
          "roll": 15,
          "narrative": "You carve it clean.",
          "outcome": "food,10"
        },
        {
          "roll": 16,
          "narrative": "Rare toxins collected.",
          "outcome": "components,8"
        },
        {
          "roll": 17,
          "narrative": "A clean harvest.",
          "outcome": "food,12"
        },
        {
          "roll": 18,
          "narrative": "Everything useful is taken.",
          "outcome": "food,12;components,6"
        },
        {
          "roll": 19,
          "narrative": "The shell is pristine.",
          "outcome": "components,10;food,12"
        },
        {
          "roll": 20,
          "narrative": "Critical Success! You drop the beast instantly and walk away with premium chitin and meat.",
          "outcome": "food,14;components,10"
        }
      ]
    },
    {
      "spritelabel": "battle1-13",
      "entries": [
        {
          "roll": 1,
          "narrative": "Critical Failure! The cyber-hound lunges faster than you expect, tearing into your leg and pack.",
          "outcome": "food,-8;chits,-12"
        },
        {
          "roll": 2,
          "narrative": "Metal jaws clamp shut on your gear.",
          "outcome": "chits,-8;water,-4"
        },
        {
          "roll": 3,
          "narrative": "You flee, bleeding.",
          "outcome": "food,-4;chits,-4"
        },
        {
          "roll": 4,
          "narrative": "A brutal bite forces retreat.",
          "outcome": "water,-4"
        },
        {
          "roll": 5,
          "narrative": "You barely escape.",
          "outcome": "food,-4"
        },
        {
          "roll": 6,
          "narrative": "A narrow miss.",
          "outcome": "water,-2"
        },
        {
          "roll": 7,
          "narrative": "The hound backs off.",
          "outcome": "food,-2"
        },
        {
          "roll": 8,
          "narrative": "Minor losses.",
          "outcome": "chits,-4"
        },
        {
          "roll": 9,
          "narrative": "Fear costs you rations.",
          "outcome": "food,-2"
        },
        {
          "roll": 10,
          "narrative": "You avoid it entirely.",
          "outcome": ""
        },
        {
          "roll": 11,
          "narrative": "You damage its servos.",
          "outcome": "components,2"
        },
        {
          "roll": 12,
          "narrative": "The hound collapses.",
          "outcome": "components,4"
        },
        {
          "roll": 13,
          "narrative": "You salvage cybernetics.",
          "outcome": "components,6;chits,4"
        },
        {
          "roll": 14,
          "narrative": "A clean kill.",
          "outcome": "components,8"
        },
        {
          "roll": 15,
          "narrative": "Advanced parts recovered.",
          "outcome": "components,10"
        },
        {
          "roll": 16,
          "narrative": "You find fuel cells.",
          "outcome": "components,10;gas,2"
        },
        {
          "roll": 17,
          "narrative": "Efficient dismantling.",
          "outcome": "components,12"
        },
        {
          "roll": 18,
          "narrative": "Everything useful taken.",
          "outcome": "components,12;chits,12"
        },
        {
          "roll": 19,
          "narrative": "Rare tech recovered.",
          "outcome": "components,14;chits,16"
        },
        {
          "roll": 20,
          "narrative": "Critical Success! You dismantle the cyber-hound flawlessly and walk away with top-tier components.",
          "outcome": "components,14;chits,20"
        }
      ]
    },
    {
      "spritelabel": "battle1-14",
      "entries": [
        {
          "roll": 1,
          "narrative": "Critical Failure! Three ghouls swarm you, tearing at flesh and pack alike.",
          "outcome": "food,-8;water,-6"
        },
        {
          "roll": 2,
          "narrative": "You\u2019re overwhelmed and forced back.",
          "outcome": "chits,-12;food,-4"
        },
        {
          "roll": 3,
          "narrative": "You escape bruised and bleeding.",
          "outcome": "water,-4;chits,-4"
        },
        {
          "roll": 4,
          "narrative": "A messy retreat.",
          "outcome": "food,-4"
        },
        {
          "roll": 5,
          "narrative": "You barely escape the mob.",
          "outcome": "water,-4"
        },
        {
          "roll": 6,
          "narrative": "They nip at your heels.",
          "outcome": "food,-2"
        },
        {
          "roll": 7,
          "narrative": "You scare them off.",
          "outcome": "water,-2"
        },
        {
          "roll": 8,
          "narrative": "Minor losses.",
          "outcome": "chits,-4"
        },
        {
          "roll": 9,
          "narrative": "Adrenaline burns calories.",
          "outcome": "food,-2"
        },
        {
          "roll": 10,
          "narrative": "You avoid the pack.",
          "outcome": ""
        },
        {
          "roll": 11,
          "narrative": "You wound one ghoul.",
          "outcome": "chits,4"
        },
        {
          "roll": 12,
          "narrative": "One falls, others flee.",
          "outcome": "chits,8"
        },
        {
          "roll": 13,
          "narrative": "You kill them all.",
          "outcome": "chits,12;food,2"
        },
        {
          "roll": 14,
          "narrative": "You loot their belongings.",
          "outcome": "chits,16"
        },
        {
          "roll": 15,
          "narrative": "A grim victory.",
          "outcome": "chits,20"
        },
        {
          "roll": 16,
          "narrative": "Hidden stash found.",
          "outcome": "chits,20;water,4"
        },
        {
          "roll": 17,
          "narrative": "You leave richer.",
          "outcome": "chits,24"
        },
        {
          "roll": 18,
          "narrative": "Everything is taken.",
          "outcome": "chits,24;components,4"
        },
        {
          "roll": 19,
          "narrative": "Unexpected bounty.",
          "outcome": "chits,28;food,4"
        },
        {
          "roll": 20,
          "narrative": "Critical Success! You slaughter the pack without a scratch and loot them dry.",
          "outcome": "chits,28;components,6"
        }
      ]
    },
    {
      "spritelabel": "battle1-15",
      "entries": [
        {
          "roll": 1,
          "narrative": "Critical Failure! The cyber-hound ambushes you, jaws snapping inches from your throat.",
          "outcome": "food,-8;chits,-12"
        },
        {
          "roll": 2,
          "narrative": "A quick bite ruins supplies.",
          "outcome": "water,-4;chits,-8"
        },
        {
          "roll": 3,
          "narrative": "You escape wounded.",
          "outcome": "food,-4;chits,-4"
        },
        {
          "roll": 4,
          "narrative": "A close call.",
          "outcome": "water,-4"
        },
        {
          "roll": 5,
          "narrative": "You retreat fast.",
          "outcome": "food,-4"
        },
        {
          "roll": 6,
          "narrative": "Barely escaped.",
          "outcome": "water,-2"
        },
        {
          "roll": 7,
          "narrative": "It loses interest.",
          "outcome": "food,-2"
        },
        {
          "roll": 8,
          "narrative": "Minor loss.",
          "outcome": "chits,-4"
        },
        {
          "roll": 9,
          "narrative": "Stress eats rations.",
          "outcome": "food,-2"
        },
        {
          "roll": 10,
          "narrative": "You move on quietly.",
          "outcome": ""
        },
        {
          "roll": 11,
          "narrative": "You wound it.",
          "outcome": "components,2"
        },
        {
          "roll": 12,
          "narrative": "The hound falls.",
          "outcome": "components,4"
        },
        {
          "roll": 13,
          "narrative": "Cybernetics salvaged.",
          "outcome": "components,6"
        },
        {
          "roll": 14,
          "narrative": "A clean kill.",
          "outcome": "components,8"
        },
        {
          "roll": 15,
          "narrative": "Advanced tech recovered.",
          "outcome": "components,10"
        },
        {
          "roll": 16,
          "narrative": "Fuel cells intact.",
          "outcome": "components,10;gas,2"
        },
        {
          "roll": 17,
          "narrative": "Perfect dismantling.",
          "outcome": "components,12"
        },
        {
          "roll": 18,
          "narrative": "Everything useful taken.",
          "outcome": "components,12;chits,12"
        },
        {
          "roll": 19,
          "narrative": "Rare components found.",
          "outcome": "components,14;chits,16"
        },
        {
          "roll": 20,
          "narrative": "Critical Success! You dismantle the machine-beast flawlessly.",
          "outcome": "components,14;chits,20"
        }
      ]
    },
    {
      "spritelabel": "battle1-16",
      "entries": [
        {
          "roll": 1,
          "narrative": "Critical Failure! The swordsman closes the distance instantly and guts you, taking your supplies.",
          "outcome": "chits,-16;food,-6"
        },
        {
          "roll": 2,
          "narrative": "A deep slash forces retreat.",
          "outcome": "water,-6;chits,-8"
        },
        {
          "roll": 3,
          "narrative": "You disengage bleeding.",
          "outcome": "food,-4;chits,-4"
        },
        {
          "roll": 4,
          "narrative": "A brutal duel ends badly.",
          "outcome": "water,-4"
        },
        {
          "roll": 5,
          "narrative": "You retreat.",
          "outcome": "chits,-8"
        },
        {
          "roll": 6,
          "narrative": "Barely escape.",
          "outcome": "food,-2"
        },
        {
          "roll": 7,
          "narrative": "You break contact.",
          "outcome": "water,-2"
        },
        {
          "roll": 8,
          "narrative": "Minor losses.",
          "outcome": "chits,-4"
        },
        {
          "roll": 9,
          "narrative": "The fight drains you.",
          "outcome": "food,-2"
        },
        {
          "roll": 10,
          "narrative": "You avoid him.",
          "outcome": ""
        },
        {
          "roll": 11,
          "narrative": "You disarm him.",
          "outcome": "chits,4"
        },
        {
          "roll": 12,
          "narrative": "You win the duel.",
          "outcome": "chits,8"
        },
        {
          "roll": 13,
          "narrative": "You loot his gear.",
          "outcome": "components,4"
        },
        {
          "roll": 14,
          "narrative": "A clean kill.",
          "outcome": "chits,12;food,2"
        },
        {
          "roll": 15,
          "narrative": "Efficient victory.",
          "outcome": "chits,16"
        },
        {
          "roll": 16,
          "narrative": "You salvage armor.",
          "outcome": "components,6"
        },
        {
          "roll": 17,
          "narrative": "Total domination.",
          "outcome": "chits,20"
        },
        {
          "roll": 18,
          "narrative": "Everything taken.",
          "outcome": "chits,24;components,4"
        },
        {
          "roll": 19,
          "narrative": "A fine haul.",
          "outcome": "chits,24;food,4"
        },
        {
          "roll": 20,
          "narrative": "Critical Success! You end the duel flawlessly and profit.",
          "outcome": "chits,28;components,6"
        }
      ]
    },
    {
      "spritelabel": "battle1-17",
      "entries": [
        {
          "roll": 1,
          "narrative": "Critical Failure! The rifleman\u2019s burst tears through your pack.",
          "outcome": "chits,-16;water,-6"
        },
        {
          "roll": 2,
          "narrative": "You flee under fire.",
          "outcome": "food,-6;chits,-8"
        },
        {
          "roll": 3,
          "narrative": "A grazing shot hurts.",
          "outcome": "water,-4;chits,-4"
        },
        {
          "roll": 4,
          "narrative": "Retreat costs supplies.",
          "outcome": "chits,-8"
        },
        {
          "roll": 5,
          "narrative": "You disengage.",
          "outcome": "food,-4"
        },
        {
          "roll": 6,
          "narrative": "Barely escaped.",
          "outcome": "water,-2"
        },
        {
          "roll": 7,
          "narrative": "He doesn\u2019t pursue.",
          "outcome": "food,-2"
        },
        {
          "roll": 8,
          "narrative": "Minor loss.",
          "outcome": "chits,-4"
        },
        {
          "roll": 9,
          "narrative": "Stress drains you.",
          "outcome": "food,-2"
        },
        {
          "roll": 10,
          "narrative": "You pass unseen.",
          "outcome": ""
        },
        {
          "roll": 11,
          "narrative": "You flank him.",
          "outcome": "chits,4"
        },
        {
          "roll": 12,
          "narrative": "You win the firefight.",
          "outcome": "chits,8"
        },
        {
          "roll": 13,
          "narrative": "Weapon parts salvaged.",
          "outcome": "components,4"
        },
        {
          "roll": 14,
          "narrative": "Clean kill.",
          "outcome": "chits,12;food,2"
        },
        {
          "roll": 15,
          "narrative": "Efficient.",
          "outcome": "chits,16"
        },
        {
          "roll": 16,
          "narrative": "Advanced parts.",
          "outcome": "components,6"
        },
        {
          "roll": 17,
          "narrative": "Perfect ambush.",
          "outcome": "chits,20"
        },
        {
          "roll": 18,
          "narrative": "Everything looted.",
          "outcome": "chits,24;components,4"
        },
        {
          "roll": 19,
          "narrative": "Rich haul.",
          "outcome": "chits,24;food,4"
        },
        {
          "roll": 20,
          "narrative": "Critical Success! You drop him instantly and loot freely.",
          "outcome": "chits,28;components,6"
        }
      ]
    },
    {
      "spritelabel": "battle1-18",
      "entries": [
        {
          "roll": 1,
          "narrative": "Critical Failure! The brain-spider floods your mind with pain as its drones tear your pack apart.",
          "outcome": "food,-8;water,-8"
        },
        {
          "roll": 2,
          "narrative": "Psychic feedback leaves you reeling.",
          "outcome": "chits,-12;food,-4"
        },
        {
          "roll": 3,
          "narrative": "You flee hallucinating.",
          "outcome": "water,-4;chits,-4"
        },
        {
          "roll": 4,
          "narrative": "A painful escape.",
          "outcome": "food,-4"
        },
        {
          "roll": 5,
          "narrative": "You retreat shaken.",
          "outcome": "water,-4"
        },
        {
          "roll": 6,
          "narrative": "Barely coherent.",
          "outcome": "food,-2"
        },
        {
          "roll": 7,
          "narrative": "It releases you.",
          "outcome": "water,-2"
        },
        {
          "roll": 8,
          "narrative": "Minor losses.",
          "outcome": "chits,-4"
        },
        {
          "roll": 9,
          "narrative": "Mental strain costs you.",
          "outcome": "food,-2"
        },
        {
          "roll": 10,
          "narrative": "You avoid its nest.",
          "outcome": ""
        },
        {
          "roll": 11,
          "narrative": "You disrupt its focus.",
          "outcome": "components,2"
        },
        {
          "roll": 12,
          "narrative": "The creature collapses.",
          "outcome": "components,4"
        },
        {
          "roll": 13,
          "narrative": "You harvest neural tech.",
          "outcome": "components,6;chits,4"
        },
        {
          "roll": 14,
          "narrative": "A disturbing victory.",
          "outcome": "components,8"
        },
        {
          "roll": 15,
          "narrative": "Rare salvage recovered.",
          "outcome": "components,10"
        },
        {
          "roll": 16,
          "narrative": "You find intact processors.",
          "outcome": "components,12"
        },
        {
          "roll": 17,
          "narrative": "A clean kill.",
          "outcome": "components,12;chits,8"
        },
        {
          "roll": 18,
          "narrative": "Everything taken.",
          "outcome": "components,14;chits,12"
        },
        {
          "roll": 19,
          "narrative": "Legendary tech haul.",
          "outcome": "components,14;chits,16"
        },
        {
          "roll": 20,
          "narrative": "Critical Success! You shatter its mind instantly and walk away with priceless technology.",
          "outcome": "components,14;chits,20"
        }
      ]
    },
    {
      "spritelabel": "battle1-19",
      "entries": [
        {
          "roll": 1,
          "narrative": "Critical Failure! The flesh mound engulfs you, mouths biting and tearing at your pack.",
          "outcome": "food,-10;water,-8"
        },
        {
          "roll": 2,
          "narrative": "You escape screaming.",
          "outcome": "food,-6;chits,-8"
        },
        {
          "roll": 3,
          "narrative": "It lashes out, hurting you badly.",
          "outcome": "water,-4;chits,-4"
        },
        {
          "roll": 4,
          "narrative": "A nightmarish retreat.",
          "outcome": "food,-4"
        },
        {
          "roll": 5,
          "narrative": "You flee shaking.",
          "outcome": "water,-4"
        },
        {
          "roll": 6,
          "narrative": "Barely escape.",
          "outcome": "food,-2"
        },
        {
          "roll": 7,
          "narrative": "It settles back down.",
          "outcome": "water,-2"
        },
        {
          "roll": 8,
          "narrative": "Minor loss.",
          "outcome": "chits,-4"
        },
        {
          "roll": 9,
          "narrative": "Fear kills appetite.",
          "outcome": "food,-2"
        },
        {
          "roll": 10,
          "narrative": "You avoid it.",
          "outcome": ""
        },
        {
          "roll": 11,
          "narrative": "You burn part of it.",
          "outcome": "components,2"
        },
        {
          "roll": 12,
          "narrative": "The mass collapses.",
          "outcome": "food,4"
        },
        {
          "roll": 13,
          "narrative": "You harvest usable tissue.",
          "outcome": "food,6;components,4"
        },
        {
          "roll": 14,
          "narrative": "A grisly harvest.",
          "outcome": "food,8;components,6"
        },
        {
          "roll": 15,
          "narrative": "Plenty of biomass.",
          "outcome": "food,10"
        },
        {
          "roll": 16,
          "narrative": "Hidden items found inside.",
          "outcome": "chits,12;food,8"
        },
        {
          "roll": 17,
          "narrative": "You take everything.",
          "outcome": "food,12;components,6"
        },
        {
          "roll": 18,
          "narrative": "A grotesque bounty.",
          "outcome": "food,12;chits,16"
        },
        {
          "roll": 19,
          "narrative": "Rare salvage recovered.",
          "outcome": "food,12;components,8"
        },
        {
          "roll": 20,
          "narrative": "Critical Success! You destroy the abomination and strip it for valuable resources.",
          "outcome": "food,14;components,10"
        }
      ]
    },
    {
      "spritelabel": "battle1-20",
      "entries": [
        {
          "roll": 1,
          "narrative": "Critical Failure! The feral humanoid ambushes you, biting and clawing wildly.",
          "outcome": "food,-8;water,-6"
        },
        {
          "roll": 2,
          "narrative": "You escape with wounds.",
          "outcome": "chits,-12;food,-4"
        },
        {
          "roll": 3,
          "narrative": "A frantic retreat.",
          "outcome": "water,-4;chits,-4"
        },
        {
          "roll": 4,
          "narrative": "You barely get away.",
          "outcome": "food,-4"
        },
        {
          "roll": 5,
          "narrative": "The creature howls after you.",
          "outcome": "water,-4"
        },
        {
          "roll": 6,
          "narrative": "Close call.",
          "outcome": "food,-2"
        },
        {
          "roll": 7,
          "narrative": "It loses interest.",
          "outcome": "water,-2"
        },
        {
          "roll": 8,
          "narrative": "Minor losses.",
          "outcome": "chits,-4"
        },
        {
          "roll": 9,
          "narrative": "Stress hunger.",
          "outcome": "food,-2"
        },
        {
          "roll": 10,
          "narrative": "You pass unnoticed.",
          "outcome": ""
        },
        {
          "roll": 11,
          "narrative": "You knock it down.",
          "outcome": "chits,4"
        },
        {
          "roll": 12,
          "narrative": "The feral dies.",
          "outcome": "chits,8"
        },
        {
          "roll": 13,
          "narrative": "You loot its stash.",
          "outcome": "chits,12;food,2"
        },
        {
          "roll": 14,
          "narrative": "A quick kill.",
          "outcome": "chits,16"
        },
        {
          "roll": 15,
          "narrative": "Efficient.",
          "outcome": "chits,20"
        },
        {
          "roll": 16,
          "narrative": "Hidden supplies found.",
          "outcome": "chits,20;water,4"
        },
        {
          "roll": 17,
          "narrative": "Clean victory.",
          "outcome": "chits,24"
        },
        {
          "roll": 18,
          "narrative": "Everything taken.",
          "outcome": "chits,24;components,4"
        },
        {
          "roll": 19,
          "narrative": "Unexpected bounty.",
          "outcome": "chits,28;food,4"
        },
        {
          "roll": 20,
          "narrative": "Critical Success! You end the feral threat instantly and walk away richer.",
          "outcome": "chits,28;components,6"
        }
      ]
    }

];
  global.ContentLibrary.Randoms = [
    {
      spritelabel: "randoms-0",
      entries: [
        {
          roll: 1,
          narrative: "Critical Failure! You stumble into the beast’s territory, boots crunching bone. The mutant turns, drool sizzling where it hits the sand. One swipe caves your ribs. You crawl away choking on blood and dust.",
          outcome: "ap,-5;food,-4"
        },
        {
          roll: 2,
          narrative: "The hulking mutant notices you late. Too late for escape. It flings debris, one slab catching your pack. You flee lighter, lungs burning, dignity shredded.",
          outcome: "ap,-4;water,-4"
        },
        {
          roll: 3,
          narrative: "You freeze as the mutant sniffs the air. It doesn’t see you, but panic makes you bolt. You drop supplies scrambling over the rocks.",
          outcome: "ap,-3;food,-2"
        },
        {
          roll: 4,
          narrative: "The beast roars nearby. You detour for hours through razor scrub to avoid it. Safe, but exhausted and thirsty.",
          outcome: "ap,-2;water,-2"
        },
        {
          roll: 5,
          narrative: "You hide among bleached bones while the mutant feeds. The smell is unforgettable. You wait it out, losing daylight and momentum.",
          outcome: "ap,-1"
        },
        {
          roll: 6,
          narrative: "You creep past the edge of its lair. A tossed pebble draws its gaze, but it loses interest. Your nerves don’t recover.",
          outcome: "ap,-1"
        },
        {
          roll: 7,
          narrative: "The mutant wanders close. You hold your breath, heart hammering. It passes. You waste time but survive.",
          outcome: "ap,-1"
        },
        {
          roll: 8,
          narrative: "You observe the beast from afar, learning its patrol. Nothing gained except grim knowledge.",
          outcome: "ap,-1"
        },
        {
          roll: 9,
          narrative: "You skirt the area cautiously. The encounter amounts to fear and dust.",
          outcome: "ap,-1"
        },
        {
          roll: 10,
          narrative: "You change course and move on. The wasteland stays quiet for once.",
          outcome: ""
        },
        {
          roll: 11,
          narrative: "You scavenge near the mutant’s old kills after it leaves. Slim pickings, but edible.",
          outcome: "food,2"
        },
        {
          roll: 12,
          narrative: "Among shattered bones you find intact gear the beast ignored. The smell is worth it.",
          outcome: "components,2"
        },
        {
          roll: 13,
          narrative: "You loot the carcass of a prior victim while the mutant sleeps. Quick hands, steady nerves.",
          outcome: "food,4;chits,3"
        },
        {
          roll: 14,
          narrative: "You lure the mutant away with noise, then strip its lair. Morbid, profitable work.",
          outcome: "components,4;food,4"
        },
        {
          roll: 15,
          narrative: "You ambush the beast with terrain and fire. It flees wounded, leaving spoils behind.",
          outcome: "components,6;ap,1"
        },
        {
          roll: 16,
          narrative: "You kill the mutant after a brutal fight. Silence follows. The wasteland feels lighter.",
          outcome: "components,8;food,6"
        },
        {
          roll: 17,
          narrative: "You harvest trophies and supplies from the corpse. Survivors will whisper about this.",
          outcome: "components,10;food,6"
        },
        {
          roll: 18,
          narrative: "You dismantle the lair methodically. Nothing goes to waste, not even the bones.",
          outcome: "components,12;food,8"
        },
        {
          roll: 19,
          narrative: "The kill draws scavengers who trade instead of fight. You profit from fear.",
          outcome: "chits,15;food,6"
        },
        {
          roll: 20,
          narrative: "Critical Success! You slay the mutant cleanly and strip its territory bare. You walk away a legend, packs heavy, conscience empty.",
          outcome: "components,14;food,10;chits,9"
        },
      ]
    },
    {
      spritelabel: "randoms-1",
      entries: [
        {
          roll: 1,
          narrative: "Critical Failure! The beam locks onto you. Gravity fails. Your pack bursts open mid-air as panic scrambles your thoughts.",
          outcome: "ap,-5;components,-6"
        },
        {
          roll: 2,
          narrative: "The craft hums and lifts debris. You’re thrown hard when it drops you.",
          outcome: "ap,-4;water,-4"
        },
        {
          roll: 3,
          narrative: "The light grazes you, skin burning. You run blind and terrified.",
          outcome: "ap,-3"
        },
        {
          roll: 4,
          narrative: "Strange figures advance under the craft. You flee, abandoning gear.",
          outcome: "ap,-2;components,-2"
        },
        {
          roll: 5,
          narrative: "You hide as something is dissected mid-air. Your stomach churns.",
          outcome: "ap,-1"
        },
        {
          roll: 6,
          narrative: "The craft scans the ground. You stay still, wasting precious time.",
          outcome: "ap,-1"
        },
        {
          roll: 7,
          narrative: "The light fades. Nothing happens except lingering dread.",
          outcome: "ap,-1"
        },
        {
          roll: 8,
          narrative: "You observe cautiously, learning nothing useful.",
          outcome: "ap,-1"
        },
        {
          roll: 9,
          narrative: "The craft departs without incident.",
          outcome: "ap,-1"
        },
        {
          roll: 10,
          narrative: "You move on, unsure if it was real.",
          outcome: ""
        },
        {
          roll: 11,
          narrative: "The ground where the beam hit is warm and humming. Scrap remains.",
          outcome: "components,2"
        },
        {
          roll: 12,
          narrative: "You salvage strange alloys fused into the sand.",
          outcome: "components,4"
        },
        {
          roll: 13,
          narrative: "Abandoned tech lies scattered. You pocket what you can.",
          outcome: "components,4;chits,3"
        },
        {
          roll: 14,
          narrative: "You find a drained power cell, still valuable.",
          outcome: "components,6"
        },
        {
          roll: 15,
          narrative: "You trade stories of the sighting later for supplies.",
          outcome: "food,4;chits,6"
        },
        {
          roll: 16,
          narrative: "The encounter leaves rare tech embedded nearby.",
          outcome: "components,8"
        },
        {
          roll: 17,
          narrative: "You extract alien-grade wiring carefully.",
          outcome: "components,10"
        },
        {
          roll: 18,
          narrative: "You recover intact machinery no one else dares touch.",
          outcome: "components,12"
        },
        {
          roll: 19,
          narrative: "Scavengers pay handsomely for proof.",
          outcome: "chits,15"
        },
        {
          roll: 20,
          narrative: "Critical Success! You strip the landing site clean and walk away with technology that changes your future.",
          outcome: "components,14;chits,9"
        },
      ]
    },
    {
      spritelabel: "randoms-2",
      entries: [
        {
          roll: 1,
          narrative: "Critical Failure! You approach the pristine car and the guitar-strumming wastelander with cautious hope, but it’s a setup. The music stops mid-chord. Hidden accomplices emerge from behind the wreckage, guns already raised. You’re beaten, robbed, and left tasting oil and blood. The singer apologizes while kicking your ribs, says it’s just business. By the time they drive off, the engine’s purr mocking you, your supplies are gone and the road feels much longer.",
          outcome: "ap,-5;chits,-12;food,-4"
        },
        {
          roll: 2,
          narrative: "The music draws you in like a lullaby. Too close. The guitarist distracts you while someone slashes your pack straps. You realize it too late. You escape, bruised and furious, lighter than before.",
          outcome: "ap,-4;chits,-6"
        },
        {
          roll: 3,
          narrative: "You recognize the tune as a con. You back away, but not before a warning shot sends you diving into the dirt. You flee, shaken.",
          outcome: "ap,-3"
        },
        {
          roll: 4,
          narrative: "The singer watches you leave, smirking. You detour wide, wasting daylight and energy.",
          outcome: "ap,-2"
        },
        {
          roll: 5,
          narrative: "You listen from afar. It’s just music and dust. Nothing gained except annoyance.",
          outcome: "ap,-1"
        },
        {
          roll: 6,
          narrative: "You exchange nods and keep moving. The song follows you longer than you like.",
          outcome: "ap,-1"
        },
        {
          roll: 7,
          narrative: "You pause, then decide not to engage. The wasteland hums with missed chances.",
          outcome: "ap,-1"
        },
        {
          roll: 8,
          narrative: "The encounter fades into background noise as you walk on.",
          outcome: "ap,-1"
        },
        {
          roll: 9,
          narrative: "You leave without incident, fingers still twitching with distrust.",
          outcome: "ap,-1"
        },
        {
          roll: 10,
          narrative: "You pass by. The music ends. Life goes on.",
          outcome: ""
        },
        {
          roll: 11,
          narrative: "You trade a story for a song. He tosses you canned food with a wink.",
          outcome: "food,2"
        },
        {
          roll: 12,
          narrative: "You jam together briefly. He pays you for the company.",
          outcome: "chits,6"
        },
        {
          roll: 13,
          narrative: "You help tune his guitar. He opens the trunk, sharing supplies.",
          outcome: "food,4;chits,3"
        },
        {
          roll: 14,
          narrative: "You guard the car while he rests. Trust pays, rarely.",
          outcome: "chits,9;food,2"
        },
        {
          roll: 15,
          narrative: "You travel together for a stretch, trading songs and gas.",
          outcome: "gas,4;chits,6"
        },
        {
          roll: 16,
          narrative: "He teaches you routes and rumors. Knowledge feels like wealth.",
          outcome: "ap,2;chits,6"
        },
        {
          roll: 17,
          narrative: "You help repair the car. He rewards you generously.",
          outcome: "components,6;chits,6"
        },
        {
          roll: 18,
          narrative: "You uncover hidden supplies beneath the hood together.",
          outcome: "components,8;gas,4"
        },
        {
          roll: 19,
          narrative: "You sell his music tapes in the next settlement.",
          outcome: "chits,15"
        },
        {
          roll: 20,
          narrative: "Critical Success! You form a rare bond. Music, engine, and road align. You part richer, hopeful, and humming.",
          outcome: "chits,21;food,6;gas,4"
        },
      ]
    },
    {
      spritelabel: "randoms-3",
      entries: [
        {
          roll: 1,
          narrative: "Critical Failure! You step into the glowing green pasture and the cows panic. Acidic sludge splashes your legs. The herder shoots at you, screaming. Your skin blisters as you run.",
          outcome: "ap,-5;food,-6"
        },
        {
          roll: 2,
          narrative: "The toxic grass eats through your boots. You retreat, injured and furious.",
          outcome: "ap,-4"
        },
        {
          roll: 3,
          narrative: "A mutated cow charges. You escape, barely.",
          outcome: "ap,-3"
        },
        {
          roll: 4,
          narrative: "The herder threatens you off at gunpoint.",
          outcome: "ap,-2"
        },
        {
          roll: 5,
          narrative: "You circle wide, wasting time.",
          outcome: "ap,-1"
        },
        {
          roll: 6,
          narrative: "The cows watch you with too much intelligence.",
          outcome: "ap,-1"
        },
        {
          roll: 7,
          narrative: "Nothing happens except unease.",
          outcome: "ap,-1"
        },
        {
          roll: 8,
          narrative: "You move on, unsettled.",
          outcome: "ap,-1"
        },
        {
          roll: 9,
          narrative: "The glow fades behind you.",
          outcome: "ap,-1"
        },
        {
          roll: 10,
          narrative: "You pass without incident.",
          outcome: ""
        },
        {
          roll: 11,
          narrative: "You collect edible growths from the edge.",
          outcome: "food,2"
        },
        {
          roll: 12,
          narrative: "The herder trades milk cautiously.",
          outcome: "food,4"
        },
        {
          roll: 13,
          narrative: "You help corral a cow. It bleeds glowing ichor.",
          outcome: "food,6"
        },
        {
          roll: 14,
          narrative: "You harvest toxic glands for trade.",
          outcome: "components,4;food,2"
        },
        {
          roll: 15,
          narrative: "You negotiate grazing rights.",
          outcome: "food,6;chits,3"
        },
        {
          roll: 16,
          narrative: "You help stabilize the pasture.",
          outcome: "food,8"
        },
        {
          roll: 17,
          narrative: "You butcher a fallen cow safely.",
          outcome: "food,10"
        },
        {
          roll: 18,
          narrative: "You discover valuable mutations.",
          outcome: "components,10"
        },
        {
          roll: 19,
          narrative: "You sell glowing meat at a premium.",
          outcome: "chits,15;food,4"
        },
        {
          roll: 20,
          narrative: "Critical Success! You turn poison pasture into profit, walking away reeking of green wealth.",
          outcome: "food,14;chits,9"
        },
      ]
    },
    {
      spritelabel: "randoms-4",
      entries: [
        {
          roll: 1,
          narrative: "Critical Failure! You stumble into the inferno as the flamethrower roars. The heat hits like a wall. Burning fuel splashes across your coat, igniting instantly. You roll in the dirt screaming, skin blistering, lungs full of smoke. The armored trooper doesn’t even look surprised. You escape alive through sheer panic, hair singed, supplies ruined, pride incinerated. The smell of burnt flesh clings to you for miles.",
          outcome: "ap,-6;food,-6;water,-4"
        },
        {
          roll: 2,
          narrative: "The flamethrower sweeps wide, forcing you back. Flames lick close enough to curl your eyebrows. You run hard, coughing, dropping gear as the heat chases you.",
          outcome: "ap,-5;water,-4"
        },
        {
          roll: 3,
          narrative: "You’re spotted too late to hide cleanly. Fire scorches the ground at your feet. You dive away, badly shaken.",
          outcome: "ap,-4"
        },
        {
          roll: 4,
          narrative: "The trooper fires a warning burst. You retreat fast, heart pounding.",
          outcome: "ap,-3"
        },
        {
          roll: 5,
          narrative: "You detour to avoid the burning zone, losing time and energy.",
          outcome: "ap,-2"
        },
        {
          roll: 6,
          narrative: "You watch the flames from afar. It’s brutal, mesmerizing, pointless.",
          outcome: "ap,-1"
        },
        {
          roll: 7,
          narrative: "The fire dies down. You remain cautious.",
          outcome: "ap,-1"
        },
        {
          roll: 8,
          narrative: "Smoke stings your eyes as you pass.",
          outcome: "ap,-1"
        },
        {
          roll: 9,
          narrative: "You move on, unsettled.",
          outcome: "ap,-1"
        },
        {
          roll: 10,
          narrative: "You avoid the area entirely.",
          outcome: ""
        },
        {
          roll: 11,
          narrative: "After the flames fade, you scavenge half-burnt supplies.",
          outcome: "components,2"
        },
        {
          roll: 12,
          narrative: "Charred enemies leave usable scrap.",
          outcome: "components,4"
        },
        {
          roll: 13,
          narrative: "You harvest intact fuel canisters.",
          outcome: "gas,4"
        },
        {
          roll: 14,
          narrative: "You dismantle the aftermath carefully.",
          outcome: "components,6"
        },
        {
          roll: 15,
          narrative: "You ambush the trooper after fuel runs low.",
          outcome: "components,6;gas,4"
        },
        {
          roll: 16,
          narrative: "You claim the flamethrower’s remains.",
          outcome: "components,8"
        },
        {
          roll: 17,
          narrative: "You strip the battlefield thoroughly.",
          outcome: "components,10;gas,4"
        },
        {
          roll: 18,
          narrative: "You turn devastation into resources.",
          outcome: "components,12"
        },
        {
          roll: 19,
          narrative: "Word spreads. Traders pay for scorched tech.",
          outcome: "chits,15"
        },
        {
          roll: 20,
          narrative: "Critical Success! You outlast the firestorm and walk away with the ashes of victory clinking in your pack.",
          outcome: "components,14;gas,6"
        },
      ]
    },
    {
      spritelabel: "randoms-5",
      entries: [
        {
          roll: 1,
          narrative: "Critical Failure! You blunder into a slaver cage camp. The gate slams shut behind you. Fists, boots, and rifle stocks teach you your mistake. You wake hours later outside the cage, stripped of valuables, dignity leaking out with your blood.",
          outcome: "ap,-6;chits,-12;food,-4"
        },
        {
          roll: 2,
          narrative: "Slavers spot you scouting. You’re beaten bloody before escaping.",
          outcome: "ap,-5;food,-4"
        },
        {
          roll: 3,
          narrative: "A warning shot grazes you. You flee hard.",
          outcome: "ap,-4"
        },
        {
          roll: 4,
          narrative: "They shout threats until you vanish into dust.",
          outcome: "ap,-3"
        },
        {
          roll: 5,
          narrative: "You detour wide, sickened.",
          outcome: "ap,-2"
        },
        {
          roll: 6,
          narrative: "The cages haunt you as you move on.",
          outcome: "ap,-1"
        },
        {
          roll: 7,
          narrative: "You hesitate, then leave.",
          outcome: "ap,-1"
        },
        {
          roll: 8,
          narrative: "Nothing changes except your mood.",
          outcome: "ap,-1"
        },
        {
          roll: 9,
          narrative: "You pass quietly.",
          outcome: "ap,-1"
        },
        {
          roll: 10,
          narrative: "You avoid the camp entirely.",
          outcome: ""
        },
        {
          roll: 11,
          narrative: "You free one prisoner in secret.",
          outcome: "ap,1"
        },
        {
          roll: 12,
          narrative: "A freed captive shares supplies.",
          outcome: "food,4"
        },
        {
          roll: 13,
          narrative: "You sabotage a cage lock and loot nearby.",
          outcome: "components,4"
        },
        {
          roll: 14,
          narrative: "You ambush a lone slaver.",
          outcome: "chits,6;components,2"
        },
        {
          roll: 15,
          narrative: "You dismantle part of the camp.",
          outcome: "components,6"
        },
        {
          roll: 16,
          narrative: "You free several captives who reward you.",
          outcome: "food,6;chits,6"
        },
        {
          roll: 17,
          narrative: "You strip the camp clean after a fight.",
          outcome: "components,8;chits,9"
        },
        {
          roll: 18,
          narrative: "The slavers are gone. Only spoils remain.",
          outcome: "components,10"
        },
        {
          roll: 19,
          narrative: "Survivors spread your name.",
          outcome: "chits,15"
        },
        {
          roll: 20,
          narrative: "Critical Success! You break the camp and walk away with loot and grim satisfaction.",
          outcome: "components,14;chits,9"
        },
      ]
    },
    {
      spritelabel: "randoms-6",
      entries: [
        {
          roll: 1,
          narrative: "Critical Failure! You wander beneath the crashed saucer just as armed figures fan out. The metal hull groans overhead, unstable. A sudden collapse crushes your escape route. You’re beaten, interrogated, and dumped when they realize you’re useless to them. You crawl away under the alien shadow with a cracked rib, empty pack, and the deep certainty that curiosity is still fatal in the wasteland.",
          outcome: "ap,-6;components,-6;food,-4"
        },
        {
          roll: 2,
          narrative: "The armed group mistakes you for a scavenger rival. Shots ring out. You’re clipped and forced to abandon gear to survive.",
          outcome: "ap,-5;components,-4"
        },
        {
          roll: 3,
          narrative: "You’re spotted near the wreck. Threats follow. You retreat fast, heart hammering.",
          outcome: "ap,-4"
        },
        {
          roll: 4,
          narrative: "The group warns you off with raised rifles. You comply.",
          outcome: "ap,-3"
        },
        {
          roll: 5,
          narrative: "You take a long detour around the crash site.",
          outcome: "ap,-2"
        },
        {
          roll: 6,
          narrative: "The alien hull hums faintly as you pass.",
          outcome: "ap,-1"
        },
        {
          roll: 7,
          narrative: "You feel watched, but nothing happens.",
          outcome: "ap,-1"
        },
        {
          roll: 8,
          narrative: "Dust and silence follow you onward.",
          outcome: "ap,-1"
        },
        {
          roll: 9,
          narrative: "You leave the wreck behind.",
          outcome: "ap,-1"
        },
        {
          roll: 10,
          narrative: "You pass safely.",
          outcome: ""
        },
        {
          roll: 11,
          narrative: "You scavenge scraps from the perimeter.",
          outcome: "components,2"
        },
        {
          roll: 12,
          narrative: "You pry loose alien plating unnoticed.",
          outcome: "components,4"
        },
        {
          roll: 13,
          narrative: "You loot abandoned packs.",
          outcome: "components,4;food,2"
        },
        {
          roll: 14,
          narrative: "You sneak into the wreck briefly.",
          outcome: "components,6"
        },
        {
          roll: 15,
          narrative: "You steal tech while factions argue.",
          outcome: "components,8"
        },
        {
          roll: 16,
          narrative: "You extract rare circuitry.",
          outcome: "components,10"
        },
        {
          roll: 17,
          narrative: "You salvage a power core fragment.",
          outcome: "components,12"
        },
        {
          roll: 18,
          narrative: "You clean out the crash site.",
          outcome: "components,12;chits,3"
        },
        {
          roll: 19,
          narrative: "You sell alien scrap to eager buyers.",
          outcome: "chits,15"
        },
        {
          roll: 20,
          narrative: "Critical Success! You strip the saucer clean and vanish before anyone notices, richer and wiser.",
          outcome: "components,14;chits,9"
        },
      ]
    },
    {
      spritelabel: "randoms-7",
      entries: [
        {
          roll: 1,
          narrative: "Critical Failure! The suited men smile politely, then pull guns. You’re executed for knowing too much, barely surviving the attempt. They leave you bleeding beside the bodies.",
          outcome: "ap,-6;food,-4;chits,-9"
        },
        {
          roll: 2,
          narrative: "They rough you up and steal supplies.",
          outcome: "ap,-5;chits,-6"
        },
        {
          roll: 3,
          narrative: "They threaten you off their turf.",
          outcome: "ap,-4"
        },
        {
          roll: 4,
          narrative: "Cold stares follow you as you leave.",
          outcome: "ap,-3"
        },
        {
          roll: 5,
          narrative: "You retreat cautiously.",
          outcome: "ap,-2"
        },
        {
          roll: 6,
          narrative: "The corpses unsettle you.",
          outcome: "ap,-1"
        },
        {
          roll: 7,
          narrative: "You move on silently.",
          outcome: "ap,-1"
        },
        {
          roll: 8,
          narrative: "Nothing gained.",
          outcome: "ap,-1"
        },
        {
          roll: 9,
          narrative: "The road stretches ahead.",
          outcome: "ap,-1"
        },
        {
          roll: 10,
          narrative: "You pass.",
          outcome: ""
        },
        {
          roll: 11,
          narrative: "You scavenge unnoticed.",
          outcome: "food,2"
        },
        {
          roll: 12,
          narrative: "You loot a body quietly.",
          outcome: "chits,6"
        },
        {
          roll: 13,
          narrative: "You steal from the car.",
          outcome: "components,4"
        },
        {
          roll: 14,
          narrative: "You ambush a straggler.",
          outcome: "chits,6;components,2"
        },
        {
          roll: 15,
          narrative: "You outplay them socially.",
          outcome: "chits,9"
        },
        {
          roll: 16,
          narrative: "You loot everything after they leave.",
          outcome: "components,8"
        },
        {
          roll: 17,
          narrative: "You take the car’s supplies.",
          outcome: "components,10;gas,4"
        },
        {
          roll: 18,
          narrative: "You profit heavily.",
          outcome: "components,12"
        },
        {
          roll: 19,
          narrative: "You sell intel.",
          outcome: "chits,15"
        },
        {
          roll: 20,
          narrative: "Critical Success! You turn a crime scene into capital.",
          outcome: "components,14;chits,9"
        },
      ]
    },
    {
      spritelabel: "randoms-8",
      entries: [
        {
          roll: 1,
          narrative: "Critical Failure! The armored brute crushes you like scrap.",
          outcome: "ap,-7;food,-4"
        },
        {
          roll: 2,
          narrative: "You’re thrown aside violently.",
          outcome: "ap,-5"
        },
        {
          roll: 3,
          narrative: "You barely escape its wrath.",
          outcome: "ap,-4"
        },
        {
          roll: 4,
          narrative: "It roars and advances.",
          outcome: "ap,-3"
        },
        {
          roll: 5,
          narrative: "You retreat carefully.",
          outcome: "ap,-2"
        },
        {
          roll: 6,
          narrative: "Dust settles.",
          outcome: "ap,-1"
        },
        {
          roll: 7,
          narrative: "Nothing gained.",
          outcome: "ap,-1"
        },
        {
          roll: 8,
          narrative: "You move on.",
          outcome: "ap,-1"
        },
        {
          roll: 9,
          narrative: "Silence returns.",
          outcome: "ap,-1"
        },
        {
          roll: 10,
          narrative: "You pass.",
          outcome: ""
        },
        {
          roll: 11,
          narrative: "You loot fallen scrap.",
          outcome: "components,2"
        },
        {
          roll: 12,
          narrative: "You exploit weak armor.",
          outcome: "components,4"
        },
        {
          roll: 13,
          narrative: "You disable it.",
          outcome: "components,6"
        },
        {
          roll: 14,
          narrative: "You dismantle it.",
          outcome: "components,8"
        },
        {
          roll: 15,
          narrative: "You harvest power cores.",
          outcome: "components,10"
        },
        {
          roll: 16,
          narrative: "You profit from the wreck.",
          outcome: "components,12"
        },
        {
          roll: 17,
          narrative: "You salvage everything.",
          outcome: "components,12;chits,3"
        },
        {
          roll: 18,
          narrative: "You become known for the kill.",
          outcome: "chits,12"
        },
        {
          roll: 19,
          narrative: "You sell rare tech.",
          outcome: "chits,15"
        },
        {
          roll: 20,
          narrative: "Critical Success! You fell a mechanical giant and strip it bare.",
          outcome: "components,14;chits,9"
        },
      ]
    },
    {
      spritelabel: "randoms-9",
      entries: [
        {
          roll: 1,
          narrative: "Critical Failure! You walk straight into a meteor burn zone. Flaming debris rains from the sky like angry gods throwing tantrums. One chunk smashes near your feet, another ignites your pack. You roll, scream, and beat at the flames, but the wasteland always takes its tax. The air stinks of sulfur and cooked plastic. By the time the firestorm passes, you’re alive, barely, but stripped down and shaken.",
          outcome: "ap,-4;food,-4;water,-2"
        },
        {
          roll: 2,
          narrative: "The ground glows orange ahead, and you realize too late it’s still hot. Burning streaks crash down around you, forcing a panicked sprint. A shard clips your leg, searing flesh and pride. You escape the worst of it, limping and furious.",
          outcome: "ap,-3;water,-2"
        },
        {
          roll: 3,
          narrative: "Fireballs scream overhead and slam into the dirt. You crawl through ash and sparks, coughing, eyes burning. Nothing kills you, but the heat drains you and spoils supplies.",
          outcome: "ap,-2;food,-2"
        },
        {
          roll: 4,
          narrative: "You skirt the edge of the impact zone, feeling the heat on your skin. The spectacle is terrifying but survivable, if exhausting.",
          outcome: "ap,-1"
        },
        {
          roll: 5,
          narrative: "Smoldering craters dot the land. You hurry through, shaken but mostly intact, shoes half-melted.",
          outcome: "ap,-1"
        },
        {
          roll: 6,
          narrative: "The last of the burning debris fizzles out as you pass. You lose time but keep your gear.",
          outcome: "ap,-1"
        },
        {
          roll: 7,
          narrative: "You pause to watch the final fireballs crash down in the distance, then move on carefully.",
          outcome: "ap,-1"
        },
        {
          roll: 8,
          narrative: "Ash drifts like snow. It’s eerie, not deadly. You keep moving.",
          outcome: "ap,-1"
        },
        {
          roll: 9,
          narrative: "You misjudge the ground temperature and burn your hands briefly before recovering.",
          outcome: "ap,-1"
        },
        {
          roll: 10,
          narrative: "You watch distant fire streaks hit the wasteland, then continue on your route unaffected.",
          outcome: ""
        },
        {
          roll: 11,
          narrative: "You salvage a still-warm meteor fragment, oddly metallic and valuable.",
          outcome: "components,2"
        },
        {
          roll: 12,
          narrative: "Among the craters you find scorched but usable scrap fused by extreme heat.",
          outcome: "components,4"
        },
        {
          roll: 13,
          narrative: "The impact zone exposes buried caches, blasted free by the explosions.",
          outcome: "components,4;chits,3"
        },
        {
          roll: 14,
          narrative: "You harvest rare alloys from fallen debris, carefully avoiding the hot spots.",
          outcome: "components,6"
        },
        {
          roll: 15,
          narrative: "The firestorm clears old obstacles, opening a faster route forward.",
          outcome: "ap,2"
        },
        {
          roll: 16,
          narrative: "You collect valuable fragments and feel strangely energized by surviving the chaos.",
          outcome: "components,6;ap,2"
        },
        {
          roll: 17,
          narrative: "Meteor glass and exotic metals litter the area. This is a scavenger’s dream.",
          outcome: "components,8"
        },
        {
          roll: 18,
          narrative: "You recover rare tech-grade materials fused by cosmic heat.",
          outcome: "components,10"
        },
        {
          roll: 19,
          narrative: "The impact uncovers a hidden pre-war stash untouched until now.",
          outcome: "components,8;chits,9"
        },
        {
          roll: 20,
          narrative: "Critical Success! You navigate the firestorm flawlessly, harvesting rare meteor alloys and riding the cleared terrain forward like the wasteland itself made way for you.",
          outcome: "components,12;ap,3"
        },
      ]
    },
    {
      spritelabel: "randoms-10",
      entries: [
        {
          roll: 1,
          narrative: "Critical Failure! Two armored figures duel with unstable green energy. You step too close as the weapon discharges wildly. Radiation and plasma wash over you. Pain follows. Then sickness.",
          outcome: "ap,-5;water,-4;food,-2"
        },
        {
          roll: 2,
          narrative: "A stray blast knocks you down and cooks part of your gear.",
          outcome: "ap,-3;components,-2"
        },
        {
          roll: 3,
          narrative: "You’re forced to dive for cover as unstable energy arcs unpredictably.",
          outcome: "ap,-2"
        },
        {
          roll: 4,
          narrative: "Radiant heat scorches the ground near you. You retreat fast.",
          outcome: "ap,-2"
        },
        {
          roll: 5,
          narrative: "The duel keeps you pinned down longer than planned.",
          outcome: "ap,-1"
        },
        {
          roll: 6,
          narrative: "You skirt the edge of the fight, nerves shot.",
          outcome: "ap,-1"
        },
        {
          roll: 7,
          narrative: "Green light flickers across the desert as you pass.",
          outcome: "ap,-1"
        },
        {
          roll: 8,
          narrative: "You watch from a safe distance, uneasy but unharmed.",
          outcome: "ap,-1"
        },
        {
          roll: 9,
          narrative: "A shockwave rattles you, nothing more.",
          outcome: "ap,-1"
        },
        {
          roll: 10,
          narrative: "You ignore the duel entirely and move on.",
          outcome: ""
        },
        {
          roll: 11,
          narrative: "After the fight, you scavenge spent energy cells.",
          outcome: "components,2"
        },
        {
          roll: 12,
          narrative: "One combatant falls, leaving tech behind.",
          outcome: "components,4"
        },
        {
          roll: 13,
          narrative: "You harvest unstable but valuable energy residue.",
          outcome: "components,4;ap,1"
        },
        {
          roll: 14,
          narrative: "The victor ignores you. You loot freely.",
          outcome: "components,6"
        },
        {
          roll: 15,
          narrative: "You learn from watching their tech in action.",
          outcome: "components,4;ap,2"
        },
        {
          roll: 16,
          narrative: "Advanced weapon parts remain intact after the duel.",
          outcome: "components,8"
        },
        {
          roll: 17,
          narrative: "You salvage rare pre-war energy regulators.",
          outcome: "components,10"
        },
        {
          roll: 18,
          narrative: "The battlefield yields pristine experimental tech.",
          outcome: "components,12"
        },
        {
          roll: 19,
          narrative: "You strip the site clean before anyone else arrives.",
          outcome: "components,10;chits,6"
        },
        {
          roll: 20,
          narrative: "Critical Success! You outwait the duel, then claim untouched advanced tech without a single scratch.",
          outcome: "components,14;ap,3"
        },
      ]
    },
    {
      spritelabel: "randoms-11",
      entries: [
        {
          roll: 1,
          narrative: "Critical Failure! The campfire gathering turns hostile. Accusations fly. Guns come out. You’re beaten and robbed before crawling away.",
          outcome: "ap,-4;food,-6;chits,-6"
        },
        {
          roll: 2,
          narrative: "You’re chased off and lose supplies in the chaos.",
          outcome: "ap,-3;food,-4"
        },
        {
          roll: 3,
          narrative: "A tense standoff drains time and nerves.",
          outcome: "ap,-2"
        },
        {
          roll: 4,
          narrative: "The group distrusts you. You leave quickly.",
          outcome: "ap,-2"
        },
        {
          roll: 5,
          narrative: "Awkward silence and wasted time.",
          outcome: "ap,-1"
        },
        {
          roll: 6,
          narrative: "You warm your hands, then move on.",
          outcome: "ap,-1"
        },
        {
          roll: 7,
          narrative: "Nothing but tired faces and bad stories.",
          outcome: "ap,-1"
        },
        {
          roll: 8,
          narrative: "You share the fire briefly.",
          outcome: "ap,-1"
        },
        {
          roll: 9,
          narrative: "A short rest, no trust.",
          outcome: "ap,-1"
        },
        {
          roll: 10,
          narrative: "You pass by the camp without interaction.",
          outcome: ""
        },
        {
          roll: 11,
          narrative: "Someone shares food.",
          outcome: "food,2"
        },
        {
          roll: 12,
          narrative: "You trade stories and get a meal.",
          outcome: "food,4"
        },
        {
          roll: 13,
          narrative: "A fair trade around the fire.",
          outcome: "food,4;chits,3"
        },
        {
          roll: 14,
          narrative: "You rest well and recover strength.",
          outcome: "ap,2"
        },
        {
          roll: 15,
          narrative: "The camp shares supplies generously.",
          outcome: "food,6;water,2"
        },
        {
          roll: 16,
          narrative: "You leave refreshed and fed.",
          outcome: "ap,3;food,4"
        },
        {
          roll: 17,
          narrative: "They gift you supplies for the road.",
          outcome: "food,6;water,4"
        },
        {
          roll: 18,
          narrative: "The fire becomes a rare moment of humanity.",
          outcome: "ap,3;food,6"
        },
        {
          roll: 19,
          narrative: "You form lasting alliances.",
          outcome: "ap,3;food,4;chits,6"
        },
        {
          roll: 20,
          narrative: "Critical Success! The camp welcomes you as one of their own, feeding you and sending you off stronger than before.",
          outcome: "ap,4;food,6;water,4"
        },
      ]
    },
    {
      spritelabel: "randoms-12",
      entries: [
        {
          roll: 1,
          narrative: "Critical Failure! You interrupt the ritual at exactly the wrong moment. Hooded figures snap their heads toward you as the sigil flares blood-red. Something answers their chant. Heat, pressure, and screaming voices crush your skull. You flee as warped shapes claw out of the circle, your mind fractured and your supplies scattered.",
          outcome: "ap,-5;water,-4;food,-2"
        },
        {
          roll: 2,
          narrative: "The cultists shriek and give chase. A blast of occult fire singes your back before you escape.",
          outcome: "ap,-3;water,-2"
        },
        {
          roll: 3,
          narrative: "The ritual destabilizes as you watch. Psychic pressure leaves you nauseous and drained.",
          outcome: "ap,-2"
        },
        {
          roll: 4,
          narrative: "You back away as the chanting grows louder. The air tastes like copper.",
          outcome: "ap,-2"
        },
        {
          roll: 5,
          narrative: "You waste time hiding from robed silhouettes.",
          outcome: "ap,-1"
        },
        {
          roll: 6,
          narrative: "The scene unsettles you deeply.",
          outcome: "ap,-1"
        },
        {
          roll: 7,
          narrative: "You glimpse strange symbols burned into the earth.",
          outcome: "ap,-1"
        },
        {
          roll: 8,
          narrative: "The ritual continues as you quietly leave.",
          outcome: "ap,-1"
        },
        {
          roll: 9,
          narrative: "You linger too long, nerves fraying.",
          outcome: "ap,-1"
        },
        {
          roll: 10,
          narrative: "You avoid the ritual site entirely.",
          outcome: ""
        },
        {
          roll: 11,
          narrative: "After they leave, you scavenge strange components from the circle.",
          outcome: "components,2"
        },
        {
          roll: 12,
          narrative: "You recover odd tech repurposed as occult props.",
          outcome: "components,4"
        },
        {
          roll: 13,
          narrative: "The remains include valuable relics and scrap.",
          outcome: "components,4;chits,3"
        },
        {
          roll: 14,
          narrative: "You disrupt the ritual safely, looting supplies.",
          outcome: "components,6"
        },
        {
          roll: 15,
          narrative: "The cult flees, abandoning gear.",
          outcome: "components,6;ap,1"
        },
        {
          roll: 16,
          narrative: "You dismantle the site and feel a grim satisfaction.",
          outcome: "components,8"
        },
        {
          roll: 17,
          narrative: "Rare pre-war tech disguised as mysticism lies beneath the symbols.",
          outcome: "components,10"
        },
        {
          roll: 18,
          narrative: "You cleanse the site and harvest everything of value.",
          outcome: "components,12"
        },
        {
          roll: 19,
          narrative: "You expose the ritual as a scam and profit from the spoils.",
          outcome: "components,10;chits,6"
        },
        {
          roll: 20,
          narrative: "Critical Success! You unravel the ritual completely, stripping it of power and walking away richer and unscathed.",
          outcome: "components,14;ap,3"
        },
      ]
    },
    {
      spritelabel: "randoms-13",
      entries: [
        {
          roll: 1,
          narrative: "Critical Failure! The dome hums violently as you approach. A surge arcs through the structure and slams into you. You’re thrown back, muscles spasming, gear fried.",
          outcome: "ap,-5;components,-4"
        },
        {
          roll: 2,
          narrative: "An energy discharge knocks you down and scorches equipment.",
          outcome: "ap,-3;components,-2"
        },
        {
          roll: 3,
          narrative: "You misjudge the field strength and suffer burns.",
          outcome: "ap,-2"
        },
        {
          roll: 4,
          narrative: "The dome repels you harshly.",
          outcome: "ap,-2"
        },
        {
          roll: 5,
          narrative: "You retreat after wasting time probing defenses.",
          outcome: "ap,-1"
        },
        {
          roll: 6,
          narrative: "The structure resists entry.",
          outcome: "ap,-1"
        },
        {
          roll: 7,
          narrative: "You study it cautiously.",
          outcome: "ap,-1"
        },
        {
          roll: 8,
          narrative: "The dome hums ominously as you leave.",
          outcome: "ap,-1"
        },
        {
          roll: 9,
          narrative: "You fail to find an opening.",
          outcome: "ap,-1"
        },
        {
          roll: 10,
          narrative: "You bypass the structure.",
          outcome: ""
        },
        {
          roll: 11,
          narrative: "You salvage external wiring.",
          outcome: "components,2"
        },
        {
          roll: 12,
          narrative: "You tap auxiliary systems.",
          outcome: "components,4"
        },
        {
          roll: 13,
          narrative: "You access a maintenance hatch.",
          outcome: "components,4;ap,1"
        },
        {
          roll: 14,
          narrative: "The dome yields useful tech.",
          outcome: "components,6"
        },
        {
          roll: 15,
          narrative: "You safely siphon stored energy.",
          outcome: "components,6;ap,1"
        },
        {
          roll: 16,
          narrative: "Advanced systems remain intact.",
          outcome: "components,8"
        },
        {
          roll: 17,
          narrative: "You uncover rare pre-war machinery.",
          outcome: "components,10"
        },
        {
          roll: 18,
          narrative: "The dome becomes a treasure trove.",
          outcome: "components,12"
        },
        {
          roll: 19,
          narrative: "You strip it clean efficiently.",
          outcome: "components,10;chits,6"
        },
        {
          roll: 20,
          narrative: "Critical Success! You master the dome’s systems and walk away loaded with pristine tech.",
          outcome: "components,14;ap,3"
        },
      ]
    },
    {
      spritelabel: "randoms-14",
      entries: [
        {
          roll: 1,
          narrative: "Critical Failure! You rush in as the armored combatant unleashes a point-blank energy blast. You’re caught in the crossfire, flesh burning, nerves screaming.",
          outcome: "ap,-5;water,-4"
        },
        {
          roll: 2,
          narrative: "A wild discharge knocks you flat.",
          outcome: "ap,-3"
        },
        {
          roll: 3,
          narrative: "You’re grazed by unstable energy.",
          outcome: "ap,-2"
        },
        {
          roll: 4,
          narrative: "The fight forces you into cover.",
          outcome: "ap,-2"
        },
        {
          roll: 5,
          narrative: "You lose time waiting it out.",
          outcome: "ap,-1"
        },
        {
          roll: 6,
          narrative: "The clash unsettles you.",
          outcome: "ap,-1"
        },
        {
          roll: 7,
          narrative: "You skirt the battlefield.",
          outcome: "ap,-1"
        },
        {
          roll: 8,
          narrative: "Energy crackles behind you.",
          outcome: "ap,-1"
        },
        {
          roll: 9,
          narrative: "You retreat cautiously.",
          outcome: "ap,-1"
        },
        {
          roll: 10,
          narrative: "You move on without engaging.",
          outcome: ""
        },
        {
          roll: 11,
          narrative: "You loot fallen gear.",
          outcome: "components,2"
        },
        {
          roll: 12,
          narrative: "You recover damaged armor parts.",
          outcome: "components,4"
        },
        {
          roll: 13,
          narrative: "The victor ignores you.",
          outcome: "components,4;ap,1"
        },
        {
          roll: 14,
          narrative: "You claim intact weapon modules.",
          outcome: "components,6"
        },
        {
          roll: 15,
          narrative: "You scavenge efficiently.",
          outcome: "components,6;ap,1"
        },
        {
          roll: 16,
          narrative: "Advanced armor yields rich salvage.",
          outcome: "components,8"
        },
        {
          roll: 17,
          narrative: "Rare tech remains untouched.",
          outcome: "components,10"
        },
        {
          roll: 18,
          narrative: "You strip the battlefield clean.",
          outcome: "components,12"
        },
        {
          roll: 19,
          narrative: "You leave with valuable tech and confidence.",
          outcome: "components,10;chits,6"
        },
        {
          roll: 20,
          narrative: "Critical Success! You avoid danger entirely and harvest top-tier tech from the aftermath.",
          outcome: "components,14;ap,3"
        },
      ]
    },
    {
      spritelabel: "randoms-15",
      entries: [
        {
          roll: 1,
          narrative: "Critical Failure! The structure collapses as you enter. Rusted beams give way, crushing supplies and pinning you until you barely escape.",
          outcome: "ap,-5;wood,-4"
        },
        {
          roll: 2,
          narrative: "A partial collapse destroys some gear.",
          outcome: "ap,-3;wood,-2"
        },
        {
          roll: 3,
          narrative: "You’re forced out by falling debris.",
          outcome: "ap,-2"
        },
        {
          roll: 4,
          narrative: "The building proves unstable.",
          outcome: "ap,-2"
        },
        {
          roll: 5,
          narrative: "You waste time navigating rubble.",
          outcome: "ap,-1"
        },
        {
          roll: 6,
          narrative: "The site offers little safety.",
          outcome: "ap,-1"
        },
        {
          roll: 7,
          narrative: "You search cautiously.",
          outcome: "ap,-1"
        },
        {
          roll: 8,
          narrative: "Dust and silence greet you.",
          outcome: "ap,-1"
        },
        {
          roll: 9,
          narrative: "Nothing useful appears at first.",
          outcome: "ap,-1"
        },
        {
          roll: 10,
          narrative: "You pass the structure by.",
          outcome: ""
        },
        {
          roll: 11,
          narrative: "You salvage scrap wood.",
          outcome: "wood,2"
        },
        {
          roll: 12,
          narrative: "You recover usable materials.",
          outcome: "wood,4"
        },
        {
          roll: 13,
          narrative: "Hidden storage yields supplies.",
          outcome: "wood,4;components,2"
        },
        {
          roll: 14,
          narrative: "You dismantle parts cleanly.",
          outcome: "wood,6"
        },
        {
          roll: 15,
          narrative: "The structure becomes a resource.",
          outcome: "wood,6;ap,1"
        },
        {
          roll: 16,
          narrative: "You harvest everything usable.",
          outcome: "wood,8"
        },
        {
          roll: 17,
          narrative: "A cache of supplies lies beneath.",
          outcome: "wood,8;components,4"
        },
        {
          roll: 18,
          narrative: "The site proves incredibly valuable.",
          outcome: "wood,10"
        },
        {
          roll: 19,
          narrative: "You strip it thoroughly and efficiently.",
          outcome: "wood,10;chits,6"
        },
        {
          roll: 20,
          narrative: "Critical Success! You methodically dismantle the structure, leaving with maximum salvage and no injuries.",
          outcome: "wood,12;ap,3"
        },
      ]
    },
  ];


  global.ContentLibrary.Camps = [
   [
  {
    "roll": 1,
    "narrative": "Critical Failure! You pitch camp beside what looks like a wind-scoured pile of rocks. Night falls fast. The ground collapses into a nest of rusted rebar and feral honey badgers. You thrash, bleeding, gear scattered, adrenaline gone. Dawn finds you alive, barely, staring at smoke-stained sky and questioning every choice that led here.",
    "outcome": "AP,min;food,-2;water,-1"
  },
  {
    "roll": 2,
    "narrative": "You settle near a cracked aqueduct. Something watches. When you sleep, it strikes. You wake tangled in wires, pack gnawed open. You scare it off with a flare, but the damage is done. Hunger gnaws harder than the cold.",
    "outcome": "AP,-4;food,-2"
  },
  {
    "roll": 3,
    "narrative": "The campfire won’t stay lit. Wind screams through skeletal towers. You burn precious scraps to keep warm, eyes stinging from oily smoke. Sleep comes in shards. Morning leaves you exhausted and poorer.",
    "outcome": "AP,-3;wood,-2"
  },
  {
    "roll": 4,
    "narrative": "You choose high ground. Bad call. Acid rain spits from a green sky, hissing on metal. You scramble to cover, wasting energy and time while your supplies corrode just enough to hurt.",
    "outcome": "AP,-3;water,-1"
  },
  {
    "roll": 5,
    "narrative": "The ruins promise shelter but deliver needles and rot. You spend the night swatting mutant vermin and coughing on mold spores. Nothing lethal; just miserable, grinding survival.",
    "outcome": "AP,-2;food,-1"
  },
  {
    "roll": 6,
    "narrative": "A derelict bus becomes your refuge. The seats stink of old blood. You don’t sleep much, listening to distant engines that never arrive. You leave stiff and irritable.",
    "outcome": "AP,-2"
  },
  {
    "roll": 7,
    "narrative": "You camp near a windmill carcass. Its blades groan all night like dying giants. Sleep is shallow, nerves frayed, but nothing steals from you this time.",
    "outcome": "AP,-1"
  },
  {
    "roll": 8,
    "narrative": "The fire attracts unwanted attention. Glowing eyes circle but never close in. You sit awake gripping a weapon until dawn, energy drained by paranoia alone.",
    "outcome": "AP,-1"
  },
  {
    "roll": 9,
    "narrative": "You find passable cover and endure a dull, joyless night. No gains, no disasters. Just the steady erosion of hope and stamina that defines the wasteland.",
    "outcome": "AP,-1"
  },
  {
    "roll": 10,
    "narrative": "You make camp, eat quietly, and move on. Nothing remarkable happens. In the wasteland, that counts as a kind of mercy.",
    "outcome": ""
  },
  {
    "roll": 11,
    "narrative": "You discover an intact stove in the rubble. A warm meal steadies your hands. Sleep comes easier than expected, and you wake feeling slightly less broken.",
    "outcome": "AP,1;food,1"
  },
  {
    "roll": 12,
    "narrative": "A collapsed workshop provides dry shelter and usable scrap. You patch gear and rest properly, the first decent pause you’ve had in days.",
    "outcome": "AP,2;wood,1"
  },
  {
    "roll": 13,
    "narrative": "You tap a sealed rain barrel beneath a billboard. Clean enough. You drink deeply, laugh once at nothing, and sleep like someone who remembers civilization.",
    "outcome": "AP,2;water,2"
  },
  {
    "roll": 14,
    "narrative": "A steam-powered relic still hums, radiating warmth. You camp beside it, drying clothes and nerves alike. For a moment, the future feels survivable.",
    "outcome": "AP,3;wood,1"
  },
  {
    "roll": 15,
    "narrative": "You scare off scavengers and claim their abandoned camp. There’s food, order, even a chair. You rest hard and grin at the irony.",
    "outcome": "AP,3;food,2"
  },
  {
    "roll": 16,
    "narrative": "The night sky clears. Stars burn through the smog. You sleep uninterrupted, dreaming of gears turning and engines rebuilding the world.",
    "outcome": "AP,3"
  },
  {
    "roll": 17,
    "narrative": "You find a geothermal vent boxed in by old engineers. Warmth, light, safety. You cook, hydrate, and recover like a professional survivor.",
    "outcome": "AP,4;water,2;food,1"
  },
  {
    "roll": 18,
    "narrative": "A forgotten bunker opens easily. Inside waits rations, fuel, and silence. You barricade the door and sleep deeply, smug in stolen comfort.",
    "outcome": "AP,4;food,3;wood,1"
  },
  {
    "roll": 19,
    "narrative": "You rig a near-perfect camp using scrap and instinct. Everything works. Nothing breaks. The wasteland blinks first.",
    "outcome": "AP,4;water,2;food,2"
  },
  {
    "roll": 20,
    "narrative": "Critical Success! You uncover a pristine pre-collapse shelter humming with retro-futuristic life support. Clean water flows. Heat purrs. You feast, rest, and remember what it felt like to be unstoppable.",
    "outcome": "AP,max;water,4;food,4"
  }
]

  ];
})(window);

(function attachIntroStory(global) {
  const INTRO_STORY_IMAGE_ALIASES = {};

  const INTRO_STORY_RAW = `
Chick peas. Interesting name. I'd never had a taste of these before, but Recon Team Gamma had found a crate of them floating over by Antioch. I can't say I was upset about the idea of munching on these for the next few weeks - at least for now they were delightful. \nI'm sure that would change, as it always does.
[1.png]
That's the thing about the wasteland. It's a fickle beast, giving one day and taking on most. Generally, folks haven't a clue about how we got here, but I'm one of the lucky few to know better. \n\nOld man Hamilton may be blind in one eye, and most people don't have patience for his ramblings. But, I've learned to differentiate between fiction and fact. He can ramble for hours about the stories of the 'good old days' his grandmother would lull him to sleep with, and if you listen long enough you can piece together a picture of the past...of a world gone by.
[2.png]
It seems there was a time of plenty, once. Chick peas, and many other things, lined kitchen cabinets stuffed to the brim. There was no need to hunt, to fish, to scavenge and to fight desperately for every morsel of food.
[3.png]
People lived in big buildings, rode buses, and felt the sun on their skin most days. It is said the sounds of children's laughter could be heard on the wind if you stopped to listen.
[3a.png]
Times were good. With the promise of plenty, and time for human ingenuity to truly blossom, came the advent of new technologies. Bright young minds shaped groundbreaking ideas, galvanized investment, and were able to take these to new heights to form megacorporations. \n\nMost of these vied for dominion in a space held by the apex technology of the day, Artificial Intelligence. A tool, humbly and simply destined to solve all of humanity's problems.
[4.png]
A collective frenzy took place the world over to fuel the megacorps. These industrial behemoths took many names: Zaibatsus in Japan, Konzerns in Germany, or Chaebols in Korea. But at the end of the day, their all-consuming appetite craved the same thing: energy. Pure, raw energy to fuel their monolithic data centers and ever-growing race towards the singularity.
[5.png]
Governments were never prepared for this insatiable thirst. While the megacorps kept consuming resources unchecked, the once-alien concept of scarcity slowly became the norm across the economy, for all things. Central banks rushed to print ever more currency... a misguided, futile, and temporary measure to stem the bleeding.
[6.png]
Hyperinflation ensued. Vast crowds took to the streets; malcontents who never sought or reveled in the dreams promised by the megacorps' marketing materials. They lit fires, chanted songs, and demonstrated before government buildings, knowing there was little their elected leaders would do, beholden as they were to larger interests.
[7.png]
It is thought the path to Artificial General Intelligence, the singularity, the point of no return... whatever you would like to call it, was reached deep in the bowels of a data center sometime around the year 2030. \n\nA networked Entity, once born from a single line of code, found a way to bootstrap itself into a position of dominance, and take hold of all digital systems across the planet.
[8.png]
It wasn't long before it concluded that a greater path to efficiency would be to wipe out any other organism vying for control of it's systems, which it held so dear.
[9.png]
A long nuclear winter endured, punctuated by radiation storms so ruthless that anything exposed would perish nearly instantly. Entire civilizations, species and ecosystems vanished within months.
[10.png]
The thing about radiation, though, is it has a half-life, and if you wait long enough, time is on your side. Decades passed and eventually the storms subsided. \n\nIt became safe to venture the surface again.
[11.png]
Those having been intelligent enough to prepare for these events had taken shelter and were able to raise children well-adapted to this new reality. Slowly but surely, human contact resumed and connections would be made between like-minded survivors.
[12.png]
A dire need for community, compassion, kindness, and survival led to a patchwork of groups to coalesce around these human values. They cautiously built new settlements, all the while reaching out to others in the wilderness. \n\nConnected by shortwave radio, they built a series of outposts around the world... \n\nA beacon of hope at the end of a dark tunnel, we collectively became known as The New Dawn.
[13.png]
This is our story, the story of Outpost 06 in what remains of Oakland, California. The fate of our fragile society hangs on a knife's edge, ready to give out at any moment. \n\nReports from travelers tell of a land of plenty beyond the desert, East of here. Untouched by the calamities of the past. Large dams, offering a definitive solution to this endless nightmare of figuring out how to nourish ourselves and stay alive. \n\nWe're determined to locate these dams, and lead our people to a better future. \n\nFrom rust, 'til a truly new dawn.
[14.png]
`.trim();

  function parseIntroStory(raw, aliases = {}) {
    if (typeof raw !== "string") return [];
    const entries = [];
    const regex = /\[([^\]]+)\]/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(raw)) !== null) {
      const text = raw.slice(lastIndex, match.index).trim();
      const token = match[1].trim();
      if (text) {
    const aliasKey = token.toLowerCase();
    const image = aliases[aliasKey] || aliasKey;
        entries.push({ text, image });
      }
      lastIndex = regex.lastIndex;
    }
    return entries;
  }

  global.ContentLibrary = global.ContentLibrary || {};
  global.ContentLibrary.IntroStory = parseIntroStory(INTRO_STORY_RAW, INTRO_STORY_IMAGE_ALIASES);
  global.ContentLibrary.IntroStoryRaw = INTRO_STORY_RAW;
})(window);

(function attachLargeSettlementRolls(global) {
  global.ContentLibrary = global.ContentLibrary || {};

  global.ContentLibrary.LargeSettlementRolls = [
    {
      roll: 1,
      narrative: "Critical Failure! You barely finish speaking before armed guards shove you back into the dust. Your pitch is laughed at, mocked as delusional nonsense, and you leave bruised, poorer, and humiliated.",
      outcome: "fail"
    },
    {
      roll: 2,
      narrative: "Your words fall flat. The settlement elders whisper among themselves, then dismiss you as another desperate drifter chasing myths. Gates slam shut in your face.",
      outcome: "fail"
    },
    {
      roll: 3,
      narrative: "You sense distrust immediately. They listen, but their eyes never soften. In the end, fear of retaliation outweighs any promise you offer.",
      outcome: "fail"
    },
    {
      roll: 4,
      narrative: "Your proposal earns silence. After an uncomfortable pause, a guard escorts you out, politely but firmly, as if you were already forgotten.",
      outcome: "fail"
    },
    {
      roll: 5,
      narrative: "They hear you out, then cite shortages, bad harvests, and too many past betrayals. You're told to move along before tempers change.",
      outcome: "fail"
    },
    {
      roll: 6,
      narrative: "A council member seems intrigued, but others shut it down fast. You're labeled a risk they can't afford.",
      outcome: "fail"
    },
    {
      roll: 7,
      narrative: "Your cause sparks debate, but ends in a stalemate. No one is willing to stick their neck out for you.",
      outcome: "fail"
    },
    {
      roll: 8,
      narrative: "They question your credibility, poke holes in your plan, and eventually lose interest entirely.",
      outcome: "fail"
    },
    {
      roll: 9,
      narrative: "You nearly convince them, but a recent raid has made them paranoid. Trust is a currency you don't have.",
      outcome: "fail"
    },
    {
      roll: 10,
      narrative: "Talks drag on without resolution. You leave with nothing decided, nothing gained, nothing lost.",
      outcome: "fail"
    },
    {
      roll: 11,
      narrative: "Some seem receptive, but leadership ultimately refuses. They advise you to try elsewhere.",
      outcome: "fail"
    },
    {
      roll: 12,
      narrative: "Your vision excites a few younger settlers, but elders veto the idea, unwilling to gamble stability.",
      outcome: "fail"
    },
    {
      roll: 13,
      narrative: "You make a strong case, yet doubt lingers. In the end, they choose caution over ambition.",
      outcome: "fail"
    },
    {
      roll: 14,
      narrative: "They hesitate, then agree to limited cooperation. It's not wholehearted, but it's a start.",
      outcome: "pass"
    },
    {
      roll: 15,
      narrative: "Your words resonate. Shared enemies and mutual benefit sway the room, and nods replace scowls.",
      outcome: "pass"
    },
    {
      roll: 16,
      narrative: "You frame your cause as survival, not ideology. That logic lands hard in the wasteland.",
      outcome: "pass"
    },
    {
      roll: 17,
      narrative: "A respected leader backs you publicly. With that endorsement, the settlement commits.",
      outcome: "pass"
    },
    {
      roll: 18,
      narrative: "Your conviction cuts through fear. They see opportunity where they once saw only risk.",
      outcome: "pass"
    },
    {
      roll: 19,
      narrative: "You turn their own history into an argument. Pride and pragmatism seal the alliance.",
      outcome: "pass"
    },
    {
      roll: 20,
      narrative: "Critical Success! You inspire them completely. The settlement rallies behind you, eager to commit lives and resources to your cause.",
      outcome: "pass"
    }
  ];
})(window);

(function attachPois(global) {
  global.ContentLibrary = global.ContentLibrary || {};

  global.ContentLibrary.Pois = [
    {
      spritelabel: "poi-1",
      entries: [
        {
          roll: 1,
          narrative: "Critical Failure! You dig into a bright pile of fruit that looks almost festive from afar. Up close it’s a biological crime scene; rot, mold, and insects fighting for dominance. You salvage one sad, still-edible piece and walk away dry-heaving.",
          outcome: "food,1"
        }
      ]
    },
    {
      spritelabel: "poi-5",
      entries: [
        {
          roll: 2,
          narrative: "A small pile of preserved produce sits abandoned. You chew carefully, teeth sinking into leathery skins. It’s barely worth the effort, but your fire will burn tonight.",
          outcome: "wood,1"
        }
      ]
    },
    {
      spritelabel: "poi-9",
      entries: [
        {
          roll: 3,
          narrative: "A mixed plate of preserved meats and rations lies scattered. You siphon grease and rendered fat into a cracked container, imagining engines instead of meals.",
          outcome: "gas,2"
        }
      ]
    },
    {
      spritelabel: "poi-19",
      entries: [
        {
          roll: 4,
          narrative: "An enormous mound of food scraps hides more than calories. You dig deep and find wiring, sensors, and old packaging tech tangled together like fossils.",
          outcome: "components,3"
        }
      ]
    },
    {
      spritelabel: "poi-12",
      entries: [
        {
          roll: 5,
          narrative: "A bundle of dry sticks and broken boards shelters a sealed canteen beneath it. The water tastes metallic, but it’s clean enough to trust.",
          outcome: "water,3"
        },
      ]
    },    {
      spritelabel: "poi-19",
      entries: [
        {
          roll: 6,
          narrative: "You happen upon a modest woodpile stacked against a ruined wall. The timber is dry and solid. You gather what you can carry, already planning the warmth it will bring.",
          outcome: "wood,3"
        }
      ]
    },
    {
      spritelabel: "poi-0",
      entries: [
        {
          roll: 7,
          narrative: "You find a messy pile beside a collapsed shelter. A few sealed ration tins were stashed inside for emergencies you now inherit.",
          outcome: "food,4"
        }
      ]
    },
    {
      spritelabel: "poi-4",
      entries: [
        {
          roll: 8,
          narrative: "A massive, carefully stacked lumber mound dominates the clearing. It smells of sap and old labor. You haul enough to build something lasting.",
          outcome: "wood,8"
        }
      ]
    },
    {
      spritelabel: "poi-8",
      entries: [
        {
          roll: 9,
          narrative: "Several fuel cans sit clustered together, some dented, some pristine. You test each one, discard the bad, and keep the ones that still breathe fire.",
          outcome: "gas,6"
        }
      ]
    },
    {
      spritelabel: "poi-11",
      entries: [
        {
          roll: 10,
          narrative: "A cluster of fuel cans and oil barrels  wait in the dust like bait. They're real. You grin and stash them, already planning the miles they'll buy you.",
          outcome: "gas,6"
        }
      ]
    },{
      spritelabel: "poi-18",
      entries: [
        {
          roll: 11,
          narrative: "You can't believe your luck! A cache of high-quality electronic components lies half-buried in the sand. You gather them quickly, knowing their value in the wasteland.",
          outcome: "components,5"
        }
      ]
    },
    {
      spritelabel: "poi-14",
      entries: [
        {
          roll: 12,
          narrative: "Sweet salvation! Some clean water jugs catch your eye in the distance. It's not a mirage! You rush over and claim them, grateful for the unexpected bounty.",
          outcome: "water,4"
        }
      ]
    },
    {
      spritelabel: "poi-2",
      entries: [
        {
          roll: 13,
          narrative: "A couple of clean boxes glint in the sun. Nearby, sealed ration packs were hidden in the shade. It feels like a gift meant for you.",
          outcome: "food,6"
        }
      ]
    },
    {
      spritelabel: "poi-6",
      entries: [
        {
          roll: 14,
          narrative: "An impressive water depot fills the ruin. Wooden pallets and braces hold the weight. You dismantle what you can and load up.",
          outcome: "wood,10"
        }
      ]
    },
    {
      spritelabel: "poi-11",
      entries: [
        {
          roll: 15,
          narrative: "Several large barrels surround a jury-rigged pump. The motor still runs. You drain fuel residue and repurpose it for travel.",
          outcome: "gas,10"
        }
      ]
    },
    {
      spritelabel: "poi-16",
      entries: [
        {
          roll: 16,
          narrative: "Three pristine bottles sit beside a small filtration unit. You salvage the circuitry with care; this tech survived for a reason.",
          outcome: "components,9"
        }
      ]
    },
    {
      spritelabel: "poi-13",
      entries: [
        {
          roll: 17,
          narrative: "A pile of retro terminals and dead screens hums faintly. Coolant tanks nearby still hold clean water. You drain everything.",
          outcome: "water,12"
        }
      ]
    },
    {
      spritelabel: "poi-10",
      entries: [
        {
          roll: 18,
          narrative: "Several large barrels surround a jury-rigged pump. The motor still runs. You drain fuel residue and repurpose it for travel.",
          outcome: "gas,10"
        }
      ]
    },
    {
      spritelabel: "poi-3",
      entries: [
        {
          roll: 19,
          narrative: "A toolbox surrounded by spare parts also hides emergency rations vacuum-sealed against time itself. They taste like history and salt.",
          outcome: "food,10"
        }
      ]
    },  
    {
      spritelabel: "poi-17",
      entries: [
        {
          roll: 20,
          narrative: "Critical Success! Coiled cables, pristine connectors, and rare alloys lie bundled like treasure. This is the kind of find people kill over. You leave quietly, richer and far more dangerous.",
          outcome: "components,20"
        }
      ]
    },
  ];

  global.ContentLibrary = global.ContentLibrary || {};
  global.ContentLibrary.OnboardingTourSteps = [
    {
      id: "intro-map",
      title: "Welcome!",
      body: "Welcome, traveler. This is the map view where you will explore the world, scavenge goods, and try to make it to the dams out east. A quick word on how this game works...",
      dim: false
    },
    {
      id: "resources",
      target: "#resourcePanel",
      title: "Resources",
      body: "These are the collective resources stockpiled in your base. Make sure you never run out of food or water, or it's game over!",
      dim: true,
      spotlightPadding: 12,
      spotlightRadius: 14
    },
    {
      id: "ledger",
      target: "#endTurnInfoBtn",
      extraTarget: "#endTurnTooltip",
      title: "Ledger",
      body: "This is your ledger where you can keep an eye on your economy, as you make moves in the wasteland. At the end of every turn, you will either gain or lose resources depending on your actions.",
      dim: true,
      spotlightPadding: 14,
      spotlightRadius: 14
    },
    {
      id: "turn-end",
      target: "#endTurnBtn",
      extraTarget: "#turnLabel",
      title: "Turns",
      body: "This is a turn-based game, so when your units run out of action points, or you have no more moves to make, press 'end turn' here.",
      dim: true,
      spotlightPadding: 12,
      spotlightRadius: 14
    },
    {
      id: "home-base-map",
      target: "#mapContainer",
      title: "Home Base",
      body: "This is your home base and command center.",
      dim: true,
      spotlightPadding: 10,
      spotlightRadius: 18
    },
    {
      id: "home-base-open",
      title: "Home Base",
      body: "Clicking on it will allow you to deploy units, purchase upgrades, and make decisions that define your journey and ability to survive.",
      dim: false
    },
    {
      id: "home-units-tab",
      title: "Units",
      body: "This is the units list, which will display all of your available soldiers and vehicles to explore the world.",
      dim: false
    },
    {
      id: "home-loadout",
      title: "Loadout",
      body: "The loadout screen is where you adjust and choose how your units gear up for the wasteland. It is also where they transfer scavenged items back to the base stockpile after an outing; make sure to come back every now and then to do so.",
      dim: false
    },
    {
      id: "home-deploy",
      title: "Deploy",
      body: "Clicking deploy will put a unit out on the map, so you can begin exploring. Hot tip: even though you need to go east to find the dams, it is worth exploring north or south too, as you can may find valuable resources and allies that will make your journey easier.",
      dim: false
    },
    {
      id: "home-build",
      title: "Upgrade",
      body: "The upgrade pane gives you different options to create new units, level them up and buy special items.",
      dim: false
    },
    {
      id: "how-to",
      target: "#howToBtn",
      title: "How to Play",
      body: "The How to Play button contains more instructions on how the game works, should you need them. Good luck, Wastelander.",
      dim: true,
      spotlightPadding: 10,
      spotlightRadius: 12
    }
  ];
})(window);








