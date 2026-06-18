#!/usr/bin/env python3
"""
🏔  Dolomites Hiking Itinerary Generator
No API key required — runs entirely offline.
"""

import random
import textwrap

ITINERARIES = {
    "val gardena": {
        "easy": [
            {
                "name": "Seceda Loop",
                "waypoints": ["Ortisei (1236m)", "Seceda Cable Car", "Forcella Nives (2435m)", "Rifugio Firenze (2042m)", "Ortisei"],
                "elevation": 400, "hours": 3.5,
                "description": "Breathtaking views over the Odle group. Well-marked trail, suitable for families.",
                "tips": ["Take the cable car on the way up to save energy", "Bring sunscreen — you walk in the open most of the time", "Try the Knödel (bread dumplings) at Rifugio Firenze"],
            },
            {
                "name": "Rasciesa Lake Walk",
                "waypoints": ["Santa Cristina (1428m)", "Malga Saltria", "Rasciesa Lake (2100m)", "Santa Cristina"],
                "elevation": 670, "hours": 4,
                "description": "A forested trail that opens up onto a small alpine lake with views of the Sassolungo.",
                "tips": ["Shaded for the first half — great on hot days", "Pack a picnic, the meadows around the lake are perfect"],
            },
            {
                "name": "Alpe di Siusi — Farmstead Tour",
                "waypoints": ["Ortisei (1236m)", "Alpe di Siusi Gondola", "Malga Sanon (1830m)", "Malga Tuff (1907m)", "Ortisei"],
                "elevation": 200, "hours": 2.5,
                "description": "A stroll across Europe's largest high-altitude plateau, through flower-filled meadows and traditional mountain farms.",
                "tips": ["Best in May–June when wildflowers bloom", "Stop at the farms to taste local cheese", "Cars are not allowed — use the gondola"],
            },
        ],
        "moderate": [
            {
                "name": "Sassolungo Circuit",
                "waypoints": ["Plan de Gralba (1982m)", "Rifugio Comici (2153m)", "Sassolungo Pass (2681m)", "Rifugio Vicenza (2253m)", "Plan de Gralba"],
                "elevation": 750, "hours": 6,
                "description": "Classic loop around the Sassolungo massif with sweeping views of the central Dolomites.",
                "tips": ["Start early to beat afternoon clouds", "The pass may have snow until June", "Trekking poles recommended for the descent"],
            },
            {
                "name": "Rifugio Friedrich August",
                "waypoints": ["Wolkenstein (1563m)", "Trail 526", "Rifugio Friedrich August (2298m)", "Wolkenstein"],
                "elevation": 735, "hours": 5,
                "description": "Classic ascent with views over the Sella Group and the Odle. Historic hut with excellent cuisine.",
                "tips": ["Book lunch at the hut in peak season", "Trail 526 is well-marked but steep near the top"],
            },
        ],
        "difficult": [
            {
                "name": "Sassopiatto Ridge",
                "waypoints": ["Alpe di Siusi (1844m)", "Rifugio Sasso Piatto (2300m)", "Sassopiatto Summit (2964m)", "Rifugio Sasso Piatto", "Alpe di Siusi"],
                "elevation": 1120, "hours": 7.5,
                "description": "Ascent to the summit with an exposed section near the top. Full 360° panorama.",
                "tips": ["Some alpine experience recommended for the final section", "Helmet and harness useful", "Only attempt in stable weather"],
            },
            {
                "name": "Oskar Schuster Via Ferrata — Sassolungo",
                "waypoints": ["Plan de Gralba (1982m)", "Rifugio Vicenza (2253m)", "Ferrata start (2400m)", "Punta Grohmann (3126m)", "Trail descent"],
                "elevation": 1150, "hours": 8,
                "description": "Historic via ferrata on the Sassolungo face with extraordinary views over Val Gardena.",
                "tips": ["Full via ferrata kit required", "Good weather only", "Long descent — budget time carefully"],
            },
        ],
    },
    "val badia": {
        "easy": [
            {
                "name": "Ladin Legends Trail",
                "waypoints": ["Corvara (1568m)", "Malga Cesa de Gherdenacia", "Chapel of San Giacomo", "Corvara"],
                "elevation": 280, "hours": 2.5,
                "description": "Cultural route through meadows and votive chapels with information boards about Ladin heritage.",
                "tips": ["Great for children too", "Visit the Ladin museum in San Martino in Badia"],
            },
            {
                "name": "Colfosco Lake Loop",
                "waypoints": ["Colfosco (1645m)", "Colfosco Lake (1785m)", "Rifugio Jimmy (1840m)", "Colfosco"],
                "elevation": 250, "hours": 2,
                "description": "Short hike to a small mountain lake with views of the Sella Group.",
                "tips": ["Perfect as a first hike for those not yet in shape", "Sunrise over the lake is spectacular"],
            },
            {
                "name": "Pralongia Plateau Walk",
                "waypoints": ["La Villa (1433m)", "Rifugio Pralongia (2005m)", "Sella panorama viewpoint", "La Villa"],
                "elevation": 580, "hours": 3.5,
                "description": "Climb to an open plateau with 360° views over the Ladin Dolomites.",
                "tips": ["Bring binoculars — the Pale di San Martino are visible in the distance", "Good trail markings throughout"],
            },
        ],
        "moderate": [
            {
                "name": "Sellaronda on Foot — Val Badia Stage",
                "waypoints": ["Corvara (1568m)", "Gardena Pass (2121m)", "Rifugio Cavazza al Pisciadù (2587m)", "Corvara"],
                "elevation": 1020, "hours": 6,
                "description": "Spectacular stage of the Sellaronda on foot with views of the majestic Sella Group.",
                "tips": ["Scree section — stiff boots essential", "Rifugio Pisciadù is one of the most beautiful huts in the Dolomites"],
            },
            {
                "name": "Alta Via 1 — Fanes Stage",
                "waypoints": ["Pederu (1548m)", "Rifugio Fanes (2060m)", "Lago di Limo (2159m)", "Rifugio Lavarella (2042m)", "Pederu"],
                "elevation": 700, "hours": 5.5,
                "description": "A stage through the heart of the Fanes-Sennes-Braies Natural Park, past alpine lakes and Ladin legends.",
                "tips": ["Protected area — respect the flora and fauna", "Marmot sightings almost guaranteed", "Book the hut well in advance in summer"],
            },
        ],
        "difficult": [
            {
                "name": "Piz Boè Summit",
                "waypoints": ["Corvara (1568m)", "Gardena Pass (2121m)", "Rifugio Cavazza (2587m)", "Piz Boè (3152m)", "Return"],
                "elevation": 1590, "hours": 8.5,
                "description": "The highest peak of the Sella Group. Final stretch over scree and rock.",
                "tips": ["Leave at first light", "Trail not always clear in the final section — use GPS", "Temperature at the summit always low"],
            },
            {
                "name": "Tridentina Via Ferrata — Sassongher",
                "waypoints": ["Corvara (1568m)", "Trail 8", "Ferrata start (2200m)", "Sassongher (2665m)", "Corvara"],
                "elevation": 1100, "hours": 7,
                "description": "Via ferrata on solid rock with views over Val Badia. The defining peak of the Corvara landscape.",
                "tips": ["Via ferrata kit required", "Steep descent — trekking poles helpful"],
            },
        ],
    },
    "val di fassa": {
        "easy": [
            {
                "name": "Lake Carezza Loop",
                "waypoints": ["Lake Carezza (1520m)", "Circular trail", "Latemar viewpoint", "Lake Carezza"],
                "elevation": 60, "hours": 1,
                "description": "The rainbow lake of the Dolomites. Flat loop through fir trees with reflections of the peaks.",
                "tips": ["Arrive early — parking fills up fast", "Most beautiful in late May when snow is melting"],
            },
            {
                "name": "Vael Trail",
                "waypoints": ["Vigo di Fassa (1382m)", "Ciampedie (2000m)", "Rifugio Roda di Vael (2283m)", "Vigo di Fassa"],
                "elevation": 900, "hours": 4,
                "description": "Classic ascent with views of the Catinaccio. One of the most scenic huts in the area.",
                "tips": ["Use the cable car to Ciampedie on the way up", "At sunset the Catinaccio glows red — the Enrosadüra"],
            },
            {
                "name": "Campitello Forest Walk",
                "waypoints": ["Campitello di Fassa (1448m)", "Malga Brunech (1850m)", "Col Rodella viewpoint", "Campitello"],
                "elevation": 400, "hours": 2.5,
                "description": "Pleasant walk through larch forests with views of the Sella Group.",
                "tips": ["In autumn the larches turn golden — spectacular", "Easy trail, great for families"],
            },
        ],
        "moderate": [
            {
                "name": "Catinaccio Circuit — Rosengarten Trail",
                "waypoints": ["Pera di Fassa (1315m)", "Rifugio Gardeccia (1950m)", "Rifugio Vajolet (2243m)", "Rifugio Re Alberto (2621m)", "Pera di Fassa"],
                "elevation": 1310, "hours": 7,
                "description": "The heart of the Catinaccio, with the Vajolet Towers rising into the sky. An absolute classic.",
                "tips": ["Rifugi Vajolet and Re Alberto are very busy — book ahead", "The Scalette section is exposed — take care"],
            },
            {
                "name": "Col Rodella Traverse",
                "waypoints": ["Campitello (1448m)", "Col Rodella cable car (2484m)", "Rifugio Sasso Piatto (2300m)", "Campitello"],
                "elevation": 500, "hours": 5,
                "description": "Panoramic traverse with the Sassolungo on one side and the Sella on the other.",
                "tips": ["Cable car runs in season only", "Ideal for sunrise photography"],
            },
        ],
        "difficult": [
            {
                "name": "Vajolet Towers — Normal Route",
                "waypoints": ["Pera di Fassa (1315m)", "Rifugio Vajolet (2243m)", "Rifugio Re Alberto (2621m)", "Torre Stabeler (2805m)", "Return"],
                "elevation": 1500, "hours": 9,
                "description": "Ascent of the iconic Vajolet Towers, symbol of the Catinaccio. Final section involves climbing.",
                "tips": ["Alpine guide recommended for the climbing section", "Helmet required", "Good weather only"],
            },
        ],
    },
    "tre cime di lavaredo": {
        "easy": [
            {
                "name": "Three Peaks Circuit",
                "waypoints": ["Rifugio Auronzo (2320m)", "Rifugio Lavaredo (2344m)", "Forcella Col di Mezzo (2315m)", "Rifugio Locatelli (2405m)", "Rifugio Auronzo"],
                "elevation": 300, "hours": 3,
                "description": "The most famous hike in the Dolomites. Unique scenery on a well-marked circular trail.",
                "tips": ["Start at 7:00 to beat the crowds", "Even in August it can be cold — bring a fleece", "Parking at Rifugio Auronzo is paid"],
            },
            {
                "name": "Lake Misurina Stroll",
                "waypoints": ["Lake Misurina (1756m)", "Circular trail", "Misurina Chapel", "Lake Misurina"],
                "elevation": 50, "hours": 1.5,
                "description": "Flat walk around the lake with the Three Peaks in the background.",
                "tips": ["Best photo spot early in the morning", "Cafés and restaurants on the lakefront"],
            },
        ],
        "moderate": [
            {
                "name": "Pioneers Trail",
                "waypoints": ["Lake Misurina (1756m)", "Rifugio Auronzo (2320m)", "Three Peaks circuit", "Rifugio Locatelli (2405m)", "Lake Misurina"],
                "elevation": 900, "hours": 6.5,
                "description": "Walking up from Lake Misurina — harder but much less traffic on the lower section.",
                "tips": ["Avoid the paved road — take trail 122 instead", "Try the strudel at Rifugio Locatelli"],
            },
            {
                "name": "Monte Paterno — Normal Route",
                "waypoints": ["Rifugio Locatelli (2405m)", "Trail 104", "Monte Paterno Summit (2744m)", "Rifugio Locatelli"],
                "elevation": 450, "hours": 4,
                "description": "Panoramic summit above Rifugio Locatelli with a direct view of the Three Peaks.",
                "tips": ["Short via ferrata section near the top", "Early morning for the best light on the Three Peaks"],
            },
        ],
        "difficult": [
            {
                "name": "Innerkofler Via Ferrata",
                "waypoints": ["Rifugio Auronzo (2320m)", "Forcella Col di Mezzo", "Ferrata start (2600m)", "Cima Piccola (2857m)", "Rifugio Auronzo"],
                "elevation": 600, "hours": 7,
                "description": "Historic via ferrata on the Cima Piccola, first climbed in 1900. Requires full equipment.",
                "tips": ["Harness, ferrata set and helmet mandatory", "Hire a guide if it is your first via ferrata"],
            },
        ],
    },
    "val pusteria": {
        "easy": [
            {
                "name": "Lake Braies — Full Loop",
                "waypoints": ["Lake Braies (1496m)", "Circular trail", "Rifugio Lago di Braies", "Lakeside cave", "Lake Braies"],
                "elevation": 80, "hours": 1.5,
                "description": "The most photographed lake in the Dolomites. Flat loop through turquoise water and forest.",
                "tips": ["Arrive before 8:00 — it gets very crowded", "Rent a rowing boat for a unique perspective"],
            },
            {
                "name": "Trail of Peace — Dobbiaco Stage",
                "waypoints": ["Dobbiaco (1243m)", "Lake Dobbiaco (1253m)", "Dobbiaco Forest", "Dobbiaco"],
                "elevation": 100, "hours": 2,
                "description": "Historic WWI trail through spruce forests and mirror lakes.",
                "tips": ["Suitable for all, also by bike", "Information boards along the way about the war"],
            },
            {
                "name": "Malga Nemes",
                "waypoints": ["San Candido (1175m)", "Trail 26", "Malga Nemes (1870m)", "San Candido"],
                "elevation": 700, "hours": 3.5,
                "description": "Ascent to a traditional alpine farm with views over Val Pusteria and the Sexten Dolomites.",
                "tips": ["Local cheese and speck served at the farm", "Best early morning — very few tourists"],
            },
        ],
        "moderate": [
            {
                "name": "Rifugio Seekofel",
                "waypoints": ["Lake Braies (1496m)", "Malga Foresta", "Rifugio Seekofel (2327m)", "Lake Braies"],
                "elevation": 850, "hours": 5,
                "description": "Ascent from the lake to the hut with views of the Braies Dolomites. Quiet and uncrowded.",
                "tips": ["Trail 10 — excellent signage", "Carry enough water, no springs on the middle section"],
            },
            {
                "name": "Tre Scarperi — Lakes Loop",
                "waypoints": ["Rifugio Tre Scarperi (1626m)", "Lago Lungo (2013m)", "Lago Rotondo (2093m)", "Rifugio Tre Scarperi"],
                "elevation": 500, "hours": 4.5,
                "description": "Hike in the heart of the Sexten Dolomites past two alpine lakes with peak views.",
                "tips": ["Quiet and rarely crowded", "Chamois sightings are common here"],
            },
        ],
        "difficult": [
            {
                "name": "Croda del Becco",
                "waypoints": ["Lake Braies (1496m)", "Rifugio Biella (2327m)", "Croda del Becco (2810m)", "Return"],
                "elevation": 1320, "hours": 8,
                "description": "Panoramic summit with 360° views of the eastern Dolomites. Final section along a ridge.",
                "tips": ["Stiff mountain boots essential", "Not suitable with overcast skies — storms arrive fast"],
            },
            {
                "name": "Cima Undici — Sexten Dolomites",
                "waypoints": ["Rifugio Tre Scarperi (1626m)", "Trail 102", "Forcella di Cima Undici (2700m)", "Cima Undici (2985m)", "Return"],
                "elevation": 1360, "hours": 8.5,
                "description": "One of the finest summits in the Sexten Dolomites, with a panoramic ridge and views into Austria.",
                "tips": ["Final section exposed — not for those with a fear of heights", "Exceptional visibility on föhn days"],
            },
        ],
    },
    "marmolada": {
        "easy": [
            {
                "name": "Lake Fedaia Walk",
                "waypoints": ["Malga Ciapela (1450m)", "Lake Fedaia (2057m)", "Fedaia Dam", "Malga Ciapela"],
                "elevation": 200, "hours": 2,
                "description": "Stroll to the reservoir at the foot of the Marmolada with views of the glacier.",
                "tips": ["Great glacier view from the dam wall", "The WWI museum at the summit is unmissable — take the cable car"],
            },
            {
                "name": "Rifugio Falier — Out and Back",
                "waypoints": ["Malga Ciapela (1450m)", "Trail 610", "Rifugio Falier (2074m)", "Malga Ciapela"],
                "elevation": 630, "hours": 3.5,
                "description": "Ascent to the historic hut at the foot of the Marmolada's south face.",
                "tips": ["Vertical view up the south face — imposing", "Good base for watching climbers on the wall"],
            },
        ],
        "moderate": [
            {
                "name": "Piaz Equipped Trail",
                "waypoints": ["Rifugio Falier (2074m)", "Marmolada Forcella (2910m)", "Glacier viewpoint", "Rifugio Falier"],
                "elevation": 900, "hours": 6,
                "description": "Via ferrata trail leading to the pass with a direct view of the Marmolada glacier.",
                "tips": ["Fixed cables on steeper sections — gloves useful", "One of the few places to see the glacier up close"],
            },
        ],
        "difficult": [
            {
                "name": "Punta Penia — Summit Ascent",
                "waypoints": ["Malga Ciapela (1450m)", "Rifugio Pian dei Fiacconi (2626m)", "Punta Penia (3343m)", "Return"],
                "elevation": 1900, "hours": 9,
                "description": "The highest peak in the Dolomites. Glacier crossing with ice axe and crampons required.",
                "tips": ["Certified alpine guide mandatory", "Glacier equipment required", "Departure at 4:00 in the morning"],
            },
        ],
    },
    "pale di san martino": {
        "easy": [
            {
                "name": "Colbricon Lakes Loop",
                "waypoints": ["Passo Rolle (1989m)", "Lower Colbricon Lake (1921m)", "Upper Colbricon Lake (1934m)", "Passo Rolle"],
                "elevation": 150, "hours": 2,
                "description": "Two lakes in a Dolomitic amphitheatre. Very easy and popular.",
                "tips": ["One of the few places in Europe with Mesolithic settlement traces", "Try the apple cake at the pass bar"],
            },
            {
                "name": "Rifugio Vezzana",
                "waypoints": ["San Martino di Castrozza (1450m)", "Trail 707", "Malga Ces (1621m)", "Rifugio Vezzana (2100m)", "San Martino"],
                "elevation": 660, "hours": 3.5,
                "description": "Ascent through conifer forest and alpine meadows with views of the Pale.",
                "tips": ["Great at sunset when the Pale turn pink", "Well-marked trail throughout"],
            },
        ],
        "moderate": [
            {
                "name": "Pale Plateau — Base Circuit",
                "waypoints": ["San Martino di Castrozza (1450m)", "Rosetta Cable Car (2609m)", "Rifugio Rosetta (2581m)", "Rifugio Pradidali (2278m)", "San Martino"],
                "elevation": 800, "hours": 6,
                "description": "The Pale plateau is one of the most lunar and unique landscapes in the entire Dolomites.",
                "tips": ["The cable car saves a lot of climbing", "The plateau looks like the moon — navigation tricky, use a map and GPS", "Rifugio Pradidali has excellent food"],
            },
        ],
        "difficult": [
            {
                "name": "Cima della Vezzana",
                "waypoints": ["San Martino (1450m)", "Rifugio Rosetta (2581m)", "Pale Plateau", "Cima della Vezzana (3192m)", "Return"],
                "elevation": 1750, "hours": 9,
                "description": "The highest peak of the Pale di San Martino. Crossing the karst plateau with an alpine final section.",
                "tips": ["Alpine experience required", "GPS essential on the plateau — fog arrives suddenly", "Very early start"],
            },
        ],
    },
    "cortina d'ampezzo": {
        "easy": [
            {
                "name": "Lake Ghedina",
                "waypoints": ["Cortina (1224m)", "Trail 401", "Lake Ghedina (1474m)", "Cortina"],
                "elevation": 260, "hours": 2,
                "description": "A small glacial lake hidden in the forest above Cortina, little known to tourists.",
                "tips": ["Great for a swim in summer — cold but crystal clear", "Forest trail — also pleasant in hot weather"],
            },
            {
                "name": "Cinque Torri Hike",
                "waypoints": ["Bai de Dones (1750m)", "Rifugio Cinque Torri (2137m)", "WWI Open Air Museum", "Bai de Dones"],
                "elevation": 390, "hours": 2.5,
                "description": "Ascent to the iconic Five Towers with an open air WWI museum on site.",
                "tips": ["The Five Towers are a rock climbing paradise", "The WWI museum is very well curated"],
            },
            {
                "name": "Ra Gusela Loop",
                "waypoints": ["Passo Giau (2236m)", "Forcella Giau (2360m)", "Rifugio Fedare (2010m)", "Passo Giau"],
                "elevation": 300, "hours": 2.5,
                "description": "Panoramic walk around the distinctive rock tower of Ra Gusela.",
                "tips": ["Passo Giau is one of the most photographed passes in the Dolomites", "Bring a wide-angle lens"],
            },
        ],
        "moderate": [
            {
                "name": "Rifugio Nuvolau — Averau",
                "waypoints": ["Passo Falzarego (2105m)", "Rifugio Averau (2413m)", "Rifugio Nuvolau (2575m)", "Passo Falzarego"],
                "elevation": 600, "hours": 4.5,
                "description": "Rifugio Nuvolau is the oldest hut in the Dolomites (1883). 360° panorama over all the main peaks.",
                "tips": ["One of the finest views in the entire Dolomites", "Book lunch in advance in summer"],
            },
            {
                "name": "Lake Sorapiss",
                "waypoints": ["Passo Tre Croci (1809m)", "Rifugio Vandelli (1928m)", "Lake Sorapiss (2000m)", "Passo Tre Croci"],
                "elevation": 650, "hours": 5,
                "description": "Lake Sorapiss has a unique turquoise colour caused by suspended glacial flour in the water.",
                "tips": ["Best colour in July–August", "Exposed section just before the lake — take care"],
            },
        ],
        "difficult": [
            {
                "name": "Lipella Via Ferrata — Tofana di Rozes",
                "waypoints": ["Passo Falzarego (2105m)", "Rifugio Giussani (2580m)", "Ferrata start (2700m)", "Tofana di Rozes (3225m)", "Return"],
                "elevation": 1150, "hours": 8,
                "description": "One of the most famous via ferratas in the Dolomites on the Tofana di Rozes, with breathtaking vertical sections.",
                "tips": ["Full kit required", "Long — allow at least 8 hours", "Never attempt when wet"],
            },
        ],
    },
    "dolomiti di brenta": {
        "easy": [
            {
                "name": "Lake Tovel",
                "waypoints": ["Tovel car park (1178m)", "Lake circuit", "Malga Tovel (1350m)", "Car park"],
                "elevation": 180, "hours": 2,
                "description": "An emerald-green lake in the heart of the Adamello Brenta Natural Park. Once turned blood red.",
                "tips": ["Protected area — swimming is not allowed", "Brown bears present — do not leave food unattended"],
            },
            {
                "name": "Rifugio Tuckett",
                "waypoints": ["Madonna di Campiglio (1522m)", "Grostè Cable Car", "Rifugio Tuckett (2272m)", "Madonna di Campiglio"],
                "elevation": 350, "hours": 3,
                "description": "Panoramic trail in the heart of the Brenta Dolomites with views of the Pale di Campiglio.",
                "tips": ["Use the Grostè cable car on the way up", "Ibex are often spotted here"],
            },
        ],
        "moderate": [
            {
                "name": "Bocca di Brenta — Rifugio Brentei",
                "waypoints": ["Madonna di Campiglio (1522m)", "Rifugio Casinei (1825m)", "Rifugio Brentei (2182m)", "Bocca di Brenta (2552m)", "Return"],
                "elevation": 1040, "hours": 6,
                "description": "The heart of the Brenta Dolomites, where the vertical walls of the Crozzon loom overhead.",
                "tips": ["Rifugio Brentei is historic and serves excellent Trentino food", "Watch the walls — climbers frequent them"],
            },
        ],
        "difficult": [
            {
                "name": "Via delle Bocchette Centrali",
                "waypoints": ["Madonna di Campiglio (1522m)", "Rifugio Tuckett (2272m)", "Bocchetta del Tuckett (2648m)", "Bocca degli Armi (2744m)", "Rifugio Brentei (2182m)", "Madonna di Campiglio"],
                "elevation": 1300, "hours": 9,
                "description": "The most spectacular via ferrata route in the Brenta Dolomites. Airy and vertiginous sections throughout.",
                "tips": ["Full via ferrata kit mandatory", "One of the most exciting experiences in the Dolomites", "Take your time — many sections require full attention"],
            },
        ],
    },
    "agordino e civetta": {
        "easy": [
            {
                "name": "Gnome Trail — Alleghe",
                "waypoints": ["Alleghe (979m)", "Lake Alleghe", "Gnome Trail", "Caprile (1006m)"],
                "elevation": 200, "hours": 2,
                "description": "A themed trail along Lake Alleghe with gnome sculptures in the forest — beloved by children.",
                "tips": ["Perfect for families with young children", "Lake Alleghe was created by a landslide in 1771"],
            },
            {
                "name": "Lake Alleghe Loop",
                "waypoints": ["Alleghe (979m)", "North shore", "Masare (1005m)", "South shore", "Alleghe"],
                "elevation": 80, "hours": 1.5,
                "description": "Flat walk around the lake with views of the Civetta.",
                "tips": ["Beautiful in every season", "At sunset the Civetta turns deep red"],
            },
        ],
        "moderate": [
            {
                "name": "Rifugio Coldai — Coldai Lake",
                "waypoints": ["Alleghe (979m)", "Coldai cable car", "Rifugio Coldai (2132m)", "Coldai Lake (2143m)", "Alleghe"],
                "elevation": 700, "hours": 5,
                "description": "Views of the north-west face of the Civetta, one of the largest rock walls in Europe.",
                "tips": ["The Civetta face is 1200m high — awe-inspiring", "Coldai Lake is a great picnic spot"],
            },
        ],
        "difficult": [
            {
                "name": "Alleghesi Via Ferrata — Civetta",
                "waypoints": ["Alleghe (979m)", "Rifugio Tissi (2250m)", "Alleghesi Ferrata", "Rifugio Torrani (2984m)", "Return"],
                "elevation": 2000, "hours": 10,
                "description": "Long and demanding via ferrata on the Civetta face. One of the most beautiful and hardest in the Dolomites.",
                "tips": ["Experienced hikers only", "Overnight at Rifugio Torrani strongly recommended", "Full via ferrata equipment required"],
            },
        ],
    },
    "val di zoldo": {
        "easy": [
            {
                "name": "Rifugio Pralongo",
                "waypoints": ["Forno di Zoldo (848m)", "Trail 476", "Rifugio Pralongo (1750m)", "Forno di Zoldo"],
                "elevation": 900, "hours": 4,
                "description": "A quiet and little-touristed valley with views of the Pelmo and Civetta. Authentic and crowd-free.",
                "tips": ["One of the least known valleys — genuine atmosphere", "Great for those wanting to escape the crowds"],
            },
        ],
        "moderate": [
            {
                "name": "Monte Pelmo — Approach",
                "waypoints": ["Zoldo Alto (1177m)", "Rifugio Venezia (1946m)", "Forcella Val d'Arcia (2476m)", "Zoldo Alto"],
                "elevation": 1300, "hours": 7,
                "description": "Approach to the majestic Monte Pelmo, nicknamed the Carozzon for its throne-like shape.",
                "tips": ["The Pelmo is one of the most beautiful to look at — imposing and solitary", "Rifugio Venezia is an excellent rest stop"],
            },
        ],
        "difficult": [
            {
                "name": "Monte Pelmo — Normal Route",
                "waypoints": ["Zoldo Alto (1177m)", "Rifugio Venezia (1946m)", "Forcella Val d'Arcia (2476m)", "Monte Pelmo (3168m)", "Return"],
                "elevation": 2000, "hours": 10,
                "description": "One of the finest ascents in the Dolomites on an isolated and majestic peak. Final section on a ridge.",
                "tips": ["Long and demanding — depart at 5:00", "Final section exposed — not for those afraid of heights", "Outstanding panoramic summit"],
            },
        ],
    },
}

