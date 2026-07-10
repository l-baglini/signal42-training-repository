const lesson1 = {
  id: 'a1-01',
  level: 'A1',
  order: 1,
  title: 'The Spanish Alphabet',
  description: 'Learn the 27 letters of the Spanish alphabet, their names, and how to pronounce them. Discover the special characters unique to Spanish.',
  estimatedTime: '15 min',
  icon: '🔤',
  content: [
    {
      type: 'text',
      text: 'The Spanish alphabet (el alfabeto) has 27 letters. It is very similar to the English alphabet, but it includes the special letter ñ. Spanish spelling is highly phonetic, meaning words are almost always pronounced exactly as they are written.'
    },
    {
      type: 'table',
      headers: ['Letter', 'Name in Spanish', 'Pronunciation hint'],
      rows: [
        ['a', 'a', 'like "a" in "father"'],
        ['b', 'be', 'like English "b", soft between vowels'],
        ['c', 'ce', '"k" before a/o/u; "s" before e/i (Latin America) or "th" (Spain)'],
        ['d', 'de', 'like "d"; softer between vowels, like English "th" in "the"'],
        ['e', 'e', 'like "e" in "bed"'],
        ['f', 'efe', 'like English "f"'],
        ['g', 'ge', '"g" in "go" before a/o/u; harsh "h" before e/i'],
        ['h', 'hache', 'always silent'],
        ['i', 'i', 'like "ee" in "see"'],
        ['j', 'jota', 'harsh "h" sound, like clearing your throat'],
        ['k', 'ka', 'like English "k"; mostly in foreign words'],
        ['l', 'ele', 'like English "l"'],
        ['m', 'eme', 'like English "m"'],
        ['n', 'ene', 'like English "n"'],
        ['ñ', 'eñe', 'like "ny" in "canyon"'],
        ['o', 'o', 'like "o" in "go"'],
        ['p', 'pe', 'like English "p" but without the puff of air'],
        ['q', 'cu', 'always followed by "ue" or "ui"; sounds like "k"'],
        ['r', 'erre', 'single tap of tongue; rolled at start of word or as "rr"'],
        ['s', 'ese', 'like English "s"'],
        ['t', 'te', 'like English "t" but without the puff of air'],
        ['u', 'u', 'like "oo" in "food"'],
        ['v', 'uve', 'identical to "b" in modern Spanish'],
        ['w', 'doble uve', 'like English "w"; only in foreign words'],
        ['x', 'equis', 'usually like "ks"; "h" in some words of Nahuatl origin'],
        ['y', 'ye', 'like English "y"; as a vowel, like "i"'],
        ['z', 'zeta', 'like "s" (Latin America) or "th" in "think" (Spain)']
      ]
    },
    {
      type: 'rule',
      title: 'Special Letter: Ñ',
      text: 'The letter ñ is unique to Spanish and essential to the language. It sounds like the "ny" in "canyon" or the "ni" in "onion". Examples: España (Spain), mañana (tomorrow), niño (boy).'
    },
    {
      type: 'rule',
      title: 'Double Letters: RR and LL',
      text: 'The combination "rr" represents a strongly trilled r sound — the tongue vibrates multiple times against the roof of the mouth. Examples: perro (dog), carro (car). The combination "ll" traditionally had its own sound, but in most modern Spanish it sounds like "y" in "yes". Examples: llama, calle (street).'
    },
    {
      type: 'tip',
      text: 'The letter H is always silent in Spanish. "Hola" is pronounced "OH-lah", not "HOH-lah". Never pronounce the H!'
    },
    {
      type: 'rule',
      title: 'Accent Marks',
      text: 'Spanish uses accent marks (tildes) over vowels: á, é, í, ó, ú. Accents serve two purposes: (1) they shift the stress to that syllable when it would otherwise fall elsewhere, and (2) they distinguish between words that are spelled the same but have different meanings, like "el" (the) vs "él" (he). The letter ü appears in güe/güi to indicate the u is pronounced.'
    },
    {
      type: 'examples',
      items: [
        { spanish: 'café', english: 'coffee', note: 'accent on final syllable' },
        { spanish: 'mamá', english: 'mom', note: 'accent shifts stress to last syllable' },
        { spanish: 'el / él', english: 'the / he', note: 'accent distinguishes meaning' },
        { spanish: 'si / sí', english: 'if / yes', note: 'accent distinguishes meaning' },
        { spanish: 'pingüino', english: 'penguin', note: 'ü indicates the u is pronounced' }
      ]
    },
    {
      type: 'warning',
      text: 'Do not confuse b and v — they are pronounced identically in Spanish. Also, c and z both make an "s" sound in Latin America, but in Spain they use a "th" sound for c (before e/i) and z.'
    }
  ],
  exercises: [
    {
      id: 'a1-01-ex-01',
      type: 'multiple-choice',
      question: 'How is the letter "h" pronounced in Spanish?',
      options: ['Like English "h" in "hello"', 'It is always silent', 'Like the Spanish "j"', 'Like a soft "g"'],
      correct: 1,
      explanation: 'The letter H is always silent in Spanish. For example, "hola" is pronounced "OH-lah" with no h sound at all.'
    },
    {
      id: 'a1-01-ex-02',
      type: 'multiple-choice',
      question: 'Which letter is unique to the Spanish alphabet and not found in the English alphabet?',
      options: ['ll', 'rr', 'ñ', 'ü'],
      correct: 2,
      explanation: 'The letter ñ (eñe) is unique to the Spanish alphabet. It sounds like the "ny" in "canyon". Examples: España, mañana, niño.'
    },
    {
      id: 'a1-01-ex-03',
      type: 'fill-blank',
      template: 'The word "España" contains the special Spanish letter ___.',
      answer: 'ñ',
      explanation: 'The ñ in "España" sounds like "ny" — so España is pronounced "es-PAN-ya". This letter is one of the most recognizable features of the Spanish alphabet.'
    },
    {
      id: 'a1-01-ex-04',
      type: 'translate',
      source: 'tomorrow',
      answer: 'mañana',
      direction: 'en-es',
      explanation: '"Mañana" means "tomorrow" and also "morning". It contains the ñ, pronounced "man-YAH-nah". Notice the silent... wait, there is no H here — all letters are pronounced except H when it appears.'
    },
    {
      id: 'a1-01-ex-05',
      type: 'translate',
      source: 'perro',
      answer: 'dog',
      direction: 'es-en',
      explanation: '"Perro" means "dog". Notice the double r (rr), which requires a strong trill — the tongue vibrates rapidly against the roof of the mouth. This is different from the single r in "pero" (but).'
    }
  ]
}

