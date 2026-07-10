export const lessons = [
  {
    id: 'a2-01',
    level: 'A2',
    order: 1,
    title: 'Common Irregular Verbs',
    description: 'Master the most essential irregular verbs in Spanish including ir, tener, hacer, querer, and poder. Learn the crucial distinction between saber and conocer.',
    estimatedTime: '25 min',
    icon: '🔥',
    content: [
      {
        type: 'text',
        text: 'Irregular verbs do not follow the standard conjugation patterns. In Spanish, the most common verbs are often irregular, so mastering them is essential for everyday communication.'
      },
      {
        type: 'table',
        headers: ['Pronoun', 'ir (to go)', 'tener (to have)', 'hacer (to do/make)', 'querer (to want)', 'poder (to be able to)'],
        rows: [
          ['yo', 'voy', 'tengo', 'hago', 'quiero', 'puedo'],
          ['tú', 'vas', 'tienes', 'haces', 'quieres', 'puedes'],
          ['él/ella/Ud.', 'va', 'tiene', 'hace', 'quiere', 'puede'],
          ['nosotros', 'vamos', 'tenemos', 'hacemos', 'queremos', 'podemos'],
          ['vosotros', 'vais', 'tenéis', 'hacéis', 'queréis', 'podéis'],
          ['ellos/Uds.', 'van', 'tienen', 'hacen', 'quieren', 'pueden']
        ]
      },
      {
        type: 'rule',
        title: 'Saber vs. Conocer',
        text: 'Both mean "to know" in English, but they are used differently. "Saber" is used for knowing facts, information, or how to do something. "Conocer" is used for knowing or being familiar with people, places, and things.'
      },
      {
        type: 'examples',
        items: [
          { spanish: 'Yo sé hablar español.', english: 'I know how to speak Spanish.', note: 'saber + infinitive = know how to' },
          { spanish: 'Ella sabe la respuesta.', english: 'She knows the answer.', note: 'saber = knowing a fact' },
          { spanish: 'Conozco a María.', english: 'I know María.', note: 'conocer + person (use "a")' },
          { spanish: '¿Conoces Madrid?', english: 'Do you know Madrid?', note: 'conocer = familiar with a place' },
          { spanish: 'Voy al supermercado.', english: 'I am going to the supermarket.' },
          { spanish: 'Tengo mucho trabajo hoy.', english: 'I have a lot of work today.' },
          { spanish: 'Él hace ejercicio cada mañana.', english: 'He exercises every morning.' },
          { spanish: 'Queremos visitar España.', english: 'We want to visit Spain.' },
          { spanish: '¿Puedes ayudarme?', english: 'Can you help me?' }
        ]
      },
      {
        type: 'tip',
        text: 'The verb "ir" is always followed by "a" when expressing movement toward a place: "voy a la tienda" (I go to the store). It is also used to form the near future: "voy a comer" (I am going to eat).'
      },
      {
        type: 'warning',
        text: 'Do not confuse "saber" and "conocer." A common mistake is saying "conozco que..." — this is incorrect. Use "saber" for clauses: "sé que tienes razón" (I know that you are right).'
      }
    ],
    exercises: [
      {
        id: 'a2-01-ex1',
        type: 'multiple-choice',
        question: 'Which is the correct conjugation of "ir" for "nosotros"?',
        options: ['imos', 'vamos', 'imos', 'iremos'],
        correct: 1,
        explanation: '"Vamos" is the correct present tense form of "ir" for nosotros. The present tense of ir is completely irregular: voy, vas, va, vamos, vais, van.'
      },
      {
        id: 'a2-01-ex2',
        type: 'fill-blank',
        template: 'Yo ___ la dirección de tu casa. (saber)',
        answer: 'sé',
        explanation: '"Sé" is the yo form of "saber." We use "saber" here because we are talking about knowing a piece of information (an address), not being familiar with a person or place.'
      },
      {
        id: 'a2-01-ex3',
        type: 'translate',
        source: 'They can speak French.',
        answer: 'Ellos pueden hablar francés.',
        direction: 'en-es',
        explanation: '"Poder" conjugated for ellos/ellas is "pueden." The verb that follows stays in the infinitive form: "hablar."'
      },
      {
        id: 'a2-01-ex4',
        type: 'multiple-choice',
        question: 'Fill in the blank: "Yo no ___ a ese actor." (I do not know that actor.)',
        options: ['sé', 'conozco', 'tengo', 'hago'],
        correct: 1,
        explanation: '"Conocer" is used when talking about knowing or being familiar with a person. "Conocer" conjugated for yo is "conozco." Note: when the direct object is a person, Spanish uses "a" before them.'
      },
      {
        id: 'a2-01-ex5',
        type: 'translate',
        source: 'Ella hace la tarea todos los días.',
        answer: 'She does her homework every day.',
        direction: 'es-en',
        explanation: '"Hace" is the third-person singular of "hacer." "La tarea" means "homework" and "todos los días" means "every day."'
      }
    ]
  },
  {
    id: 'a2-02',
    level: 'A2',
    order: 2,
    title: 'Stem-Changing Verbs',
    description: 'Discover the boot verb pattern where stem vowels change in all forms except nosotros and vosotros. Learn three types of changes: e→ie, o→ue, and e→i.',
    estimatedTime: '25 min',
    icon: '🔄',
    content: [
      {
        type: 'text',
        text: 'Stem-changing verbs, also called "boot verbs," follow a special pattern where the vowel in the stem changes in all present tense forms EXCEPT nosotros and vosotros. The changed forms form a "boot" or "shoe" shape in the conjugation table.'
      },
      {
        type: 'rule',
        title: 'The Boot Verb Pattern',
        text: 'The stem changes occur in: yo, tú, él/ella/Ud., ellos/ellas/Uds. — but NOT in nosotros or vosotros. Visualize the changed forms as the outline of a boot shape in the conjugation table.'
      },
      {
        type: 'table',
        headers: ['Pronoun', 'querer e→ie', 'poder o→ue', 'pedir e→i'],
        rows: [
          ['yo', 'quiero ✓', 'puedo ✓', 'pido ✓'],
          ['tú', 'quieres ✓', 'puedes ✓', 'pides ✓'],
          ['él/ella', 'quiere ✓', 'puede ✓', 'pide ✓'],
          ['nosotros', 'queremos (no change)', 'podemos (no change)', 'pedimos (no change)'],
          ['vosotros', 'queréis (no change)', 'podéis (no change)', 'pedís (no change)'],
          ['ellos/ellas', 'quieren ✓', 'pueden ✓', 'piden ✓']
        ]
      },
      {
        type: 'rule',
        title: 'e→ie Verbs',
        text: 'Common e→ie verbs: querer (to want), preferir (to prefer), empezar (to begin), entender (to understand), pensar (to think). The "e" in the stem changes to "ie" in boot positions.'
      },
      {
        type: 'rule',
        title: 'o→ue Verbs',
        text: 'Common o→ue verbs: poder (can/to be able), dormir (to sleep), volver (to return), encontrar (to find), costar (to cost). The "o" in the stem changes to "ue" in boot positions.'
      },
      {
        type: 'rule',
        title: 'e→i Verbs',
        text: 'Common e→i verbs (only -IR verbs): pedir (to ask for/order), servir (to serve), seguir (to follow/continue), repetir (to repeat). The "e" in the stem changes to "i" in boot positions.'
      },
      {
        type: 'examples',
        items: [
          { spanish: 'Prefiero el café al té.', english: 'I prefer coffee to tea.', note: 'preferir: e→ie' },
          { spanish: 'La clase empieza a las nueve.', english: 'The class begins at nine.', note: 'empezar: e→ie' },
          { spanish: '¿Cuánto cuesta este libro?', english: 'How much does this book cost?', note: 'costar: o→ue' },
          { spanish: 'Ella duerme ocho horas.', english: 'She sleeps eight hours.', note: 'dormir: o→ue' },
          { spanish: 'Él pide una pizza.', english: 'He orders a pizza.', note: 'pedir: e→i' },
          { spanish: 'Seguimos estudiando.', english: 'We continue studying.', note: 'seguir: nosotros — no change' }
        ]
      },
      {
        type: 'tip',
        text: 'A helpful trick: if you know a verb has a stem change, just remember it does NOT change in nosotros/vosotros. Those forms are regular. Everything else in the present tense boot gets the changed stem.'
      }
    ],
    exercises: [
      {
        id: 'a2-02-ex1',
        type: 'multiple-choice',
        question: 'How do you conjugate "dormir" for "tú"?',
        options: ['dorms', 'durmes', 'duermes', 'dormes'],
        correct: 2,
        explanation: '"Dormir" is an o→ue stem-changing verb. In the "tú" form (a boot position), the "o" changes to "ue": duermes. The ending -es is regular for -IR verbs.'
      },
      {
        id: 'a2-02-ex2',
        type: 'fill-blank',
        template: 'Nosotros ___ el tren a las cinco. (volver)',
        answer: 'volvemos',
        explanation: '"Volver" is an o→ue stem-changing verb, but "nosotros" is OUTSIDE the boot — so the stem does NOT change. The correct form is "volvemos" (regular conjugation).'
      },
      {
        id: 'a2-02-ex3',
        type: 'translate',
        source: 'I think the exam is tomorrow.',
        answer: 'Pienso que el examen es mañana.',
        direction: 'en-es',
        explanation: '"Pensar" is an e→ie verb. Yo is in the boot, so "pensar" → "pienso." "Que" introduces the subordinate clause.'
      },
      {
        id: 'a2-02-ex4',
        type: 'multiple-choice',
        question: 'Which sentence uses a stem-changing verb INCORRECTLY?',
        options: [
          'Ella vuelve a casa tarde.',
          'Ellos pedimos una ensalada.',
          'Yo encuentro mis llaves.',
          'Tú entiendes la lección.'
        ],
        correct: 1,
        explanation: '"Ellos pedimos" is wrong — "pedimos" is the nosotros form. For ellos, "pedir" (e→i) should be "piden." Mixing subject and conjugation is a common error.'
      },
      {
        id: 'a2-02-ex5',
        type: 'translate',
        source: 'El restaurante sirve comida italiana.',
        answer: 'The restaurant serves Italian food.',
        direction: 'es-en',
        explanation: '"Servir" is an e→i stem-changing verb. "Sirve" is the él/ella form — the "e" changes to "i" in this boot position.'
      }
    ]
  },
  {
    id: 'a2-03',
    level: 'A2',
    order: 3,
    title: 'Reflexive Verbs',
    description: 'Learn how reflexive verbs describe actions done to oneself, especially daily routine activities. Master reflexive pronoun placement and common routine vocabulary.',
    estimatedTime: '25 min',
    icon: '🪞',
    content: [
      {
        type: 'text',
        text: 'Reflexive verbs indicate that the subject performs the action on itself. In Spanish, they are identified by the "-se" ending on the infinitive (e.g., levantarse, ducharse). They require a reflexive pronoun that matches the subject.'
      },
      {
        type: 'table',
        headers: ['Subject', 'Reflexive Pronoun', 'Example with "llamarse"'],
        rows: [
          ['yo', 'me', 'Me llamo Ana. (My name is Ana.)'],
          ['tú', 'te', 'Te llamas Carlos. (Your name is Carlos.)'],
          ['él/ella/Ud.', 'se', 'Se llama Pedro. (His name is Pedro.)'],
          ['nosotros', 'nos', 'Nos llamamos García. (Our name is García.)'],
          ['vosotros', 'os', 'Os llamáis Martínez. (Your name is Martínez.)'],
          ['ellos/Uds.', 'se', 'Se llaman López. (Their name is López.)']
        ]
      },
      {
        type: 'rule',
        title: 'Pronoun Placement',
        text: 'Reflexive pronouns go BEFORE a conjugated verb. However, they can be ATTACHED to the end of infinitives and gerunds (present participles). With conjugated verb + infinitive, both placements are correct.'
      },
      {
        type: 'examples',
        items: [
          { spanish: 'Me levanto a las siete.', english: 'I get up at seven.', note: 'pronoun before conjugated verb' },
          { spanish: 'Voy a levantarme temprano.', english: 'I am going to get up early.', note: 'attached to infinitive' },
          { spanish: 'Me voy a levantar temprano.', english: 'I am going to get up early.', note: 'both placements are correct' },
          { spanish: 'Ella se ducha por la mañana.', english: 'She showers in the morning.' },
          { spanish: 'Nos acostamos tarde los fines de semana.', english: 'We go to bed late on weekends.' },
          { spanish: '¿A qué hora te vistes?', english: 'At what time do you get dressed?' },
          { spanish: 'El niño se siente triste.', english: 'The boy feels sad.' }
        ]
      },
      {
        type: 'table',
        headers: ['Verb', 'Meaning', 'Note'],
        rows: [
          ['levantarse', 'to get up', 'vs. levantar = to lift something'],
          ['ducharse', 'to shower', 'vs. duchar = to shower someone else'],
          ['vestirse', 'to get dressed', 'e→i stem change'],
          ['acostarse', 'to go to bed', 'o→ue stem change'],
          ['llamarse', 'to be called/named', 'most common reflexive in Spanish'],
          ['sentirse', 'to feel (emotion)', 'e→ie stem change']
        ]
      },
      {
        type: 'tip',
        text: 'Many verbs change meaning when used reflexively. "Dormir" means "to sleep" but "dormirse" means "to fall asleep." "Ir" means "to go" but "irse" means "to leave/go away." Learning both forms greatly expands your vocabulary.'
      },
      {
        type: 'warning',
        text: 'Do not omit the reflexive pronoun when using a reflexive verb. Saying "levanto a las siete" instead of "me levanto a las siete" changes the meaning to "I raise (something) at seven" — a completely different sentence.'
      }
    ],
    exercises: [
      {
        id: 'a2-03-ex1',
        type: 'multiple-choice',
        question: 'Which sentence correctly uses a reflexive verb?',
        options: [
          'Yo ducho cada mañana.',
          'Ella se ducha cada mañana.',
          'Nosotros duchamos nos cada mañana.',
          'Tú te duchas se cada mañana.'
        ],
        correct: 1,
        explanation: '"Ella se ducha" is correct — the reflexive pronoun "se" matches the subject "ella" and is placed before the conjugated verb. The other options either omit the pronoun or place it incorrectly.'
      },
      {
        id: 'a2-03-ex2',
        type: 'fill-blank',
        template: 'Ellos ___ acuestan muy tarde los viernes. (acostarse)',
        answer: 'se',
        explanation: 'The reflexive pronoun for ellos/ellas/Uds. is "se." Since the verb is conjugated (acuestan), the pronoun goes before it: "se acuestan."'
      },
      {
        id: 'a2-03-ex3',
        type: 'translate',
        source: 'I feel very tired today.',
        answer: 'Me siento muy cansado hoy.',
        direction: 'en-es',
        explanation: '"Sentirse" is a reflexive verb meaning "to feel." For yo, the pronoun is "me" and the verb conjugates as "siento" (e→ie stem change). "Cansado" is the adjective for tired.'
      },
      {
        id: 'a2-03-ex4',
        type: 'multiple-choice',
        question: 'How do you say "We are going to get dressed now"? (Two correct placements — choose the one listed.)',
        options: [
          'Vamos a vestirse ahora.',
          'Nos vamos a vestir ahora.',
          'Vamos se a vestir ahora.',
          'Se vamos a vestir ahora.'
        ],
        correct: 1,
        explanation: 'When a reflexive verb follows "ir a + infinitive," the pronoun can attach to the infinitive ("vamos a vestirnos") or go before the conjugated verb ("nos vamos a vestir"). Option B is the correct version of the second placement.'
      },
      {
        id: 'a2-03-ex5',
        type: 'translate',
        source: '¿Cómo te llamas?',
        answer: 'What is your name?',
        direction: 'es-en',
        explanation: '"Llamarse" is the reflexive verb for being named. "¿Cómo te llamas?" literally means "How do you call yourself?" and is the standard way to ask someone\'s name in Spanish.'
      }
    ]
  },
  {
    id: 'a2-04',
    level: 'A2',
    order: 4,
    title: 'Preterite Tense: Regular Verbs',
    description: 'Learn to talk about completed past actions using the preterite tense. Master the regular conjugation endings for -AR, -ER, and -IR verbs with common time markers.',
    estimatedTime: '25 min',
    icon: '📖',
    content: [
      {
        type: 'text',
        text: 'The preterite tense (pretérito indefinido) is used to describe actions that were completed at a specific point in the past. It answers the question: "What happened?" at a definite time.'
      },
      {
        type: 'table',
        headers: ['Pronoun', '-AR: hablar', '-ER: comer', '-IR: vivir'],
        rows: [
          ['yo', 'hablé', 'comí', 'viví'],
          ['tú', 'hablaste', 'comiste', 'viviste'],
          ['él/ella/Ud.', 'habló', 'comió', 'vivió'],
          ['nosotros', 'hablamos', 'comimos', 'vivimos'],
          ['vosotros', 'hablasteis', 'comisteis', 'vivisteis'],
          ['ellos/Uds.', 'hablaron', 'comieron', 'vivieron']
        ]
      },
      {
        type: 'rule',
        title: '-AR Preterite Endings',
        text: 'The endings for -AR verbs in the preterite are: -é, -aste, -ó, -amos, -asteis, -aron. Note the accent marks on yo (-é) and él/ella (-ó) to distinguish them from present tense forms.'
      },
      {
        type: 'rule',
        title: '-ER and -IR Preterite Endings',
        text: '-ER and -IR verbs share the same preterite endings: -í, -iste, -ió, -imos, -isteis, -ieron. The nosotros form of -IR verbs is the same in present and preterite, so context clarifies the tense.'
      },
      {
        type: 'table',
        headers: ['Time Marker', 'Meaning', 'Example'],
        rows: [
          ['ayer', 'yesterday', 'Ayer hablé con mi madre.'],
          ['anoche', 'last night', 'Anoche comí pizza.'],
          ['la semana pasada', 'last week', 'La semana pasada viajé a París.'],
          ['el mes pasado', 'last month', 'El mes pasado empecé un curso.'],
          ['el año pasado', 'last year', 'El año pasado vivimos en Madrid.'],
          ['hace X tiempo', 'X time ago', 'Hace dos horas llamé a Juan.']
        ]
      },
      {
        type: 'examples',
        items: [
          { spanish: 'Ayer hablé con mi jefe.', english: 'Yesterday I spoke with my boss.' },
          { spanish: 'Comimos en un restaurante italiano.', english: 'We ate at an Italian restaurant.' },
          { spanish: 'Ella vivió en Barcelona tres años.', english: 'She lived in Barcelona for three years.' },
          { spanish: '¿Estudiaste para el examen?', english: 'Did you study for the exam?' },
          { spanish: 'Hace una hora llegaron los invitados.', english: 'The guests arrived an hour ago.' }
        ]
      },
      {
        type: 'tip',
        text: 'The nosotros form of -AR and -IR regular verbs is identical in the present and preterite tense (e.g., "hablamos" and "vivimos"). Context — especially time markers — will tell you which tense is meant.'
      },
      {
        type: 'warning',
        text: 'Do not forget the written accents on yo and él/ella forms: "hablé" (I spoke) vs. "hable" (present subjunctive), and "habló" (he/she spoke) vs. "hablo" (I speak in present). The accent changes both pronunciation and meaning.'
      }
    ],
    exercises: [
      {
        id: 'a2-04-ex1',
        type: 'multiple-choice',
        question: 'What is the preterite of "comer" for "ellos"?',
        options: ['comaron', 'comeron', 'comieron', 'comieron'],
        correct: 2,
        explanation: 'The preterite of -ER verbs for ellos/ellas/Uds. ends in "-ieron": comieron. Note: -ieron (not -aron) is used for -ER and -IR verbs.'
      },
      {
        id: 'a2-04-ex2',
        type: 'fill-blank',
        template: 'Ella ___ en México por cinco años. (vivir)',
        answer: 'vivió',
        explanation: '"Vivir" is a regular -IR verb. The preterite for él/ella/Ud. ends in "-ió": vivió. The accent mark is required.'
      },
      {
        id: 'a2-04-ex3',
        type: 'translate',
        source: 'Last week we spoke with the doctor.',
        answer: 'La semana pasada hablamos con el médico.',
        direction: 'en-es',
        explanation: '"Hablar" is a regular -AR verb. The nosotros preterite is "hablamos." "La semana pasada" means "last week" and is a preterite time marker.'
      },
      {
        id: 'a2-04-ex4',
        type: 'multiple-choice',
        question: 'Which time marker is typically used with the preterite tense?',
        options: ['siempre', 'todos los días', 'ayer', 'normalmente'],
        correct: 2,
        explanation: '"Ayer" (yesterday) signals a completed action at a specific past time, making it a preterite marker. "Siempre," "todos los días," and "normalmente" indicate habits/routines, which use the present or imperfect tense.'
      },
      {
        id: 'a2-04-ex5',
        type: 'translate',
        source: '¿Comiste el desayuno esta mañana?',
        answer: 'Did you eat breakfast this morning?',
        direction: 'es-en',
        explanation: '"Comiste" is the tú form of the preterite of "comer." "Esta mañana" (this morning) is a time marker indicating a completed past action.'
      }
    ]
  },
  {
    id: 'a2-05',
    level: 'A2',
    order: 5,
    title: 'Preterite Tense: Irregular Verbs',
    description: 'Master the most common irregular preterite forms including ser/ir, estar, tener, hacer, and more. Learn spelling-change verbs ending in -car, -gar, and -zar.',
    estimatedTime: '30 min',
    icon: '⚡',
    content: [
      {
        type: 'text',
        text: 'Many of the most common Spanish verbs have completely irregular forms in the preterite. Unlike regular verbs, these forms must be memorized individually. The good news is they share some common patterns.'
      },
      {
        type: 'rule',
        title: 'Ser and Ir Share the Same Preterite Forms',
        text: 'The verbs "ser" (to be) and "ir" (to go) are identical in the preterite: fui, fuiste, fue, fuimos, fuisteis, fueron. Context makes the meaning clear.'
      },
      {
        type: 'table',
        headers: ['Pronoun', 'ser/ir', 'estar', 'tener', 'hacer', 'poder', 'querer', 'saber'],
        rows: [
          ['yo', 'fui', 'estuve', 'tuve', 'hice', 'pude', 'quise', 'supe'],
          ['tú', 'fuiste', 'estuviste', 'tuviste', 'hiciste', 'pudiste', 'quisiste', 'supiste'],
          ['él/ella', 'fue', 'estuvo', 'tuvo', 'hizo', 'pudo', 'quiso', 'supo'],
          ['nosotros', 'fuimos', 'estuvimos', 'tuvimos', 'hicimos', 'pudimos', 'quisimos', 'supimos'],
          ['vosotros', 'fuisteis', 'estuvisteis', 'tuvisteis', 'hicisteis', 'pudisteis', 'quisisteis', 'supisteis'],
          ['ellos', 'fueron', 'estuvieron', 'tuvieron', 'hicieron', 'pudieron', 'quisieron', 'supieron']
        ]
      },
      {
        type: 'rule',
        title: 'Spelling-Change Verbs: -car, -gar, -zar',
        text: 'In the yo form of the preterite, verbs ending in -car change c→qu, verbs ending in -gar change g→gu, and verbs ending in -zar change z→c. This preserves the original sound before the -é ending. All other forms are regular.'
      },
      {
        type: 'table',
        headers: ['Infinitive', 'Yo (preterite)', 'Rule', 'Other forms (regular)'],
        rows: [
          ['buscar', 'busqué', 'c→qu before e', 'buscaste, buscó...'],
          ['tocar', 'toqué', 'c→qu before e', 'tocaste, tocó...'],
          ['llegar', 'llegué', 'g→gu before e', 'llegaste, llegó...'],
          ['pagar', 'pagué', 'g→gu before e', 'pagaste, pagó...'],
          ['empezar', 'empecé', 'z→c before e', 'empezaste, empezó...'],
          ['comenzar', 'comencé', 'z→c before e', 'comenzaste, comenzó...']
        ]
      },
      {
        type: 'examples',
        items: [
          { spanish: 'Fui al médico ayer.', english: 'I went to the doctor yesterday.', note: 'ir preterite' },
          { spanish: 'La película fue muy buena.', english: 'The film was very good.', note: 'ser preterite' },
          { spanish: 'Estuve en casa todo el día.', english: 'I was at home all day.', note: 'estar preterite' },
          { spanish: 'Hice los deberes anoche.', english: 'I did the homework last night.', note: 'hacer: hice (yo), hizo (él)' },
          { spanish: 'Busqué mis llaves por todas partes.', english: 'I looked for my keys everywhere.', note: 'buscar: c→qu in yo form' },
          { spanish: 'Llegué tarde a la reunión.', english: 'I arrived late to the meeting.', note: 'llegar: g→gu in yo form' }
        ]
      },
      {
        type: 'tip',
        text: 'Notice that "hacer" changes to "hizo" (not "hizó") in the third-person singular — there is NO accent mark, unlike regular preterite forms. This is because the entire form is irregular.'
      },
      {
        type: 'warning',
        text: 'Irregular preterite verbs (like estar, tener, etc.) do NOT have accent marks on the yo or él/ella forms. This contrasts with regular verbs where those forms do have accents (hablé, habló). Do not add accents to irregular forms.'
      }
    ],
    exercises: [
      {
        id: 'a2-05-ex1',
        type: 'multiple-choice',
        question: 'What is the preterite yo form of "llegar"?',
        options: ['llegé', 'llegué', 'llegé', 'lleguí'],
        correct: 1,
        explanation: '"Llegar" ends in -gar, so in the yo preterite form, g changes to gu before the -é ending: "llegué." This preserves the hard /g/ sound.'
      },
      {
        id: 'a2-05-ex2',
        type: 'fill-blank',
        template: 'Ayer nosotros ___ al parque a correr. (ir)',
        answer: 'fuimos',
        explanation: '"Ir" and "ser" share the same preterite forms. For nosotros, the form is "fuimos." Context (al parque = to the park) tells us this is "ir" (to go), not "ser" (to be).'
      },
      {
        id: 'a2-05-ex3',
        type: 'translate',
        source: 'She was at the office until nine.',
        answer: 'Ella estuvo en la oficina hasta las nueve.',
        direction: 'en-es',
        explanation: '"Estar" in the preterite for ella is "estuvo." "Hasta" means "until." "La oficina" is "the office." Note no accent mark on "estuvo" — irregular preterites do not take accents.'
      },
      {
        id: 'a2-05-ex4',
        type: 'multiple-choice',
        question: 'Which is the correct preterite of "hacer" for "él"?',
        options: ['hacó', 'hizó', 'hizo', 'hació'],
        correct: 2,
        explanation: '"Hizo" is the irregular preterite of "hacer" for él/ella/Ud. Note the spelling change from c to z (to preserve the /θ/ or /s/ sound), and there is NO accent mark.'
      },
      {
        id: 'a2-05-ex5',
        type: 'translate',
        source: 'Tuve que trabajar el fin de semana pasado.',
        answer: 'I had to work last weekend.',
        direction: 'es-en',
        explanation: '"Tuve" is the yo preterite of "tener." "Tener que + infinitive" means "to have to do something." "El fin de semana pasado" means "last weekend."'
      }
    ]
  },
  {
    id: 'a2-06',
    level: 'A2',
    order: 6,
    title: 'Direct Object Pronouns',
    description: 'Learn to use direct object pronouns to replace nouns and avoid repetition. Master placement rules before conjugated verbs and attached to infinitives and gerunds.',
    estimatedTime: '20 min',
    icon: '👆',
    content: [
      {
        type: 'text',
        text: 'A direct object receives the action of the verb directly. Direct object pronouns replace these nouns to avoid repetition. For example, instead of saying "I see María" again, you say "I see her."'
      },
      {
        type: 'table',
        headers: ['Person', 'Singular', 'Plural'],
        rows: [
          ['1st person', 'me (me)', 'nos (us)'],
          ['2nd person', 'te (you informal)', 'os (you all, Spain)'],
          ['3rd masc.', 'lo (him/it)', 'los (them/you all masc.)'],
          ['3rd fem.', 'la (her/it)', 'las (them/you all fem.)']
        ]
      },
      {
        type: 'rule',
        title: 'Placement Rules',
        text: 'Direct object pronouns go BEFORE a conjugated verb. They can also be ATTACHED to the end of infinitives, gerunds (-ando/-iendo forms), and affirmative commands. With a conjugated verb + infinitive, both placements are acceptable.'
      },
      {
        type: 'examples',
        items: [
          { spanish: '¿Tienes el libro? Sí, lo tengo.', english: 'Do you have the book? Yes, I have it.', note: 'lo replaces "el libro" (masc. sing.)' },
          { spanish: 'Veo a María todos los días. La veo todos los días.', english: 'I see María every day. I see her every day.', note: 'la replaces "a María" (fem. sing.)' },
          { spanish: 'Quiero comerlo.', english: 'I want to eat it.', note: 'attached to infinitive' },
          { spanish: 'Lo quiero comer.', english: 'I want to eat it.', note: 'before conjugated verb — both correct' },
          { spanish: 'Estoy leyéndolo.', english: 'I am reading it.', note: 'attached to gerund' },
          { spanish: 'No lo entiendo.', english: 'I do not understand it.', note: 'pronoun between no and verb in negation' },
          { spanish: 'Nos llaman mañana.', english: 'They will call us tomorrow.', note: 'nos = us (1st plural)' }
        ]
      },
      {
        type: 'rule',
        title: 'Masculine vs. Feminine Agreement',
        text: 'Choose lo/los for masculine nouns and la/las for feminine nouns. The number (singular/plural) must also match the noun being replaced: "los libros" → "los"; "las revistas" → "las."'
      },
      {
        type: 'tip',
        text: 'In Spain, "le/les" is also commonly used as a direct object pronoun for masculine persons (called "leísmo"). This is considered acceptable in Spain but not in Latin America. In standard Spanish, stick with "lo/los" for masculine direct objects.'
      },
      {
        type: 'warning',
        text: 'In negative sentences, the pronoun still comes BEFORE the conjugated verb, between "no" and the verb: "No lo veo" (I do not see it). Never place it after the verb in a negative sentence.'
      }
    ],
    exercises: [
      {
        id: 'a2-06-ex1',
        type: 'multiple-choice',
        question: 'Replace the underlined noun: "Compro [las manzanas] en el mercado."',
        options: ['lo compro en el mercado.', 'la compro en el mercado.', 'las compro en el mercado.', 'los compro en el mercado.'],
        correct: 2,
        explanation: '"Las manzanas" is feminine plural, so it is replaced by "las." The pronoun goes before the conjugated verb: "Las compro en el mercado."'
      },
      {
        id: 'a2-06-ex2',
        type: 'fill-blank',
        template: '¿Ves a tus amigos? Sí, ___ veo todos los fines de semana.',
        answer: 'los',
        explanation: '"Amigos" is masculine plural, so the direct object pronoun is "los." It is placed before the conjugated verb "veo."'
      },
      {
        id: 'a2-06-ex3',
        type: 'translate',
        source: 'I want to call her tonight.',
        answer: 'Quiero llamarla esta noche.',
        direction: 'en-es',
        explanation: '"Her" as a direct object becomes "la" in Spanish. It can attach to the infinitive "llamar" → "llamarla," or go before the conjugated verb: "La quiero llamar." Both are correct; this answer uses the attached form.'
      },
      {
        id: 'a2-06-ex4',
        type: 'multiple-choice',
        question: 'Which sentence correctly uses a direct object pronoun in a negative sentence?',
        options: [
          'No veo lo.',
          'No lo veo.',
          'Lo no veo.',
          'Veo no lo.'
        ],
        correct: 1,
        explanation: 'In negative sentences, the order is: No + pronoun + conjugated verb. "No lo veo" is correct. The pronoun always goes between "no" and the verb.'
      },
      {
        id: 'a2-06-ex5',
        type: 'translate',
        source: 'Estoy buscándote por todas partes.',
        answer: 'I am looking for you everywhere.',
        direction: 'es-en',
        explanation: '"Te" is the direct object pronoun for tú. It is attached to the gerund "buscando" → "buscándote." Note the accent added to maintain stress. "Por todas partes" = "everywhere."'
      }
    ]
  },
  {
    id: 'a2-07',
    level: 'A2',
    order: 7,
    title: 'Indirect Object Pronouns',
    description: 'Learn indirect object pronouns to express to whom or for whom an action is done. Master the important le→se change and the correct order when using two pronouns together.',
    estimatedTime: '20 min',
    icon: '🎁',
    content: [
      {
        type: 'text',
        text: 'An indirect object tells us TO WHOM or FOR WHOM the action is done. For example, in "I give the book TO HER," "her" is the indirect object. In Spanish, indirect object pronouns are very common, even when the noun is mentioned.'
      },
      {
        type: 'table',
        headers: ['Person', 'Indirect Object Pronoun', 'Meaning'],
        rows: [
          ['1st sing.', 'me', 'to/for me'],
          ['2nd sing.', 'te', 'to/for you (informal)'],
          ['3rd sing.', 'le', 'to/for him/her/you (formal)'],
          ['1st plural', 'nos', 'to/for us'],
          ['2nd plural', 'os', 'to/for you all (Spain)'],
          ['3rd plural', 'les', 'to/for them/you all']
        ]
      },
      {
        type: 'rule',
        title: 'The le→se Change',
        text: 'When both an indirect object pronoun (le or les) and a direct object pronoun (lo, la, los, las) appear together, le/les MUST change to SE. You never say "le lo" — always "se lo." The order is always: IO before DO.'
      },
      {
        type: 'examples',
        items: [
          { spanish: 'Le digo la verdad.', english: 'I tell him/her the truth.', note: 'le = indirect object (to him/her)' },
          { spanish: 'Te mando un mensaje.', english: 'I send you a message.', note: 'te = to you' },
          { spanish: 'Nos dan mucha tarea.', english: 'They give us a lot of homework.', note: 'nos = to us' },
          { spanish: '¿Le das el regalo a María?', english: 'Are you giving the gift to María?', note: 'clarifying phrase "a María" often added' },
          { spanish: 'Se lo doy a ella. (NOT "Le lo doy")', english: 'I give it to her.', note: 'le→se before lo (double pronoun rule)' },
          { spanish: 'Les explico la gramática.', english: 'I explain the grammar to them.', note: 'les = to them' }
        ]
      },
      {
        type: 'rule',
        title: 'Clarifying Phrases',
        text: 'Since "le" and "les" can refer to several people (him, her, you, them), Spanish often adds a clarifying phrase: "a él," "a ella," "a usted," "a ellos," etc. This is optional but very common: "Le hablo a ella" (I am speaking to her).'
      },
      {
        type: 'table',
        headers: ['Phrase', 'Meaning'],
        rows: [
          ['Le digo (a él/ella/Ud.)', 'I tell him/her/you'],
          ['Le doy (a él/ella/Ud.)', 'I give (to) him/her/you'],
          ['Le mando (a él/ella/Ud.)', 'I send (to) him/her/you'],
          ['Se lo digo (a él/ella)', 'I tell it to him/her (DO + IO together)'],
          ['Se lo doy (a ellos)', 'I give it to them (DO + IO together)']
        ]
      },
      {
        type: 'tip',
        text: 'In Spanish, it is very common to use the indirect object pronoun even when the noun is present: "Le doy el libro a Juan" (I give the book to Juan). This redundant pronoun is standard and not a mistake — it is called "pronoun doubling."'
      }
    ],
    exercises: [
      {
        id: 'a2-07-ex1',
        type: 'multiple-choice',
        question: 'What happens to "le" when it is followed by "lo"?',
        options: [
          'It stays as "le lo"',
          'It changes to "se"',
          'It is dropped',
          'It changes to "lo"'
        ],
        correct: 1,
        explanation: 'When indirect object pronoun "le" or "les" is followed by a direct object pronoun (lo, la, los, las), "le/les" changes to "se." So "le lo" becomes "se lo." This rule exists for ease of pronunciation.'
      },
      {
        id: 'a2-07-ex2',
        type: 'fill-blank',
        template: 'Ella ___ escribe cartas a su abuela todos los domingos.',
        answer: 'le',
        explanation: 'The indirect object "a su abuela" (to her grandmother) is a third-person singular recipient, so the indirect object pronoun is "le." It goes before the conjugated verb "escribe."'
      },
      {
        id: 'a2-07-ex3',
        type: 'translate',
        source: 'Can you tell me the time?',
        answer: '¿Puedes decirme la hora?',
        direction: 'en-es',
        explanation: '"Me" is the indirect object pronoun for "to me." It can attach to the infinitive "decir" → "decirme," or go before the conjugated verb: "¿Me puedes decir la hora?" Both are correct.'
      },
      {
        id: 'a2-07-ex4',
        type: 'multiple-choice',
        question: 'How do you say "I give it to them" using correct double pronouns?',
        options: [
          'Les lo doy.',
          'Lo les doy.',
          'Se lo doy.',
          'Lo se doy.'
        ],
        correct: 2,
        explanation: '"Les" (to them) + "lo" (it) — when indirect comes before direct, "les" changes to "se": "Se lo doy." The order is always indirect object pronoun (se) before direct object pronoun (lo).'
      },
      {
        id: 'a2-07-ex5',
        type: 'translate',
        source: 'Mi madre nos prepara el desayuno cada mañana.',
        answer: 'My mother prepares breakfast for us every morning.',
        direction: 'es-en',
        explanation: '"Nos" is the indirect object pronoun for nosotros, meaning "for us" or "to us." "Prepara" is the third-person present of "preparar." "El desayuno" is "breakfast."'
      }
    ]
  },
  {
    id: 'a2-08',
    level: 'A2',
    order: 8,
    title: 'Gustar & Similar Verbs',
    description: 'Master the unique structure of "gustar" and related verbs where the thing liked is the subject. Learn similar verbs like encantar, molestar, and interesar.',
    estimatedTime: '20 min',
    icon: '❤️',
    content: [
      {
        type: 'text',
        text: 'The verb "gustar" works differently from English "to like." In Spanish, the thing you like is actually the SUBJECT of the sentence, and the person who likes it is the INDIRECT OBJECT. This means the verb agrees with what is liked, not with the person.'
      },
      {
        type: 'rule',
        title: 'Structure of Gustar',
        text: 'The pattern is: (Indirect object noun phrase) + Indirect Object Pronoun + gusta/gustan + Subject. Use "gusta" when what follows is singular or an infinitive, and "gustan" when what follows is plural.'
      },
      {
        type: 'table',
        headers: ['English', 'Spanish', 'Note'],
        rows: [
          ['I like coffee.', 'Me gusta el café.', 'singular noun → gusta'],
          ['I like books.', 'Me gustan los libros.', 'plural noun → gustan'],
          ['I like to run.', 'Me gusta correr.', 'infinitive → always gusta'],
          ['She likes music.', 'Le gusta la música.', 'le = to her'],
          ['We like the films.', 'Nos gustan las películas.', 'nos = to us'],
          ['They like to dance.', 'Les gusta bailar.', 'les = to them']
        ]
      },
      {
        type: 'rule',
        title: 'Clarifying the Indirect Object',
        text: 'Since "le" is ambiguous (him/her/you), clarify with: A mí, A ti, A él/ella/usted, A nosotros, A vosotros, A ellos/ellas/ustedes. Example: "A ella le gusta el arte" (She likes art).'
      },
      {
        type: 'table',
        headers: ['Verb', 'Meaning', 'Example'],
        rows: [
          ['encantar', 'to love (something)', 'Me encanta el chocolate.'],
          ['molestar', 'to bother/annoy', 'Me molesta el ruido.'],
          ['parecer', 'to seem/appear', 'Me parece bien. (It seems fine to me.)'],
          ['interesar', 'to interest', 'Le interesa la historia.'],
          ['importar', 'to matter/care', 'No me importa. (I do not care.)'],
          ['faltar', 'to be missing/lack', 'Me faltan dos euros.'],
          ['quedar', 'to have left/remain', 'Me quedan tres días.']
        ]
      },
      {
        type: 'examples',
        items: [
          { spanish: 'A mí me encanta la pizza.', english: 'I love pizza.', note: '"A mí" added for emphasis' },
          { spanish: 'A él le molesta el tráfico.', english: 'Traffic bothers him.' },
          { spanish: '¿Te interesa aprender chino?', english: 'Are you interested in learning Chinese?' },
          { spanish: 'Nos faltan ideas.', english: 'We are short on ideas.', note: 'ideas (plural) → faltan' },
          { spanish: 'No me importa el precio.', english: 'The price does not matter to me.' }
        ]
      },
      {
        type: 'tip',
        text: 'To express strong likes and dislikes: "me gusta mucho" (I like it a lot), "me encanta" (I love it), "no me gusta nada" (I do not like it at all), "me disgusta" or "me cae mal" (I dislike it).'
      },
      {
        type: 'warning',
        text: 'A very common error is saying "yo gusto la pizza" by directly translating from English "I like pizza." This is wrong in Spanish. Always use the indirect object pronoun structure: "Me gusta la pizza."'
      }
    ],
    exercises: [
      {
        id: 'a2-08-ex1',
        type: 'multiple-choice',
        question: 'Complete: "A ella ___ las películas de terror."',
        options: ['le gusta', 'le gustan', 'la gusta', 'la gustan'],
        correct: 1,
        explanation: '"Las películas" is plural (feminine), so the verb must be "gustan" (plural). The indirect object pronoun for "ella" is "le." Therefore: "le gustan."'
      },
      {
        id: 'a2-08-ex2',
        type: 'fill-blank',
        template: 'A nosotros nos ___ mucho viajar.',
        answer: 'gusta',
        explanation: '"Viajar" is an infinitive. Gustar-type verbs always use the singular form "gusta" with infinitives, regardless of how many people are involved.'
      },
      {
        id: 'a2-08-ex3',
        type: 'translate',
        source: 'I love this song.',
        answer: 'Me encanta esta canción.',
        direction: 'en-es',
        explanation: '"Encantar" works exactly like "gustar." "This song" (esta canción) is singular, so use "encanta." The indirect object pronoun for yo is "me."'
      },
      {
        id: 'a2-08-ex4',
        type: 'multiple-choice',
        question: 'How do you say "The noise bothers us"?',
        options: [
          'Nos molesta el ruido.',
          'El ruido molesta nos.',
          'Nos molestamos el ruido.',
          'El ruido nos gusta no.'
        ],
        correct: 0,
        explanation: '"Molestar" works like "gustar." "El ruido" (the noise) is the subject (singular → molesta). "Nos" is the indirect object pronoun for us. Correct order: Nos + molesta + el ruido.'
      },
      {
        id: 'a2-08-ex5',
        type: 'translate',
        source: '¿Te interesan las matemáticas?',
        answer: 'Are you interested in mathematics?',
        direction: 'es-en',
        explanation: '"Interesar" works like "gustar." "Las matemáticas" is plural → "interesan." "Te" is the indirect object pronoun for tú. Literally: "Does mathematics interest you?"'
      }
    ]
  },
  {
    id: 'a2-09',
    level: 'A2',
    order: 9,
    title: 'Comparatives & Superlatives',
    description: 'Learn to compare people, things, and qualities using comparatives and superlatives. Master irregular forms and useful comparison expressions.',
    estimatedTime: '20 min',
    icon: '📊',
    content: [
      {
        type: 'text',
        text: 'Comparatives and superlatives allow you to compare things and describe extremes. Spanish has clear structures for saying something is more, less, or equally something, as well as expressing the most or least.'
      },
      {
        type: 'rule',
        title: 'Comparatives of Inequality',
        text: 'To express "more than" use: más + adjective/adverb/noun + que. To express "less than" use: menos + adjective/adverb/noun + que.'
      },
      {
        type: 'rule',
        title: 'Comparatives of Equality',
        text: 'To express "as...as" use: tan + adjective/adverb + como. To compare nouns use: tanto/tanta/tantos/tantas + noun + como (agree in gender and number).'
      },
      {
        type: 'table',
        headers: ['Type', 'Structure', 'Example'],
        rows: [
          ['More than', 'más + adj + que', 'Madrid es más grande que Sevilla.'],
          ['Less than', 'menos + adj + que', 'Este libro es menos interesante que ese.'],
          ['As...as', 'tan + adj + como', 'Ella es tan inteligente como él.'],
          ['As much...as', 'tanto/a + noun + como', 'Tengo tanta paciencia como tú.'],
          ['As many...as', 'tantos/as + noun + como', 'Hay tantos estudiantes como el año pasado.']
        ]
      },
      {
        type: 'rule',
        title: 'Superlatives',
        text: 'The superlative (the most/least) uses: el/la/los/las + más/menos + adjective (+ de). The article must agree in gender and number with the noun it modifies.'
      },
      {
        type: 'examples',
        items: [
          { spanish: 'Es el restaurante más caro de la ciudad.', english: 'It is the most expensive restaurant in the city.', note: 'superlative: el + más + adj + de' },
          { spanish: 'Ella es la estudiante menos tímida de la clase.', english: 'She is the least shy student in the class.' },
          { spanish: 'Este problema es más difícil que el anterior.', english: 'This problem is harder than the previous one.' },
          { spanish: 'No soy tan alto como mi hermano.', english: 'I am not as tall as my brother.' }
        ]
      },
      {
        type: 'table',
        headers: ['Adjective', 'Regular comparative', 'Irregular comparative', 'Superlative'],
        rows: [
          ['bueno (good)', 'más bueno', 'mejor (better)', 'el mejor (the best)'],
          ['malo (bad)', 'más malo', 'peor (worse)', 'el peor (the worst)'],
          ['grande (big/old)', 'más grande', 'mayor (older/greater)', 'el mayor (the oldest/greatest)'],
          ['pequeño (small/young)', 'más pequeño', 'menor (younger/lesser)', 'el menor (the youngest/least)']
        ]
      },
      {
        type: 'examples',
        items: [
          { spanish: 'Mi hermana mayor tiene treinta años.', english: 'My older sister is thirty years old.', note: 'mayor = older (for people)' },
          { spanish: 'Este hotel es el peor de todos.', english: 'This hotel is the worst of all.', note: 'peor = worse/worst' },
          { spanish: 'Cada vez hace más calor.', english: 'It is getting hotter and hotter.', note: 'cada vez más = more and more' },
          { spanish: 'Cuanto más estudias, más aprendes.', english: 'The more you study, the more you learn.', note: 'cuanto más... más...' }
        ]
      },
      {
        type: 'tip',
        text: 'Use "mayor" and "menor" primarily for age when referring to people: "mi hermano mayor" (my older brother). For physical size, "más grande" and "más pequeño" are more appropriate: "una caja más grande" (a bigger box).'
      }
    ],
    exercises: [
      {
        id: 'a2-09-ex1',
        type: 'multiple-choice',
        question: 'Complete: "Este coche es ___ el otro." (This car is more expensive than the other.)',
        options: ['más caro como', 'más caro que', 'tan caro como', 'menos caro de'],
        correct: 1,
        explanation: 'For comparatives of inequality (more than), use "más + adjective + que." The correct sentence is "Este coche es más caro que el otro." The word "que" (than) is key.'
      },
      {
        id: 'a2-09-ex2',
        type: 'fill-blank',
        template: 'Ella es ___ alta como su madre.',
        answer: 'tan',
        explanation: 'For equality comparisons with adjectives, use "tan + adjective + como" (as...as). "Tan alta como su madre" = "as tall as her mother."'
      },
      {
        id: 'a2-09-ex3',
        type: 'translate',
        source: 'He is the best student in the school.',
        answer: 'Él es el mejor estudiante de la escuela.',
        direction: 'en-es',
        explanation: '"Mejor" is the irregular superlative/comparative of "bueno." In superlatives, use "de" (not "en") after the superlative: "el mejor... de la escuela." For masculine singular, use "el mejor."'
      },
      {
        id: 'a2-09-ex4',
        type: 'multiple-choice',
        question: 'Which sentence correctly uses an irregular comparative?',
        options: [
          'Este libro es más bueno que ese.',
          'Este libro es mejor que ese.',
          'Este libro es el más bueno.',
          'Este libro está más bien que ese.'
        ],
        correct: 1,
        explanation: 'While "más bueno" is grammatically possible in some contexts (moral goodness), the standard and preferred comparative of "bueno" is "mejor" (better). "Este libro es mejor que ese" is the natural and correct choice.'
      },
      {
        id: 'a2-09-ex5',
        type: 'translate',
        source: 'Cada vez hay menos tiempo.',
        answer: 'There is less and less time.',
        direction: 'es-en',
        explanation: '"Cada vez más/menos" translates to "more and more" or "less and less." "Cada vez hay menos tiempo" literally means "each time there is less time" = "there is less and less time."'
      }
    ]
  },
  {
    id: 'a2-10',
    level: 'A2',
    order: 10,
    title: 'Question Words',
    description: 'Master all Spanish question words (interrogativos) and learn to form correct questions. Understand the crucial distinction between ¿Qué? and ¿Cuál? and when to use each.',
    estimatedTime: '20 min',
    icon: '❓',
    content: [
      {
        type: 'text',
        text: 'Question words (palabras interrogativas) are used to ask for specific information. In Spanish, all question words carry a written accent mark to distinguish them from their non-question uses. Spanish also uses an inverted question mark ¿ at the beginning of every question.'
      },
      {
        type: 'table',
        headers: ['Question Word', 'Meaning', 'Example'],
        rows: [
          ['¿Qué?', 'What?', '¿Qué comes? (What are you eating?)'],
          ['¿Quién?', 'Who? (singular)', '¿Quién es ese hombre? (Who is that man?)'],
          ['¿Quiénes?', 'Who? (plural)', '¿Quiénes son ellos? (Who are they?)'],
          ['¿Cuándo?', 'When?', '¿Cuándo llegas? (When do you arrive?)'],
          ['¿Dónde?', 'Where?', '¿Dónde vives? (Where do you live?)'],
          ['¿Adónde?', 'Where to?', '¿Adónde vas? (Where are you going?)'],
          ['¿Cómo?', 'How? / What?', '¿Cómo estás? (How are you?)'],
          ['¿Por qué?', 'Why?', '¿Por qué estudias español? (Why do you study Spanish?)'],
          ['¿Cuánto/a?', 'How much?', '¿Cuánto cuesta? (How much does it cost?)'],
          ['¿Cuántos/as?', 'How many?', '¿Cuántos años tienes? (How old are you?)'],
          ['¿Cuál?', 'Which one? / What?', '¿Cuál es tu número? (What is your number?)'],
          ['¿Cuáles?', 'Which ones?', '¿Cuáles prefieres? (Which ones do you prefer?)']
        ]
      },
      {
        type: 'rule',
        title: '¿Qué? vs. ¿Cuál?',
        text: 'This is one of the most common points of confusion for English speakers. Use ¿Qué? to ask for a definition or explanation ("What is...?"), or before nouns. Use ¿Cuál/Cuáles? when selecting from a set of options, or before "es/son" when asking for specific information (like name, address, phone number).'
      },
      {
        type: 'table',
        headers: ['Situation', '¿Qué? or ¿Cuál?', 'Example'],
        rows: [
          ['Asking for definition', '¿Qué?', '¿Qué es el amor? (What is love? — define it)'],
          ['Asking for specific info', '¿Cuál?', '¿Cuál es tu nombre? (What is your name?)'],
          ['Before a noun', '¿Qué?', '¿Qué libro lees? (What book are you reading?)'],
          ['Selecting from options', '¿Cuál?', '¿Cuál quieres, el rojo o el azul? (Which do you want?)'],
          ['Asking phone/address/number', '¿Cuál?', '¿Cuál es tu dirección? (What is your address?)']
        ]
      },
      {
        type: 'rule',
        title: 'Inverted Question Marks',
        text: 'Spanish requires an inverted question mark ¿ at the beginning of every question and a regular question mark ? at the end. This applies to both written questions and to parts of sentences that are questions: "No sé cuándo llega" does NOT use question marks, but "¿Cuándo llega?" does.'
      },
      {
        type: 'examples',
        items: [
          { spanish: '¿Por qué no vienes a la fiesta?', english: 'Why are you not coming to the party?', note: '¿Por qué? is two words (why); "porque" is one word (because)' },
          { spanish: '¿Adónde vas este verano?', english: 'Where are you going this summer?', note: '¿Adónde? with movement verbs like ir' },
          { spanish: '¿Cómo te llamas?', english: 'What is your name?', note: '¿Cómo? can mean "what" in set expressions' },
          { spanish: '¿Cuántas personas hay en tu familia?', english: 'How many people are in your family?', note: '¿Cuántas? agrees with feminine noun "personas"' },
          { spanish: '¿Cuál de estos prefiere usted?', english: 'Which of these do you prefer?', note: 'selecting from specific options → ¿Cuál?' }
        ]
      },
      {
        type: 'tip',
        text: 'Remember: "por qué" (two words, with accent = why?) vs. "porque" (one word, no accent = because). Also: "¿qué?" (what/which in a question, with accent) vs. "que" (that/which as a conjunction, no accent).'
      },
      {
        type: 'warning',
        text: 'Do not use ¿Cuál? directly before a noun. This is incorrect: "¿Cuál libro lees?" The correct form with a noun is: "¿Qué libro lees?" Reserve ¿Cuál? for before "es/son" and on its own before a verb.'
      }
    ],
    exercises: [
      {
        id: 'a2-10-ex1',
        type: 'multiple-choice',
        question: 'Which question word correctly fills the blank? "___ es tu color favorito?"',
        options: ['¿Qué?', '¿Cuál?', '¿Cómo?', '¿Cuánto?'],
        correct: 1,
        explanation: 'Before "es" when asking for a specific piece of information (like favorite color, name, address), use ¿Cuál?: "¿Cuál es tu color favorito?" Using ¿Qué? here would imply asking for a definition of the concept of "favorite color."'
      },
      {
        id: 'a2-10-ex2',
        type: 'fill-blank',
        template: '¿___ estudiantes hay en la clase?',
        answer: 'Cuántos',
        explanation: '"¿Cuántos?" is used to ask "how many?" with masculine plural nouns. "Estudiantes" can be masculine (or mixed group), so "Cuántos" is correct. Note the accent mark on "Cuántos."'
      },
      {
        id: 'a2-10-ex3',
        type: 'translate',
        source: 'Where are you going this weekend?',
        answer: '¿Adónde vas este fin de semana?',
        direction: 'en-es',
        explanation: 'When asking about destination (movement toward a place), use "¿Adónde?" not "¿Dónde?" "Vas" is the tú present form of "ir." Do not forget the opening inverted question mark ¿.'
      },
      {
        id: 'a2-10-ex4',
        type: 'multiple-choice',
        question: 'Which is the correct way to ask "What book are you reading?" in Spanish?',
        options: [
          '¿Cuál libro lees?',
          '¿Qué libro lees?',
          '¿Cuáles libros lees?',
          '¿Cuál es el libro que lees?'
        ],
        correct: 1,
        explanation: 'Before a noun, always use "¿Qué?" not "¿Cuál?": "¿Qué libro lees?" is correct. "¿Cuál?" cannot directly precede a noun in standard Spanish. Option D is grammatically possible but overly complex for this simple question.'
      },
      {
        id: 'a2-10-ex5',
        type: 'translate',
        source: '¿Por qué no estudias más?',
        answer: 'Why do you not study more?',
        direction: 'es-en',
        explanation: '"¿Por qué?" (two words, with accent) means "why?" in a question. "No estudias" is the negative present tense of "estudiar" for tú. "Más" means "more." Do not confuse "¿por qué?" (why?) with "porque" (because).'
      }
    ]
  }
];