ZONES = list(ITINERARIES.keys())
DIFFICULTY_LEVELS = ["easy", "moderate", "difficult"]
HOURS_BY_DIFFICULTY = {
    "easy":     {"min": 1,  "max": 4},
    "moderate": {"min": 3,  "max": 7},
    "difficult":{"min": 5,  "max": 10},
}

RESET  = "\033[0m"
BOLD   = "\033[1m"
GREEN  = "\033[32m"
CYAN   = "\033[36m"
YELLOW = "\033[33m"
DIM    = "\033[2m"

def cls():
    print("\033[2J\033[H", end="")

def header():
    print(f"""
{GREEN}{BOLD}
  ██████╗  ██████╗ ██╗      ██████╗ ███╗   ███╗██╗████████╗███████╗███████╗
  ██╔══██╗██╔═══██╗██║     ██╔═══██╗████╗ ████║██║╚══██╔══╝██╔════╝██╔════╝
  ██║  ██║██║   ██║██║     ██║   ██║██╔████╔██║██║   ██║   █████╗  ███████╗
  ██║  ██║██║   ██║██║     ██║   ██║██║╚██╔╝██║██║   ██║   ██╔══╝  ╚════██║
  ██████╔╝╚██████╔╝███████╗╚██████╔╝██║ ╚═╝ ██║██║   ██║   ███████╗███████║
  ╚═════╝  ╚═════╝ ╚══════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝   ╚═╝   ╚══════╝╚══════╝
{RESET}{CYAN}              🏔  Dolomites Hiking Itinerary Generator  🏔{RESET}
""")