const lesson2 = {
  id: 'a1-02',
  level: 'A1',
  order: 2,
  title: 'Numbers 0–100',
  description: 'Master counting in Spanish from zero to one hundred. Learn the patterns that make building large numbers easy.',
  estimatedTime: '20 min',
  icon: '🔢',
  content: [
    {
      type: 'text',
      text: 'Numbers (los números) are essential for everyday communication — shopping, telling time, giving your phone number, or describing quantities. Spanish numbers follow clear patterns once you learn the basics.'
    },
    {
      type: 'table',
      headers: ['Number', 'Spanish', 'Phonetic guide'],
      rows: [
        ['0', 'cero', 'SEH-roh'],
        ['1', 'uno', 'OO-noh'],
        ['2', 'dos', 'dohs'],
        ['3', 'tres', 'trehs'],
        ['4', 'cuatro', 'KWAH-troh'],
        ['5', 'cinco', 'SEEN-koh'],
        ['6', 'seis', 'SAYS'],
        ['7', 'siete', 'SYEH-teh'],
        ['8', 'ocho', 'OH-choh'],
        ['9', 'nueve', 'NWEH-beh'],
        ['10', 'diez', 'dyehs'],
        ['11', 'once', 'OHN-seh'],
        ['12', 'doce', 'DOH-seh'],
        ['13', 'trece', 'TREH-seh'],
        ['14', 'catorce', 'kah-TOR-seh'],
        ['15', 'quince', 'KEEN-seh'],
        ['16', 'dieciséis', 'dyeh-see-SAYS'],
        ['17', 'diecisiete', 'dyeh-see-SYEH-teh'],
        ['18', 'dieciocho', 'dyeh-see-OH-choh'],
        ['19', 'diecinueve', 'dyeh-see-NWEH-beh'],
        ['20', 'veinte', 'BAYN-teh'],
        ['21', 'veintiuno', 'bayn-tee-OO-noh'],
        ['22', 'veintidós', 'bayn-tee-DOHS'],
        ['30', 'treinta', 'TRAYN-tah'],
        ['40', 'cuarenta', 'kwah-REHN-tah'],
        ['50', 'cincuenta', 'seen-KWEHN-tah'],
        ['60', 'sesenta', 'seh-SEHN-tah'],
        ['70', 'setenta', 'seh-TEHN-tah'],
        ['80', 'ochenta', 'oh-CHEHN-tah'],
        ['90', 'noventa', 'noh-BEHN-tah'],
        ['100', 'cien', 'syehn']
      ]
    },
    {
      type: 'rule',
      title: 'Numbers 16–19: Contracted Compounds',
      text: 'Numbers 16–19 are written as single words formed by combining "diez" (ten) + "y" (and) + the unit: dieciséis (16), diecisiete (17), dieciocho (18), diecinueve (19). Notice that "diez y seis" contracts to "dieciséis" — written as one word with an accent mark.'
    },
    {
      type: 'rule',
      title: 'Numbers 21–29: Veinti- prefix',
      text: 'Numbers 21–29 use the prefix "veinti-" followed by the unit, written as one word: veintiuno (21), veintidós (22), veintitrés (23), veinticuatro (24), veinticinco (25), veintiséis (26), veintisiete (27), veintiocho (28), veintinueve (29). Note: veintiún (21) is used before masculine nouns.'
    },
    {
      type: 'rule',
      title: 'Numbers 31 and above: Y pattern',
      text: 'From 31 onward, compound numbers are written as separate words using "y" (and): treinta y uno (31), treinta y dos (32), cuarenta y cinco (45), ochenta y nueve (89). The pattern is: tens + y + units.'
    },
    {
      type: 'examples',
      items: [
        { spanish: 'Tengo veintidós años.', english: 'I am twenty-two years old.', note: 'veintidós — written as one word' },
        { spanish: 'Son las tres y cuarto.', english: 'It is quarter past three.', note: 'cuarto = quarter in time expressions' },
        { spanish: 'El libro cuesta quince euros.', english: 'The book costs fifteen euros.' },
        { spanish: 'Hay treinta y uno días en marzo.', english: 'There are thirty-one days in March.', note: 'separate words from 31 onward' },
        { spanish: 'Mi número de teléfono es el cero ocho cero...', english: 'My phone number is zero eight zero...', note: 'phone numbers are read digit by digit' }
      ]
    },
    {
      type: 'tip',
      text: 'Uno becomes "un" before a masculine noun and "una" before a feminine noun: "un libro" (one book), "una mesa" (one table). This also applies to compound numbers ending in 1: veintiún libros, veintiuna mesas.'
    }
  ],
  exercises: [
    {
      id: 'a1-02-ex-01',
      type: 'multiple-choice',
      question: 'How do you say 47 in Spanish?',
      options: ['cuarenta y siete', 'cuatro y siete', 'cuarentaisiete', 'cuarenta siete'],
      correct: 0,
      explanation: '47 = cuarenta (40) + y + siete (7) = "cuarenta y siete". From 31 onward, compound numbers use the pattern: tens + y + units, written as separate words.'
    },
    {
      id: 'a1-02-ex-02',
      type: 'multiple-choice',
      question: 'Which of these is the correct spelling of 26?',
      options: ['veinte y seis', 'veintiseis', 'veintiséis', 'veinti seis'],
      correct: 2,
      explanation: '26 is "veintiséis" — a single word with an accent mark on the é. Numbers 21–29 are written as one word with the "veinti-" prefix. The accent distinguishes it from "veinte" + "seis".'
    },
    {
      id: 'a1-02-ex-03',
      type: 'fill-blank',
      template: 'El año tiene ___ meses.',
      answer: 'doce',
      explanation: 'A year has 12 months — "doce meses". Doce (12) is one of the individually memorized numbers. El año tiene doce meses.'
    },
    {
      id: 'a1-02-ex-04',
      type: 'translate',
      source: 'I have thirty-five books.',
      answer: 'Tengo treinta y cinco libros.',
      direction: 'en-es',
      explanation: '"Treinta y cinco" (35) follows the pattern for numbers 31+: tens + y + units, written as three separate words. "Tengo" means "I have" and "libros" means "books".'
    },
    {
      id: 'a1-02-ex-05',
      type: 'translate',
      source: 'cien personas',
      answer: 'one hundred people',
      direction: 'es-en',
      explanation: '"Cien" is exactly 100. Note that "cien" becomes "ciento" when followed by additional numbers: ciento uno (101), ciento veinte (120). But for exactly 100, use "cien".'
    }
  ]
}

const lesson3 = {
  id: 'a1-03',
  level: 'A1',
  order: 3,
  title: 'Articles: el, la, un, una',
  description: 'Learn how Spanish articles agree with nouns in gender and number. Understand the difference between definite and indefinite articles.',
  estimatedTime: '20 min',
  icon: '📝',
  content: [
    {
      type: 'text',
      text: 'In Spanish, every noun has a grammatical gender — masculine or feminine. Articles must match the gender (masculine/feminine) and number (singular/plural) of the noun they accompany. This is called agreement (concordancia).'
    },
    {
      type: 'rule',
      title: 'Definite Articles (the)',
      text: 'Definite articles refer to specific, known things. They are: el (masculine singular), la (feminine singular), los (masculine plural), las (feminine plural). Use them when talking about something specific or something already known to the speaker and listener.'
    },
    {
      type: 'table',
      headers: ['', 'Singular', 'Plural'],
      rows: [
        ['Masculine', 'el — el libro (the book)', 'los — los libros (the books)'],
        ['Feminine', 'la — la mesa (the table)', 'las — las mesas (the tables)']
      ]
    },
    {
      type: 'rule',
      title: 'Indefinite Articles (a / an / some)',
      text: 'Indefinite articles refer to non-specific things. They are: un (masculine singular), una (feminine singular), unos (masculine plural), unas (feminine plural). Use them when introducing something for the first time or referring to one of many.'
    },
    {
      type: 'table',
      headers: ['', 'Singular', 'Plural'],
      rows: [
        ['Masculine', 'un — un coche (a car)', 'unos — unos coches (some cars)'],
        ['Feminine', 'una — una casa (a house)', 'unas — unas casas (some houses)']
      ]
    },
    {
      type: 'rule',
      title: 'Noun Gender Rules',
      text: 'Most nouns ending in -o are masculine (el libro, el banco, el vino) and most ending in -a are feminine (la casa, la mesa, la ventana). However, there are important exceptions. Nouns ending in -ción, -sión, -dad, -tad, -tud, -umbre are always feminine. Nouns ending in -ema, -oma, -ama are usually masculine (el problema, el idioma, el programa).'
    },
    {
      type: 'examples',
      items: [
        { spanish: 'el problema', english: 'the problem', note: 'ends in -a but is masculine' },
        { spanish: 'la mano', english: 'the hand', note: 'ends in -o but is feminine' },
        { spanish: 'la ciudad', english: 'the city', note: 'nouns in -dad are feminine' },
        { spanish: 'la canción', english: 'the song', note: 'nouns in -ción are feminine' },
        { spanish: 'el idioma', english: 'the language', note: 'Greek-origin -ma nouns are masculine' }
      ]
    },
    {
      type: 'rule',
      title: 'Special Rule: Feminine Nouns Starting with Stressed A-',
      text: 'Feminine nouns that begin with a stressed "a" or "ha" use "el" in the singular (not "la") to avoid awkward pronunciation: el agua (water), el águila (eagle), el hacha (axe). In plural, they revert to "las": las aguas, las águilas.'
    },
    {
      type: 'table',
      headers: ['Spanish', 'English', 'Article type', 'Notes'],
      rows: [
        ['el estudiante / la estudiante', 'the student (m/f)', 'definite', 'same noun, different article for gender'],
        ['un hombre / una mujer', 'a man / a woman', 'indefinite', 'different nouns for each gender'],
        ['los niños', 'the children / the boys', 'definite plural', 'masculine plural can include both genders'],
        ['unas flores', 'some flowers', 'indefinite plural', 'flores is feminine: la flor → las flores']
      ]
    },
    {
      type: 'tip',
      text: 'When you learn a new noun, always learn it with its article. Do not just memorize "libro" — memorize "el libro". This way, gender becomes automatic over time.'
    },
    {
      type: 'warning',
      text: 'Do not confuse "el" (the, masculine article) with "él" (he, subject pronoun). The accent mark on "él" makes all the difference! "El libro es de él." = "The book is his."'
    }
  ],
  exercises: [
    {
      id: 'a1-03-ex-01',
      type: 'multiple-choice',
      question: 'Which article goes with "problema" (problem)?',
      options: ['la problema', 'el problema', 'lo problema', 'un problema is wrong'],
      correct: 1,
      explanation: '"Problema" ends in -a but is masculine (it comes from Greek). The correct form is "el problema". Similarly: el idioma, el programa, el tema, el sistema are all masculine despite ending in -a.'
    },
    {
      id: 'a1-03-ex-02',
      type: 'multiple-choice',
      question: 'What is the plural of "la canción" (the song)?',
      options: ['las canciones', 'los canciones', 'las cancións', 'la canciones'],
      correct: 0,
      explanation: '"Canción" is feminine, so it uses "las" in the plural. Nouns ending in -ión drop the accent in the plural and add -es: canción → canciones. So: las canciones.'
    },
    {
      id: 'a1-03-ex-03',
      type: 'fill-blank',
      template: 'Necesito ___ libro para la clase.',
      answer: 'un',
      explanation: '"Libro" is masculine singular, so the indefinite article is "un". The sentence means "I need a book for class." We use the indefinite article because we are not referring to a specific book.'
    },
    {
      id: 'a1-03-ex-04',
      type: 'translate',
      source: 'the houses',
      answer: 'las casas',
      direction: 'en-es',
      explanation: '"Casa" (house) is feminine. The definite article for feminine plural is "las". To form the plural, add -s to "casa" → "casas". Result: las casas.'
    },
    {
      id: 'a1-03-ex-05',
      type: 'translate',
      source: 'los estudiantes trabajan mucho',
      answer: 'the students work a lot',
      direction: 'es-en',
      explanation: '"Los estudiantes" = "the students" (masculine/mixed plural). "Trabajan" is the third-person plural of "trabajar" (to work). "Mucho" = "a lot". Note that "los estudiantes" can refer to a mixed group of male and female students.'
    }
  ]
}

