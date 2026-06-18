"""
Word banks for the Villain Origin Story generator.

All lists are imported by villain_origin_story.py and consumed via random.choice / random.sample.
Add or edit entries here to expand the comedy without touching any generator logic.
"""

ADJECTIVES = [
    "Lukewarm", "Unsalted", "Expired", "Mildly Inconvenienced", "Perpetually Buffering",
    "Slightly Damp", "Overdrawn", "Unsubscribed", "Recently Ghosted", "Chronically Underbaked",
    "Improperly Filed", "Double-Parked", "Unmuted", "Left on Read", "Withholding", "Unread",
]

NOUNS = [
    "Reckoning", "Vengeance", "Asterisk", "Footnote", "Spreadsheet", "Stapler", "Reply-All",
    "Out-of-Office", "Pop-Up", "Paywall", "Group Chat", "Loading Bar", "Error 404",
    "Final Notice", "Unskippable Ad", "Cookie Banner", "Software Update", "Terms & Conditions",
]

TITLES = [
    "Baron", "Madame", "Lord", "Doctor", "Professor", "Count", "Captain", "Mistress",
    "The Dread", "Archduke", "Sister", "Brother", "The Honorable",
]

PROPER_NOUNS = [
    "Vendetta", "Spite", "Asterisk", "Malware", "Backslash", "Ctrl-Z", "Decaf", "Semicolon",
    "Overcast", "Lowercase", "Voicemail", "Autocorrect", "Buffering", "Notarized",
]

PLACES = [
    "Aisle Seven", "the Self-Checkout", "Customer Support", "the Group Project", "the HOA",
    "the Comments Section", "Seat 14B", "the Returns Desk", "the Waiting Room",
    "Tier-Two Support", "the Spam Folder", "the Quiet Carriage", "the Parking Structure",
]

THREAT_LEVELS = [
    "Mildly Concerning", "Eye-Roll Inducing", "Passive-Aggressive", "Catastrophic (for morale)",
    "HR-Involved", "Citywide Sighing", "Apocalyptic, but petty", "Beyond Lukewarm",
    "Code Beige", "Existentially Annoying",
]

OPENINGS = [
    "Once, you were no one in particular — a face in the queue, a name spelled wrong on a coffee"
    " cup.",
    "You used to be normal. You paid your taxes. You returned the shopping carts. You let people"
    " merge.",
    "There was a time when you wanted nothing more than to be left alone with a fully charged"
    " phone.",
    "You were ordinary once. Forgettable, even. You said 'no worries' and you meant it.",
    "Long ago, you believed in the system. You read the terms. You waited your turn.",
]

INCIDENTS = [
    "Then came the day everything cracked: {incident}.",
    "But the universe had other plans. {incident_cap}. That was the moment something inside you"
    " went quiet — and then very, very loud.",
    "And then it happened. {incident_cap}. A small thing, they said. They were wrong.",
    "Until {incident}. They called it minor. They will not call it that again.",
    "It was an ordinary day. And then: {incident}. The last domino in a line you didn't know"
    " you'd been stacking.",
]

TRANSFORMATIONS = [
    "Something in you snapped clean in half, and what crawled out was not interested in"
    " 'no worries.'",
    "You did not seek power. Power found you — slightly damp and deeply petty — in a parking"
    " lot.",
    "In that instant the meek thing you'd been dissolved, and {alias} stepped into the fluorescent"
    " light.",
    "You stopped apologizing. You started planning.",
    "The version of you that holds doors and rounds up the tip simply... left. {alias} remained.",
]

POWERS = [
    "the ability to make any printer jam from across the room",
    "an aura that drops every nearby Wi-Fi connection to a single, taunting bar",
    "the power to turn every traffic light red the instant you approach",
    "the gift of reviving email chains that should have died weeks ago",
    "exact command over the moment a podcast cuts to an ad",
    "the power to empty any ice machine seconds before your turn",
    "telekinetic control of every shopping cart with one bad wheel",
    "the talent for scheduling meetings that could have been a single email",
    "an unbreakable ability to be 'just browsing' for four uninterrupted hours",
    "the curse of always knowing — but never saying — the correct answer",
    "the power to make any 'quick call' last fifty-five minutes",
    "dominion over the final 2% of every phone battery",
    "mastery of the voicemail that says only 'call me back'",
    "the power to make every elevator stop at every floor, forever",
]

PLANS = [
    "Your plan is simple, and terrible: to set every clock in the city four minutes fast,"
    " permanently.",
    "You will replace all the world's pens with the kind that don't quite work.",
    "Your masterstroke — a global rollout of mandatory updates, scheduled exclusively during"
    " lunch.",
    "You intend to reply-all to humanity, and CC its enemies.",
    "You will rename every file 'final_FINAL_v2_USE_THIS_ONE' until civilization weeps.",
    "Your endgame is one citywide group chat that no one is permitted to leave.",
    "You shall make every self-checkout detect an 'unexpected item in the bagging area'"
    " — eternally.",
    "You will ensure every set of instructions ships with one screw left over.",
]

NEMESES = [
    "Only one stands in your way: a relentlessly cheerful barista who remembers every order but"
    " yours.",
    "Your sworn enemy is the IT guy who insists it's 'probably your cables.'",
    "One foe haunts you still — the neighbor who reverses into the shared driveway at 6 a.m.",
    "There is one who can stop you: the colleague who says 'per my last email' and means it.",
    "Your nemesis is a small, smug dog with no respect for property lines.",
    "Standing against you: the customer ahead, paying entirely in exact change and anecdotes.",
]

WEAKNESSES = [
    "Your one weakness: a sincere, unprompted compliment. It disarms you completely. Pathetic.",
    "You can be undone by a single working stapler, placed gently in your hand.",
    "Your kryptonite remains, embarrassingly, free samples.",
    "One thing stops you cold: someone holding the door, then actually waiting.",
    "Your fatal flaw — you cannot leave a 4.8-star review unread. You must know what went wrong.",
    "You are powerless against a perfectly timed 'no worries, take your time.'",
]

TAGLINES = [
    "They made you wait. Now the whole world will.",
    "You asked for the manager. You became one.",
    "Somewhere, a printer is already afraid.",
    "The receipt was longer than your arm. So is your reach now.",
    "Remember the name — or don't. That's exactly the kind of thing that started all this.",
]

FALLBACK_INCIDENT = "the barista spelled your name wrong — again"