def divider(char="─", n=60):
    print(f"{DIM}{char * n}{RESET}")

def menu(title, options):
    print(f"\n{BOLD}{title}{RESET}")
    divider()
    for i, opt in enumerate(options, 1):
        print(f"  {CYAN}{i}{RESET}. {opt}")
    divider()
    while True:
        try:
            choice = int(input(f"{YELLOW}▶ Choose (1-{len(options)}): {RESET}"))
            if 1 <= choice <= len(options):
                return options[choice - 1]
        except (ValueError, KeyboardInterrupt):
            pass
        print(f"  {DIM}Please enter a number between 1 and {len(options)}{RESET}")

def ask_hours(difficulty):
    limits = HOURS_BY_DIFFICULTY[difficulty]
    print(f"\n{BOLD}How many hours do you have available?{RESET}")
    divider()
    print(f"  {DIM}For '{difficulty}' hikes: recommended {limits['min']}–{limits['max']} hours{RESET}")
    divider()
    while True:
        try:
            hours = float(input(f"{YELLOW}▶ Available hours: {RESET}"))
            if 0.5 <= hours <= 12:
                return hours
        except (ValueError, KeyboardInterrupt):
            pass
        print(f"  {DIM}Please enter a value between 0.5 and 12{RESET}")

def find_itinerary(zone, difficulty, hours):
    candidates = ITINERARIES.get(zone, {}).get(difficulty, [])
    if not candidates:
        return None
    matching = [it for it in candidates if abs(it["hours"] - hours) <= 2]
    if not matching:
        matching = sorted(candidates, key=lambda x: abs(x["hours"] - hours))
    return random.choice(matching)