const lesson4 = {
  id: 'a1-04',
  level: 'A1',
  order: 4,
  title: 'Subject Pronouns',
  description: 'Learn the Spanish subject pronouns and when to use them. Understand the distinction between formal and informal address.',
  estimatedTime: '15 min',
  icon: '👤',
  content: [
    {
      type: 'text',
      text: 'Subject pronouns (los pronombres personales) tell us who is performing the action of the verb. Unlike English, Spanish often omits subject pronouns because the verb ending already indicates who the subject is. However, they are used for emphasis, clarity, or contrast.'
    },
    {
      type: 'table',
      headers: ['Person', 'Spanish', 'English', 'Notes'],
      rows: [
        ['1st singular', 'yo', 'I', 'always lowercase in Spanish'],
        ['2nd singular informal', 'tú', 'you (informal)', 'accent mark distinguishes from "tu" (your)'],
        ['2nd singular formal', 'usted', 'you (formal)', 'abbreviated Ud. or Vd.; uses 3rd person verb'],
        ['3rd singular masculine', 'él', 'he', 'accent mark distinguishes from "el" (the)'],
        ['3rd singular feminine', 'ella', 'she', ''],
        ['1st plural masculine/mixed', 'nosotros', 'we (m/mixed)', ''],
        ['1st plural feminine', 'nosotras', 'we (f)', 'used when ALL members of the group are female'],
        ['2nd plural Spain informal', 'vosotros', 'you all (Spain)', 'only used in Spain'],
        ['2nd plural Spain feminine', 'vosotras', 'you all f (Spain)', 'only used in Spain, all-female group'],
        ['2nd plural formal / Latin Am.', 'ustedes', 'you all / you (formal pl)', 'abbreviated Uds.; uses 3rd person plural verb'],
        ['3rd plural masculine/mixed', 'ellos', 'they (m/mixed)', ''],
        ['3rd plural feminine', 'ellas', 'they (f)', 'used when ALL members of the group are female']
      ]
    },
    {
      type: 'rule',
      title: 'Tú vs. Usted: Formal and Informal Address',
      text: 'Use "tú" with friends, family, children, peers, and people you know well. Use "usted" with strangers, elderly people, authority figures, or in formal/professional situations. "Usted" conjugates with third-person singular verb forms (the same as él/ella). When in doubt, start with "usted" — it is always polite, and native speakers will often invite you to use "tú".'
    },
    {
      type: 'rule',
      title: 'Vosotros vs. Ustedes: Regional Variation',
      text: 'In Spain, "vosotros/vosotras" is the informal second-person plural (talking to a group of friends). In Latin America, this form does not exist — "ustedes" is used for all second-person plural situations, both formal and informal. If you are learning for Latin American contexts, you only need to learn "ustedes".'
    },
    {
      type: 'examples',
      items: [
        { spanish: 'Yo hablo español.', english: 'I speak Spanish.', note: '"Yo" is optional but adds emphasis' },
        { spanish: '¿Tú hablas inglés?', english: 'Do you speak English? (informal)', note: 'tú used with a friend' },
        { spanish: '¿Usted habla inglés?', english: 'Do you speak English? (formal)', note: 'usted used with a stranger or superior' },
        { spanish: 'Nosotras estudiamos juntas.', english: 'We study together.', note: 'nosotras indicates an all-female group' },
        { spanish: 'Ellos son de México.', english: 'They are from Mexico.', note: 'ellos for a mixed or all-male group' }
      ]
    },
    {
      type: 'tip',
      text: 'Spanish verb endings are so distinctive that subject pronouns are often dropped. "Hablo español" (I speak Spanish) is more natural than "Yo hablo español". Add the pronoun for emphasis: "Yo hablo español, pero tú no." (I speak Spanish, but you do not.)'
    },
    {
      type: 'warning',
      text: 'In Spanish, "yo" is NEVER capitalized (unlike English "I"), unless it begins a sentence — and even then it is because of the sentence-initial capitalization rule, not because it is a special word.'
    }
  ],
  exercises: [
    {
      id: 'a1-04-ex-01',
      type: 'multiple-choice',
      question: 'You are meeting your boss for the first time. Which pronoun do you use when addressing them?',
      options: ['tú', 'vosotros', 'usted', 'ustedes'],
      correct: 2,
      explanation: 'Use "usted" in formal situations — with strangers, authority figures, elderly people, or in professional settings. "Tú" is for people you know well. "Usted" shows respect and is always the safe choice when in doubt.'
    },
    {
      id: 'a1-04-ex-02',
      type: 'multiple-choice',
      question: 'Which pronoun do speakers in Latin America use to address a group of friends?',
      options: ['vosotros', 'ustedes', 'ellos', 'nosotros'],
      correct: 1,
      explanation: 'In Latin America, "vosotros" is not used at all. "Ustedes" serves as the second-person plural for both formal and informal contexts. "Vosotros" is only used in Spain for informal address to a group.'
    },
    {
      id: 'a1-04-ex-03',
      type: 'fill-blank',
      template: '___ somos estudiantes de español.',
      answer: 'Nosotros',
      explanation: '"Nosotros" means "we" (masculine or mixed group). The sentence means "We are Spanish students." If the group were all female, you would use "Nosotras".'
    },
    {
      id: 'a1-04-ex-04',
      type: 'translate',
      source: 'she and I',
      answer: 'ella y yo',
      direction: 'en-es',
      explanation: 'In Spanish, the first-person pronoun "yo" comes LAST in combinations, unlike English where "I" comes first. So "she and I" = "ella y yo", not "yo y ella". This is a matter of politeness in Spanish grammar.'
    },
    {
      id: 'a1-04-ex-05',
      type: 'translate',
      source: 'ellos y ellas estudian mucho',
      answer: 'they (the boys) and they (the girls) study a lot',
      direction: 'es-en',
      explanation: '"Ellos" refers to a male or mixed group; "ellas" refers to an all-female group. Together they emphasize both groups. "Estudian" = "they study" and "mucho" = "a lot".'
    }
  ]
}

const lesson5 = {
  id: 'a1-05',
  level: 'A1',
  order: 5,
  title: 'Verb Ser: Identity & Description',
  description: 'Master the verb ser (to be) for expressing permanent characteristics, identity, origin, and relationships.',
  estimatedTime: '25 min',
  icon: '⭐',
  content: [
    {
      type: 'text',
      text: 'Spanish has two verbs that both mean "to be" in English: ser and estar. This lesson covers "ser", which is used for identity, permanent characteristics, origin, profession, time, and relationships. Mastering when to use ser vs. estar is one of the most important skills in Spanish.'
    },
    {
      type: 'rule',
      title: 'Conjugation of Ser (Present Tense)',
      text: 'Ser is highly irregular. You must memorize these forms: yo → soy, tú → eres, él/ella/usted → es, nosotros → somos, vosotros → sois, ellos/ellas/ustedes → son.'
    },
    {
      type: 'table',
      headers: ['Person', 'Spanish', 'English'],
      rows: [
        ['yo', 'soy', 'I am'],
        ['tú', 'eres', 'you are'],
        ['él / ella / usted', 'es', 'he/she is / you are (formal)'],
        ['nosotros / nosotras', 'somos', 'we are'],
        ['vosotros / vosotras', 'sois', 'you all are (Spain)'],
        ['ellos / ellas / ustedes', 'son', 'they are / you all are']
      ]
    },
    {
      type: 'rule',
      title: 'Use 1: Origin and Nationality',
      text: 'Use ser to express where someone or something is from. Ser + de + place = origin.'
    },
    {
      type: 'examples',
      items: [
        { spanish: 'Soy de España.', english: 'I am from Spain.' },
        { spanish: 'Ella es de Colombia.', english: 'She is from Colombia.' },
        { spanish: 'El vino es de Francia.', english: 'The wine is from France.' },
        { spanish: 'Somos mexicanos.', english: 'We are Mexican.', note: 'nationality adjective, lowercase in Spanish' }
      ]
    },
    {
      type: 'rule',
      title: 'Use 2: Profession and Occupation',
      text: 'Use ser to describe what someone does for a living. Note: in Spanish, you do NOT use an article before the profession (unlike English "I am a doctor").'
    },
    {
      type: 'examples',
      items: [
        { spanish: 'Soy médico.', english: 'I am a doctor.', note: 'no article before profession' },
        { spanish: 'Ella es profesora.', english: 'She is a teacher.' },
        { spanish: 'Son ingenieros.', english: 'They are engineers.' }
      ]
    },
    {
      type: 'rule',
      title: 'Use 3: Permanent Characteristics',
      text: 'Use ser for physical and personality characteristics that are considered inherent or long-lasting: appearance, personality traits, material composition.'
    },
    {
      type: 'examples',
      items: [
        { spanish: 'El cielo es azul.', english: 'The sky is blue.', note: 'permanent color' },
        { spanish: 'María es inteligente y amable.', english: 'María is intelligent and kind.', note: 'personality traits' },
        { spanish: 'La mesa es de madera.', english: 'The table is made of wood.', note: 'material composition' },
        { spanish: 'Soy alto y moreno.', english: 'I am tall and dark-haired.', note: 'physical description' }
      ]
    },
    {
      type: 'rule',
      title: 'Use 4: Time, Date, and Day',
      text: 'Use ser when talking about the current time, date, or day of the week.'
    },
    {
      type: 'examples',
      items: [
        { spanish: 'Son las tres de la tarde.', english: 'It is three in the afternoon.' },
        { spanish: 'Hoy es lunes.', english: 'Today is Monday.' },
        { spanish: 'Es el cinco de mayo.', english: 'It is the fifth of May.' }
      ]
    },
    {
      type: 'rule',
      title: 'Use 5: Relationships',
      text: 'Use ser to describe relationships between people.'
    },
    {
      type: 'examples',
      items: [
        { spanish: 'Carlos es mi hermano.', english: 'Carlos is my brother.' },
        { spanish: 'Ella es mi mejor amiga.', english: 'She is my best friend.' },
        { spanish: 'Son mis padres.', english: 'They are my parents.' }
      ]
    },
    {
      type: 'tip',
      text: 'A useful memory trick: SER is used for things that are DOCTOR P — Description (permanent), Origin, Characteristics, Time, Occupation, Relationships, and Possession (de quien es). Think: "SER tells you what something fundamentally IS."'
    }
  ],
  exercises: [
    {
      id: 'a1-05-ex-01',
      type: 'multiple-choice',
      question: 'Which sentence correctly uses "ser"?',
      options: [
        'Yo soy cansado hoy.',
        'El libro es en la mesa.',
        'Ella es profesora de matemáticas.',
        'Estamos en Madrid.'
      ],
      correct: 2,
      explanation: '"Ella es profesora de matemáticas" correctly uses ser for profession. The other options are incorrect: "cansado" (tired) is a temporary state requiring estar; "en la mesa" is a location requiring estar; and "en Madrid" is a location, also requiring estar.'
    },
    {
      id: 'a1-05-ex-02',
      type: 'multiple-choice',
      question: 'What is the correct form of ser for "nosotros"?',
      options: ['semos', 'somos', 'sois', 'son'],
      correct: 1,
      explanation: 'The conjugation of ser for nosotros is "somos". Be careful: "semos" is a common error (from analogy with regular verbs) but it is not correct. The full conjugation is: soy, eres, es, somos, sois, son.'
    },
    {
      id: 'a1-05-ex-03',
      type: 'fill-blank',
      template: 'Hoy ___ martes y son las diez de la mañana.',
      answer: 'es',
      explanation: 'Both time and day of the week use the verb "ser". "Hoy es martes" = "Today is Tuesday" and "son las diez de la mañana" = "it is ten in the morning". Note that for time, use "son" with plural hours (las dos, las tres...) and "es" only with "la una" (1 o\'clock).'
    },
    {
      id: 'a1-05-ex-04',
      type: 'translate',
      source: 'We are from Argentina.',
      answer: 'Somos de Argentina.',
      direction: 'en-es',
      explanation: '"Somos" is the nosotros form of ser. Origin uses ser + de + place. Notice no capital letter for nationalities when used as adjectives, but place names are always capitalized: Argentina.'
    },
    {
      id: 'a1-05-ex-05',
      type: 'translate',
      source: 'Mi padre es médico y mi madre es abogada.',
      answer: 'My father is a doctor and my mother is a lawyer.',
      direction: 'es-en',
      explanation: 'Profession uses ser without an article in Spanish (médico, not un médico). In English, we translate "es médico" as "is a doctor" — we add the article. "Abogada" is the feminine form of "abogado" (lawyer).'
    }
  ]
}