def print_itinerary(it, zone, difficulty):
    cls()
    header()
    print(f"\n{GREEN}{BOLD}  🗺  {it['name']}{RESET}")
    divider("═")
    print(f"\n  {BOLD}📍 Area:{RESET}         {zone.title()}")
    print(f"  {BOLD}⚡ Difficulty:{RESET}    {difficulty.title()}")
    print(f"  {BOLD}⏱  Duration:{RESET}     approx. {it['hours']} hours")
    print(f"  {BOLD}📈 Elevation:{RESET}    +{it['elevation']} m")
    print(f"\n  {BOLD}Waypoints:{RESET}")
    for i, wp in enumerate(it["waypoints"]):
        arrow = "└─" if i == len(it["waypoints"]) - 1 else "├─"
        print(f"    {DIM}{arrow}{RESET} {wp}")
    print(f"\n  {BOLD}Description:{RESET}")
    for line in textwrap.wrap(it["description"], width=56):
        print(f"    {line}")
    print(f"\n  {BOLD}Practical tips:{RESET}")
    for tip in it["tips"]:
        print(f"    {GREEN}✓{RESET} {tip}")
    divider()
    print(f"\n  {DIM}Have a great hike! Always bring water, food and a warm layer.{RESET}\n")

def main():
    cls()
    header()

    zone_label = menu("Which area do you want to start from?", [z.title() for z in ZONES])
    zone = zone_label.lower()

    difficulty = menu("Difficulty level", DIFFICULTY_LEVELS)

    hours = ask_hours(difficulty)

    it = find_itinerary(zone, difficulty, hours)

    if not it:
        print(f"\n  {YELLOW}No itinerary found for this combination. Try changing the area or difficulty.{RESET}\n")
        return

    print_itinerary(it, zone, difficulty)

    input(f"  {DIM}Press ENTER for another itinerary or Ctrl+C to quit...{RESET}")
    main()

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n\n  {GREEN}Goodbye! Happy hiking 🏔{RESET}\n")