const lesson6 = {
  id: 'a1-06',
  level: 'A1',
  order: 6,
  title: 'Verb Estar: Location & States',
  description: 'Learn the verb estar (to be) for expressing location, temporary conditions, emotions, and the progressive tense.',
  estimatedTime: '25 min',
  icon: '📍',
  content: [
    {
      type: 'text',
      text: 'The verb estar is the second Spanish verb meaning "to be". While ser describes what something IS (identity, nature), estar describes where something IS or how something FEELS at a given moment (location, state, condition). Understanding this difference is key to speaking natural Spanish.'
    },
    {
      type: 'rule',
      title: 'Conjugation of Estar (Present Tense)',
      text: 'Estar is irregular in the first person and has accent marks on certain forms. Note the accent marks — they affect pronunciation. Yo → estoy, tú → estás, él/ella/usted → está, nosotros → estamos, vosotros → estáis, ellos/ellas/ustedes → están.'
    },
    {
      type: 'table',
      headers: ['Person', 'Spanish', 'English'],
      rows: [
        ['yo', 'estoy', 'I am'],
        ['tú', 'estás', 'you are'],
        ['él / ella / usted', 'está', 'he/she is / you are (formal)'],
        ['nosotros / nosotras', 'estamos', 'we are'],
        ['vosotros / vosotras', 'estáis', 'you all are (Spain)'],
        ['ellos / ellas / ustedes', 'están', 'they are / you all are']
      ]
    },
    {
      type: 'rule',
      title: 'Use 1: Location',
      text: 'Use estar for the physical location of people, animals, and objects — where something or someone is at a given moment.'
    },
    {
      type: 'examples',
      items: [
        { spanish: 'El libro está en la mesa.', english: 'The book is on the table.' },
        { spanish: 'Estoy en casa.', english: 'I am at home.' },
        { spanish: 'Madrid está en España.', english: 'Madrid is in Spain.', note: 'cities and places use estar for location' },
        { spanish: '¿Dónde está el baño?', english: 'Where is the bathroom?' }
      ]
    },
    {
      type: 'rule',
      title: 'Use 2: Temporary States and Conditions',
      text: 'Use estar for conditions, states, or feelings that can change — physical conditions, emotions, and temporary situations.'
    },
    {
      type: 'examples',
      items: [
        { spanish: 'Estoy cansado.', english: 'I am tired.', note: 'temporary physical state' },
        { spanish: 'La sopa está caliente.', english: 'The soup is hot.', note: 'current condition, not permanent nature' },
        { spanish: 'Ella está enferma hoy.', english: 'She is sick today.', note: 'temporary condition' },
        { spanish: 'Estamos contentos.', english: 'We are happy.', note: 'current emotional state' }
      ]
    },
    {
      type: 'rule',
      title: 'Use 3: Progressive Tense (estar + gerund)',
      text: 'Estar combines with the present participle (-ando/-iendo) to form the present progressive, expressing what is happening right now.'
    },
    {
      type: 'examples',
      items: [
        { spanish: 'Estoy comiendo.', english: 'I am eating (right now).' },
        { spanish: 'Ella está estudiando.', english: 'She is studying.' },
        { spanish: 'Estamos hablando español.', english: 'We are speaking Spanish.' }
      ]
    },
    {
      type: 'table',
      headers: ['Category', 'SER', 'ESTAR'],
      rows: [
        ['Identity/Essence', 'Es médico. (He is a doctor.)', '—'],
        ['Origin', 'Es de México. (She is from Mexico.)', '—'],
        ['Permanent traits', 'Es inteligente. (He is intelligent.)', '—'],
        ['Time/Date', 'Son las tres. (It is three o\'clock.)', '—'],
        ['Location', '—', 'Está en casa. (He is at home.)'],
        ['Temporary state', '—', 'Está cansado. (He is tired.)'],
        ['Emotion (current)', '—', 'Está feliz hoy. (She is happy today.)'],
        ['Progressive', '—', 'Está comiendo. (He is eating.)'],
        ['Changed state (can surprise)', 'Es joven. (He is young.)', 'Está joven! (He looks young!)']
      ]
    },
    {
      type: 'warning',
      text: 'Some adjectives change meaning depending on whether they are used with ser or estar. "Ser aburrido" = to be boring (personality); "estar aburrido" = to be bored (feeling right now). "Ser seguro" = to be safe; "estar seguro" = to be sure/certain.'
    },
    {
      type: 'tip',
      text: 'A good memory trick: ESTAR is for PLACE and TEMPORARY STATE. Think "estar" starts with "e" like "emotion" and "ephemeral" (temporary). If it can change or it is a location, use estar.'
    }
  ],
  exercises: [
    {
      id: 'a1-06-ex-01',
      type: 'multiple-choice',
      question: 'Which verb do you use to say where someone is?',
      options: ['ser', 'estar', 'tener', 'haber'],
      correct: 1,
      explanation: 'Location always uses ESTAR. "¿Dónde estás?" (Where are you?), "Estoy en la biblioteca" (I am in the library). Remember: ESTAR = location + temporary states.'
    },
    {
      id: 'a1-06-ex-02',
      type: 'multiple-choice',
      question: 'Choose the correct sentence: "The coffee is cold."',
      options: [
        'El café es frío.',
        'El café está frío.',
        'El café ser frío.',
        'El café estar frío.'
      ],
      correct: 1,
      explanation: '"El café está frío" uses estar because "cold" here is a temporary condition of the coffee right now — it could be hot again if reheated. Compare: "El café es negro" (The coffee is black — a permanent characteristic, using ser).'
    },
    {
      id: 'a1-06-ex-03',
      type: 'fill-blank',
      template: 'Nosotros ___ estudiando para el examen.',
      answer: 'estamos',
      explanation: 'The present progressive uses estar + gerund. "Estamos estudiando" = "We are studying". The gerund of estudiar is "estudiando". Remember, the present progressive expresses what is happening at this very moment.'
    },
    {
      id: 'a1-06-ex-04',
      type: 'translate',
      source: 'Where is the train station?',
      answer: '¿Dónde está la estación de tren?',
      direction: 'en-es',
      explanation: 'Location uses estar: "¿Dónde está...?" (Where is...?). "La estación de tren" = "the train station". Note the inverted question mark (¿) at the beginning of questions — it is mandatory in Spanish writing.'
    },
    {
      id: 'a1-06-ex-05',
      type: 'translate',
      source: 'Estoy muy cansada pero estoy contenta.',
      answer: 'I am very tired but I am happy.',
      direction: 'es-en',
      explanation: 'Both "cansada" (tired) and "contenta" (happy) are temporary states, so they use estar. The feminine forms (-a endings) tell us the speaker is female. "Pero" = "but", "muy" = "very".'
    }
  ]
}

const lesson7 = {
  id: 'a1-07',
  level: 'A1',
  order: 7,
  title: 'Present Tense: -AR Verbs',
  description: 'Learn to conjugate regular -AR verbs in the present tense, the most common verb type in Spanish.',
  estimatedTime: '25 min',
  icon: '⚡',
  content: [
    {
      type: 'text',
      text: 'The vast majority of Spanish verbs are regular and follow predictable patterns. The -AR group is the largest. To conjugate an -AR verb, remove the infinitive ending (-ar) and add the personal endings. Once you learn this pattern, you can conjugate hundreds of verbs.'
    },
    {
      type: 'rule',
      title: '-AR Verb Endings',
      text: 'Remove -ar from the infinitive (leaving the "stem"), then add the correct ending based on who is performing the action.'
    },
    {
      type: 'table',
      headers: ['Person', 'Ending', 'Example with HABLAR (to speak)'],
      rows: [
        ['yo', '-o', 'habl-o → hablo (I speak)'],
        ['tú', '-as', 'habl-as → hablas (you speak)'],
        ['él / ella / usted', '-a', 'habl-a → habla (he/she speaks)'],
        ['nosotros / nosotras', '-amos', 'habl-amos → hablamos (we speak)'],
        ['vosotros / vosotras', '-áis', 'habl-áis → habláis (you all speak, Spain)'],
        ['ellos / ellas / ustedes', '-an', 'habl-an → hablan (they/you all speak)']
      ]
    },
    {
      type: 'rule',
      title: 'Second Example: CAMINAR (to walk)',
      text: 'Apply the same endings to another -AR verb: caminar → stem: camin-'
    },
    {
      type: 'table',
      headers: ['Person', 'Conjugation', 'English'],
      rows: [
        ['yo', 'camino', 'I walk'],
        ['tú', 'caminas', 'you walk'],
        ['él / ella / usted', 'camina', 'he/she walks'],
        ['nosotros', 'caminamos', 'we walk'],
        ['vosotros', 'camináis', 'you all walk (Spain)'],
        ['ellos / ustedes', 'caminan', 'they walk']
      ]
    },
    {
      type: 'rule',
      title: 'Common -AR Verbs',
      text: 'Here are frequently used regular -AR verbs to build your vocabulary:'
    },
    {
      type: 'table',
      headers: ['Infinitive', 'English', 'Yo form'],
      rows: [
        ['hablar', 'to speak', 'hablo'],
        ['caminar', 'to walk', 'camino'],
        ['estudiar', 'to study', 'estudio'],
        ['trabajar', 'to work', 'trabajo'],
        ['escuchar', 'to listen', 'escucho'],
        ['mirar', 'to look / watch', 'miro'],
        ['comprar', 'to buy', 'compro'],
        ['cocinar', 'to cook', 'cocino'],
        ['bailar', 'to dance', 'bailo'],
        ['cantar', 'to sing', 'canto'],
        ['viajar', 'to travel', 'viajo'],
        ['usar', 'to use', 'uso'],
        ['llamar', 'to call', 'llamo'],
        ['necesitar', 'to need', 'necesito']
      ]
    },
    {
      type: 'examples',
      items: [
        { spanish: 'Ella estudia español todos los días.', english: 'She studies Spanish every day.', note: 'todos los días = every day' },
        { spanish: 'Nosotros trabajamos en una oficina.', english: 'We work in an office.' },
        { spanish: 'Ellos escuchan música juntos.', english: 'They listen to music together.' },
        { spanish: '¿Compras mucho en internet?', english: 'Do you buy a lot online?', note: 'questions have same word order as statements' },
        { spanish: 'Yo cocino y tú limpias.', english: 'I cook and you clean.', note: 'comparing two subjects — pronouns added for clarity' }
      ]
    },
    {
      type: 'tip',
      text: 'The present tense in Spanish covers three English meanings: "hablo" = "I speak" / "I am speaking" / "I do speak". Context makes it clear which is meant. You do not need a separate tense for "I am speaking" unless you want to emphasize it is happening right now (then use the progressive: "estoy hablando").'
    },
    {
      type: 'warning',
      text: 'The "nosotros" present tense (-amos) looks identical to the "nosotros" preterite (simple past) for many -AR verbs: "hablamos" = "we speak" OR "we spoke". Context usually makes the meaning clear.'
    }
  ],
  exercises: [
    {
      id: 'a1-07-ex-01',
      type: 'multiple-choice',
      question: 'What is the correct conjugation of "trabajar" for "ellos"?',
      options: ['trabajamos', 'trabajas', 'trabajan', 'trabajo'],
      correct: 2,
      explanation: 'The ellos/ellas/ustedes ending for -AR verbs is -an: trabaj- + -an = "trabajan". The full conjugation of trabajar: trabajo, trabajas, trabaja, trabajamos, trabajáis, trabajan.'
    },
    {
      id: 'a1-07-ex-02',
      type: 'multiple-choice',
      question: 'Which sentence correctly says "You (informal) dance very well"?',
      options: [
        'Tú bailas muy bien.',
        'Tú bailan muy bien.',
        'Tú bailamos muy bien.',
        'Tú bailo muy bien.'
      ],
      correct: 0,
      explanation: 'For "tú", the -AR ending is -as: bail- + -as = "bailas". The sentence "Tú bailas muy bien" = "You dance very well." "Muy bien" = "very well".'
    },
    {
      id: 'a1-07-ex-03',
      type: 'fill-blank',
      template: 'Yo ___ (estudiar) español por las mañanas.',
      answer: 'estudio',
      explanation: '"Estudiar" stem is "estudi-". For yo, add -o: estudi + o = "estudio". The sentence means "I study Spanish in the mornings". "Por las mañanas" = "in the mornings" (habitual action).'
    },
    {
      id: 'a1-07-ex-04',
      type: 'translate',
      source: 'We listen to music every day.',
      answer: 'Escuchamos música todos los días.',
      direction: 'en-es',
      explanation: '"Escuchar" (to listen) → nosotros: escuch + amos = "escuchamos". "Música" = music. "Todos los días" = every day. Note: in Spanish, "listen to" = "escuchar" (no preposition needed after escuchar).'
    },
    {
      id: 'a1-07-ex-05',
      type: 'translate',
      source: '¿Hablas inglés o francés?',
      answer: 'Do you speak English or French?',
      direction: 'es-en',
      explanation: '"Hablas" is the tú form of hablar (to speak). Spanish questions use the same word order as statements — the question mark and intonation (or ¿?) signal it is a question. "O" = "or".'
    }
  ]
}

const lesson8 = {
  id: 'a1-08',
  level: 'A1',
  order: 8,
  title: 'Present Tense: -ER and -IR Verbs',
  description: 'Learn to conjugate regular -ER and -IR verbs in the present tense and compare all three verb types.',
  estimatedTime: '25 min',
  icon: '🌿',
  content: [
    {
      type: 'text',
      text: 'Spanish verbs fall into three groups based on their infinitive ending: -AR, -ER, and -IR. You already know -AR verbs. The -ER and -IR groups have slightly different endings, but the logic is the same: remove the infinitive ending, keep the stem, and add the personal ending.'
    },
    {
      type: 'rule',
      title: '-ER Verb Endings',
      text: 'Remove -er from the infinitive, then add these endings. The main difference from -AR: the vowel changes from "a" to "e" in most forms.'
    },
    {
      type: 'table',
      headers: ['Person', 'Ending', 'Example with COMER (to eat)'],
      rows: [
        ['yo', '-o', 'com-o → como (I eat)'],
        ['tú', '-es', 'com-es → comes (you eat)'],
        ['él / ella / usted', '-e', 'com-e → come (he/she eats)'],
        ['nosotros / nosotras', '-emos', 'com-emos → comemos (we eat)'],
        ['vosotros / vosotras', '-éis', 'com-éis → coméis (you all eat, Spain)'],
        ['ellos / ellas / ustedes', '-en', 'com-en → comen (they eat)']
      ]
    },
    {
      type: 'rule',
      title: '-IR Verb Endings',
      text: 'Remove -ir from the infinitive, then add these endings. -IR endings are almost identical to -ER endings, except in the nosotros and vosotros forms.'
    },
    {
      type: 'table',
      headers: ['Person', 'Ending', 'Example with VIVIR (to live)'],
      rows: [
        ['yo', '-o', 'viv-o → vivo (I live)'],
        ['tú', '-es', 'viv-es → vives (you live)'],
        ['él / ella / usted', '-e', 'viv-e → vive (he/she lives)'],
        ['nosotros / nosotras', '-imos', 'viv-imos → vivimos (we live)'],
        ['vosotros / vosotras', '-ís', 'viv-ís → vivís (you all live, Spain)'],
        ['ellos / ellas / ustedes', '-en', 'viv-en → viven (they live)']
      ]
    },
    {
      type: 'rule',
      title: 'Complete Comparison of All Three Verb Types',
      text: 'Here is a side-by-side view of all three verb conjugation patterns:'
    },
    {
      type: 'table',
      headers: ['Person', '-AR (hablar)', '-ER (comer)', '-IR (vivir)'],
      rows: [
        ['yo', 'hablo', 'como', 'vivo'],
        ['tú', 'hablas', 'comes', 'vives'],
        ['él/ella/usted', 'habla', 'come', 'vive'],
        ['nosotros', 'hablamos', 'comemos', 'vivimos'],
        ['vosotros', 'habláis', 'coméis', 'vivís'],
        ['ellos/ustedes', 'hablan', 'comen', 'viven']
      ]
    },
    {
      type: 'rule',
      title: 'Common -ER Verbs',
      text: 'Frequently used regular -ER verbs:'
    },
    {
      type: 'table',
      headers: ['Infinitive', 'English', 'Yo form'],
      rows: [
        ['comer', 'to eat', 'como'],
        ['beber', 'to drink', 'bebo'],
        ['leer', 'to read', 'leo'],
        ['correr', 'to run', 'corro'],
        ['vender', 'to sell', 'vendo'],
        ['aprender', 'to learn', 'aprendo'],
        ['comprender', 'to understand', 'comprendo']
      ]
    },
    {
      type: 'rule',
      title: 'Common -IR Verbs',
      text: 'Frequently used regular -IR verbs:'
    },
    {
      type: 'table',
      headers: ['Infinitive', 'English', 'Yo form'],
      rows: [
        ['vivir', 'to live', 'vivo'],
        ['escribir', 'to write', 'escribo'],
        ['abrir', 'to open', 'abro'],
        ['recibir', 'to receive', 'recibo'],
        ['subir', 'to go up / upload', 'subo'],
        ['decidir', 'to decide', 'decido'],
        ['partir', 'to leave / split', 'parto']
      ]
    },
    {
      type: 'examples',
      items: [
        { spanish: 'Leo un libro interesante.', english: 'I am reading an interesting book.' },
        { spanish: 'Ella bebe café por la mañana.', english: 'She drinks coffee in the morning.' },
        { spanish: 'Vivimos en una ciudad grande.', english: 'We live in a big city.' },
        { spanish: 'Ellos aprenden español rápidamente.', english: 'They learn Spanish quickly.' },
        { spanish: '¿Escribes en tu diario todos los días?', english: 'Do you write in your diary every day?' }
      ]
    },
    {
      type: 'tip',
      text: 'The yo form always ends in -o for regular -AR, -ER, and -IR verbs: hablo, como, vivo. The yo form is the most irregular in other tenses, but in the present tense it is perfectly regular for most verbs.'
    }
  ],
  exercises: [
    {
      id: 'a1-08-ex-01',
      type: 'multiple-choice',
      question: 'What is the correct nosotros form of "beber" (to drink)?',
      options: ['bebamos', 'bebemos', 'bebimos', 'beban'],
      correct: 1,
      explanation: 'The nosotros ending for -ER verbs is -emos: beb- + emos = "bebemos". Compare: for -AR verbs it is -amos (hablamos), for -IR verbs it is -imos (vivimos). "Bebimos" is the preterite (past), not the present.'
    },
    {
      id: 'a1-08-ex-02',
      type: 'multiple-choice',
      question: 'Which is correct for "she opens the door"?',
      options: ['Ella abre la puerta.', 'Ella abres la puerta.', 'Ella abro la puerta.', 'Ella abren la puerta.'],
      correct: 0,
      explanation: '"Abrir" is a regular -IR verb. For él/ella/usted, the ending is -e: abr- + e = "abre". So "Ella abre la puerta" = "She opens the door". "La puerta" = "the door" (feminine).'
    },
    {
      id: 'a1-08-ex-03',
      type: 'fill-blank',
      template: 'Yo ___ (leer) el periódico cada mañana.',
      answer: 'leo',
      explanation: '"Leer" is a regular -ER verb. For yo, add -o to the stem: le- + o = "leo". Note that "lee" (with double e) is the él/ella form. The sentence means "I read the newspaper every morning". "El periódico" = "the newspaper".'
    },
    {
      id: 'a1-08-ex-04',
      type: 'translate',
      source: 'They write letters in Spanish.',
      answer: 'Ellos escriben cartas en español.',
      direction: 'en-es',
      explanation: '"Escribir" is a regular -IR verb. Ellos ending: escrib- + en = "escriben". "Cartas" = "letters" (feminine plural). "En español" = "in Spanish". Note: no article before "español" when referring to a language.'
    },
    {
      id: 'a1-08-ex-05',
      type: 'translate',
      source: 'Aprendemos muchas palabras nuevas.',
      answer: 'We learn many new words.',
      direction: 'es-en',
      explanation: '"Aprendemos" is the nosotros form of "aprender" (to learn), an -ER verb: aprend- + emos. "Muchas palabras" = "many words" (feminine plural, so "muchas"). "Nuevas" = "new" — the adjective agrees with the feminine plural noun.'
    }
  ]
}

const lesson9 = {
  id: 'a1-09',
  level: 'A1',
  order: 9,
  title: 'Adjectives: Agreement Rules',
  description: 'Learn how Spanish adjectives must agree with nouns in gender and number, and where to place them in a sentence.',
  estimatedTime: '20 min',
  icon: '🎨',
  content: [
    {
      type: 'text',
      text: 'In Spanish, adjectives must agree with the noun they describe in both gender (masculine/feminine) and number (singular/plural). This means an adjective can have up to four forms. Additionally, most adjectives in Spanish are placed AFTER the noun, which is the opposite of English.'
    },
    {
      type: 'rule',
      title: 'Gender Agreement: -O / -A Adjectives',
      text: 'Adjectives ending in -o are masculine. Change -o to -a to make them feminine. This is the most common pattern: alto (tall, m) / alta (tall, f); rojo (red, m) / roja (red, f).'
    },
    {
      type: 'rule',
      title: 'Gender Agreement: -E and Consonant Adjectives',
      text: 'Adjectives ending in -e do NOT change for gender: inteligente, grande, interesante are the same for masculine and feminine. Adjectives ending in a consonant also usually do not change: fácil (easy), difícil (difficult), azul (blue). Exception: adjectives of nationality ending in a consonant DO add -a for the feminine: español/española, inglés/inglesa, alemán/alemana.'
    },
    {
      type: 'rule',
      title: 'Number Agreement: Forming the Plural',
      text: 'To form the plural of an adjective: (1) If it ends in a vowel, add -s: alto → altos, inteligente → inteligentes. (2) If it ends in a consonant, add -es: fácil → fáciles, azul → azules. (3) If it ends in -z, change z to c and add -es: feliz → felices.'
    },
    {
      type: 'table',
      headers: ['Adjective', 'Masc. Sing.', 'Fem. Sing.', 'Masc. Pl.', 'Fem. Pl.', 'English'],
      rows: [
        ['alto', 'alto', 'alta', 'altos', 'altas', 'tall'],
        ['pequeño', 'pequeño', 'pequeña', 'pequeños', 'pequeñas', 'small'],
        ['rojo', 'rojo', 'roja', 'rojos', 'rojas', 'red'],
        ['verde', 'verde', 'verde', 'verdes', 'verdes', 'green'],
        ['inteligente', 'inteligente', 'inteligente', 'inteligentes', 'inteligentes', 'intelligent'],
        ['azul', 'azul', 'azul', 'azules', 'azules', 'blue'],
        ['español', 'español', 'española', 'españoles', 'españolas', 'Spanish'],
        ['feliz', 'feliz', 'feliz', 'felices', 'felices', 'happy'],
        ['simpático', 'simpático', 'simpática', 'simpáticos', 'simpáticas', 'friendly/nice']
      ]
    },
    {
      type: 'rule',
      title: 'Position: Adjectives Usually Come AFTER the Noun',
      text: 'Unlike English, Spanish adjectives almost always follow the noun: "un libro interesante" (an interesting book), not "un interesante libro". However, some common adjectives precede the noun: bueno/malo (good/bad), grande (great when before noun), and ordinal numbers (primer, segundo...).'
    },
    {
      type: 'examples',
      items: [
        { spanish: 'una chica alta y delgada', english: 'a tall, slim girl', note: 'adjectives after noun, feminine forms' },
        { spanish: 'un coche rojo grande', english: 'a big red car', note: 'two adjectives both after the noun' },
        { spanish: 'las casas blancas y azules', english: 'the white and blue houses', note: 'plural adjectives agreeing with "las casas"' },
        { spanish: 'Es un buen hombre.', english: 'He is a good man.', note: '"bueno" shortens to "buen" before masc. noun' },
        { spanish: 'Habla varios idiomas extranjeros.', english: 'He speaks several foreign languages.', note: '"extranjeros" agrees with masc. pl. "idiomas"' }
      ]
    },
    {
      type: 'table',
      headers: ['Category', 'Masculine', 'Feminine', 'English'],
      rows: [
        ['Colors', 'rojo, azul, verde, amarillo, negro, blanco, gris, morado, naranja', 'roja, azul, verde, amarilla, negra, blanca, gris, morada, naranja', 'red, blue, green, yellow, black, white, grey, purple, orange'],
        ['Size', 'grande, pequeño, largo, corto, alto, bajo', 'grande, pequeña, larga, corta, alta, baja', 'big, small, long, short, tall, low'],
        ['Personality', 'simpático, antipático, amable, serio, divertido, tímido', 'simpática, antipática, amable, seria, divertida, tímida', 'friendly, unfriendly, kind, serious, funny, shy'],
        ['Physical', 'guapo, feo, joven, viejo, gordo, delgado', 'guapa, fea, joven, vieja, gorda, delgada', 'handsome, ugly, young, old, fat, slim']
      ]
    },
    {
      type: 'tip',
      text: 'When an adjective modifies a mixed group (masculine + feminine nouns), use the masculine plural form: "El chico y la chica son altos." (The boy and the girl are tall.) This is the grammatical default in Spanish.'
    },
    {
      type: 'warning',
      text: '"Grande" has a special behavior: before a singular noun (masculine or feminine) it shortens to "gran" and means "great" rather than "big": "un gran hombre" (a great man), "una gran mujer" (a great woman). After the noun, "grande" means "big": "un hombre grande" (a big man).'
    }
  ],
  exercises: [
    {
      id: 'a1-09-ex-01',
      type: 'multiple-choice',
      question: 'How do you say "the interesting books" in Spanish?',
      options: [
        'los libro interesante',
        'los libros interesantes',
        'los interesantes libros',
        'el libros interesante'
      ],
      correct: 1,
      explanation: '"Los libros interesantes" — "libros" is masculine plural, so the article is "los" and the adjective "interesante" becomes "interesantes" (add -s). Adjective follows the noun. All parts agree: masculine plural throughout.'
    },
    {
      id: 'a1-09-ex-02',
      type: 'multiple-choice',
      question: 'A friend describes herself as "simpática y seria". What does this mean?',
      options: [
        'He is friendly and serious.',
        'She is friendly and serious.',
        'She is unfriendly and happy.',
        'They are kind and boring.'
      ],
      correct: 1,
      explanation: 'Both "simpática" and "seria" end in -a, indicating feminine singular. So the speaker is a woman describing herself: "friendly and serious". "Simpático/a" = friendly/nice; "serio/a" = serious.'
    },
    {
      id: 'a1-09-ex-03',
      type: 'fill-blank',
      template: 'Ella es una mujer muy ___ (inteligente — make it agree).',
      answer: 'inteligente',
      explanation: '"Inteligente" ends in -e, so it does NOT change for gender. It is the same for masculine and feminine: "un hombre inteligente" / "una mujer inteligente". Only the -o/-a adjectives change: alto/alta.'
    },
    {
      id: 'a1-09-ex-04',
      type: 'translate',
      source: 'the tall, funny boys',
      answer: 'los chicos altos y divertidos',
      direction: 'en-es',
      explanation: '"Chicos" is masculine plural → article "los". "Alto" becomes "altos" (masc. pl.), "divertido" becomes "divertidos" (masc. pl.). Adjectives follow the noun and are joined by "y" (and).'
    },
    {
      id: 'a1-09-ex-05',
      type: 'translate',
      source: 'Las flores rojas son muy bonitas.',
      answer: 'The red flowers are very pretty.',
      direction: 'es-en',
      explanation: '"Las flores" = "the flowers" (feminine plural). "Rojas" = red (feminine plural form of rojo). "Son" = are (ser, 3rd pl.). "Muy bonitas" = very pretty (feminine plural: bonita → bonitas). All adjectives agree with the feminine plural noun.'
    }
  ]
}

const lesson10 = {
  id: 'a1-10',
  level: 'A1',
  order: 10,
  title: 'Days, Months & Time',
  description: 'Learn the days of the week, months of the year, how to tell the time, and common time expressions in Spanish.',
  estimatedTime: '20 min',
  icon: '📅',
  content: [
    {
      type: 'text',
      text: 'Talking about time is essential in everyday life. In Spanish, days of the week and months are NOT capitalized (unlike in English). Knowing these will help you make plans, describe your schedule, and understand dates.'
    },
    {
      type: 'rule',
      title: 'Days of the Week (Los días de la semana)',
      text: 'Spanish days are all masculine and always written in lowercase. The week traditionally starts on Monday (lunes) in Spain and Latin America.'
    },
    {
      type: 'table',
      headers: ['Spanish', 'English', 'Pronunciation hint'],
      rows: [
        ['lunes', 'Monday', 'LOO-nehs'],
        ['martes', 'Tuesday', 'MAR-tehs'],
        ['miércoles', 'Wednesday', 'MYEHR-koh-lehs'],
        ['jueves', 'Thursday', 'HWEH-behs'],
        ['viernes', 'Friday', 'BYEHR-nehs'],
        ['sábado', 'Saturday', 'SAH-bah-doh'],
        ['domingo', 'Sunday', 'doh-MEEN-goh']
      ]
    },
    {
      type: 'rule',
      title: 'Using Days of the Week',
      text: 'Use "el" + day for a single occurrence ("el lunes" = on Monday, this Monday) and "los" + day for a recurring event ("los lunes" = on Mondays, every Monday). Days that end in -s (lunes through viernes) have the same singular and plural form. Only sábado and domingo add -s for plural: los sábados, los domingos.'
    },
    {
      type: 'examples',
      items: [
        { spanish: 'Tengo clase el martes.', english: 'I have class on Tuesday (this Tuesday).' },
        { spanish: 'Voy al gimnasio los lunes y los miércoles.', english: 'I go to the gym on Mondays and Wednesdays.' },
        { spanish: 'El fin de semana es el sábado y el domingo.', english: 'The weekend is Saturday and Sunday.', note: 'el fin de semana = the weekend' }
      ]
    },
    {
      type: 'rule',
      title: 'Months of the Year (Los meses del año)',
      text: 'Like days, Spanish months are always written in lowercase.'
    },
    {
      type: 'table',
      headers: ['Spanish', 'English', 'Spanish', 'English'],
      rows: [
        ['enero', 'January', 'julio', 'July'],
        ['febrero', 'February', 'agosto', 'August'],
        ['marzo', 'March', 'septiembre', 'September'],
        ['abril', 'April', 'octubre', 'October'],
        ['mayo', 'May', 'noviembre', 'November'],
        ['junio', 'June', 'diciembre', 'December']
      ]
    },
    {
      type: 'examples',
      items: [
        { spanish: 'Mi cumpleaños es el quince de agosto.', english: 'My birthday is on August 15th.', note: 'dates: el + number + de + month' },
        { spanish: 'Navidad es en diciembre.', english: 'Christmas is in December.', note: 'months use "en"' },
        { spanish: 'El verano empieza en junio.', english: 'Summer starts in June.' }
      ]
    },
    {
      type: 'rule',
      title: 'Telling Time: ¿Qué hora es?',
      text: 'To tell the time, use "Es la una" for 1 o\'clock (singular) and "Son las [number]" for all other hours (plural). For minutes, add "y" for minutes past and "menos" for minutes to the hour. "Y cuarto" = quarter past, "y media" = half past, "menos cuarto" = quarter to.'
    },
    {
      type: 'table',
      headers: ['Time', 'Spanish', 'Literal translation'],
      rows: [
        ['1:00', 'Es la una.', 'It is the one.'],
        ['2:00', 'Son las dos.', 'They are the two.'],
        ['3:15', 'Son las tres y cuarto.', 'It is three and a quarter.'],
        ['4:30', 'Son las cuatro y media.', 'It is four and a half.'],
        ['5:45', 'Son las seis menos cuarto.', 'It is six minus a quarter.'],
        ['12:00 (noon)', 'Es mediodía.', 'It is midday.'],
        ['12:00 (midnight)', 'Es medianoche.', 'It is midnight.'],
        ['8:20', 'Son las ocho y veinte.', 'It is eight and twenty.'],
        ['9:50', 'Son las diez menos diez.', 'It is ten minus ten.']
      ]
    },
    {
      type: 'rule',
      title: 'Common Time Expressions',
      text: 'These time expressions are used constantly in Spanish conversation:'
    },
    {
      type: 'table',
      headers: ['Spanish', 'English'],
      rows: [
        ['hoy', 'today'],
        ['mañana', 'tomorrow / morning'],
        ['ayer', 'yesterday'],
        ['esta semana', 'this week'],
        ['la semana pasada', 'last week'],
        ['la semana que viene', 'next week'],
        ['este mes', 'this month'],
        ['este año', 'this year'],
        ['ahora', 'now'],
        ['después', 'later / afterwards'],
        ['antes', 'before / earlier'],
        ['siempre', 'always'],
        ['nunca', 'never'],
        ['a veces', 'sometimes'],
        ['todos los días', 'every day']
      ]
    },
    {
      type: 'tip',
      text: '"Mañana" has two meanings: "tomorrow" and "morning". Context makes it clear: "Hasta mañana" = "See you tomorrow", "por la mañana" = "in the morning". "Esta mañana" = "this morning".'
    },
    {
      type: 'warning',
      text: 'In Spanish-speaking countries, times are often expressed in 12-hour format with "de la mañana" (in the morning), "de la tarde" (in the afternoon/evening), and "de la noche" (at night) to distinguish AM/PM. Official/transport schedules use 24-hour time.'
    }
  ],
  exercises: [
    {
      id: 'a1-10-ex-01',
      type: 'multiple-choice',
      question: 'How do you say "It is 3:30" in Spanish?',
      options: [
        'Es las tres y media.',
        'Son las tres y media.',
        'Son las tres y cuarto.',
        'Es la tres y media.'
      ],
      correct: 1,
      explanation: 'Use "Son las" for all hours except 1 o\'clock (Es la una). "Y media" = half past. So 3:30 = "Son las tres y media". "Son las tres y cuarto" would be 3:15, not 3:30.'
    },
    {
      id: 'a1-10-ex-02',
      type: 'multiple-choice',
      question: 'Which statement about Spanish days and months is TRUE?',
      options: [
        'Days are capitalized, months are not.',
        'Months are capitalized, days are not.',
        'Both days and months are written in lowercase.',
        'Both days and months are capitalized, like in English.'
      ],
      correct: 2,
      explanation: 'In Spanish, both days of the week and months of the year are written in lowercase: lunes (not Lunes), enero (not Enero). This differs from English, where Monday and January are always capitalized.'
    },
    {
      id: 'a1-10-ex-03',
      type: 'fill-blank',
      template: 'Mi cumpleaños es ___ veintidós de marzo.',
      answer: 'el',
      explanation: 'When giving a date, use "el" before the day number: "el veintidós de marzo" = "March 22nd". The pattern for dates is: el + number + de + month. For example: el primero de enero (January 1st), el quince de agosto (August 15th).'
    },
    {
      id: 'a1-10-ex-04',
      type: 'translate',
      source: 'I go to the market every Saturday.',
      answer: 'Voy al mercado los sábados.',
      direction: 'en-es',
      explanation: '"Voy" = I go (from ir, to go). "Al" = a + el (contracted: "a el" → "al"). "Mercado" = market. "Los sábados" = every Saturday (plural with "los" for habitual events). Note: sábado adds -s to form plural, unlike lunes–viernes which are the same in singular and plural.'
    },
    {
      id: 'a1-10-ex-05',
      type: 'translate',
      source: 'Hoy es miércoles y mañana es jueves.',
      answer: 'Today is Wednesday and tomorrow is Thursday.',
      direction: 'es-en',
      explanation: '"Hoy" = today, "mañana" = tomorrow (here it means tomorrow, not morning — no article before it). "Miércoles" = Wednesday and "jueves" = Thursday. Notice these days are lowercase in Spanish — unlike the English translation where Wednesday and Thursday are capitalized.'
    }
  ]
}

export const lessons = [lesson1, lesson2, lesson3, lesson4, lesson5, lesson6, lesson7, lesson8, lesson9, lesson10]
