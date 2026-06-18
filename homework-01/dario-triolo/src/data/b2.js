export const lessons = [
  {
    id: 'b2-01',
    level: 'B2',
    order: 1,
    title: 'The Past Perfect (Pluscuamperfecto)',
    description: 'Learn how to express actions completed before another past action using the past perfect tense. Master sequence markers to clarify the order of past events.',
    estimatedTime: '25 min',
    icon: '🏛️',
    content: [
      {
        type: 'text',
        text: 'The past perfect (pluscuamperfecto) is used to describe an action that was completed BEFORE another action in the past. It establishes a clear sequence: one event happened first, then another past event occurred.'
      },
      {
        type: 'rule',
        title: 'Formation',
        text: 'Conjugate the auxiliary verb "haber" in the imperfect tense (había, habías, había, habíamos, habíais, habían) + past participle of the main verb. The past participle is invariable: -ar verbs → -ado, -er/-ir verbs → -ido.'
      },
      {
        type: 'table',
        headers: ['Person', 'Haber (imperfect)', 'Example (hablar)'],
        rows: [
          ['yo', 'había', 'había hablado'],
          ['tú', 'habías', 'habías hablado'],
          ['él/ella/Ud.', 'había', 'había hablado'],
          ['nosotros', 'habíamos', 'habíamos hablado'],
          ['vosotros', 'habíais', 'habíais hablado'],
          ['ellos/Uds.', 'habían', 'habían hablado']
        ]
      },
      {
        type: 'examples',
        items: [
          { spanish: 'Cuando llegué, María ya había salido.', english: 'When I arrived, María had already left.', note: 'First: María left. Then: I arrived.' },
          { spanish: 'No había comido nada antes de la reunión.', english: 'I had not eaten anything before the meeting.', note: 'Not eating came before the meeting.' },
          { spanish: 'Todavía no habían empezado cuando entramos.', english: 'They had not started yet when we came in.', note: 'Todavía no signals something had NOT happened yet.' },
          { spanish: 'Hacía tres años que no había visto a mi hermano.', english: 'It had been three years since I had seen my brother.', note: 'Hacía + time + que + past perfect.' }
        ]
      },
      {
        type: 'rule',
        title: 'Key Sequence Markers',
        text: 'Use these words to signal that one past event preceded another: ya (already), todavía no / aún no (not yet), antes de que (before), cuando (when), hacía X tiempo que (it had been X time since), después de que (after).'
      },
      {
        type: 'tip',
        text: 'The past perfect always appears alongside another past tense (preterite or imperfect). It never stands alone to describe a past event — it only clarifies which event came first.'
      },
      {
        type: 'warning',
        text: 'Do not confuse the past perfect (había hablado) with the present perfect (he hablado) or the simple preterite (hablé). The past perfect requires a reference point in the past; without that reference, use the preterite or present perfect.'
      },
      {
        type: 'table',
        headers: ['Tense', 'Form', 'Meaning / Use'],
        rows: [
          ['Preterite', 'hablé', 'I spoke (simple past event)'],
          ['Present Perfect', 'he hablado', 'I have spoken (recently or ever)'],
          ['Past Perfect', 'había hablado', 'I had spoken (before another past event)']
        ]
      }
    ],
    exercises: [
      {
        id: 'b2-01-e1',
        type: 'multiple-choice',
        question: 'Choose the correct form: "Cuando llegué al cine, la película ya ___ (empezar)."',
        options: ['empezó', 'había empezado', 'ha empezado', 'empezaba'],
        correct: 1,
        explanation: 'The past perfect "había empezado" is correct because the movie starting happened BEFORE the speaker arrived. "Ya" reinforces this sequence.'
      },
      {
        id: 'b2-01-e2',
        type: 'fill-blank',
        template: 'Todavía no ___ (ellos/comer) cuando sonó el teléfono.',
        answer: 'habían comido',
        explanation: 'The past perfect "habían comido" (3rd person plural) is needed here. "Todavía no" signals something had not happened yet before another past event (the phone ringing).'
      },
      {
        id: 'b2-01-e3',
        type: 'translate',
        source: 'She had never visited Madrid before that trip.',
        answer: 'Nunca había visitado Madrid antes de ese viaje.',
        direction: 'en-es',
        explanation: 'Use "había visitado" (past perfect) because visiting Madrid is the action that had not occurred before the trip. "Nunca" precedes the verb.'
      },
      {
        id: 'b2-01-e4',
        type: 'multiple-choice',
        question: 'Which sentence uses the past perfect INCORRECTLY?',
        options: [
          'Antes de que llegaras, ya había preparado la cena.',
          'Había vivido en París cuando era joven.',
          'Me dijo que había perdido las llaves.',
          'Ayer había ido al supermercado.'
        ],
        correct: 3,
        explanation: '"Ayer había ido" is incorrect because the past perfect needs a reference point in the past to show sequence. With "ayer" alone (without another past event), use the preterite: "Ayer fui al supermercado."'
      },
      {
        id: 'b2-01-e5',
        type: 'translate',
        source: 'Llevaban dos horas esperando cuando por fin llegó el tren.',
        answer: 'They had been waiting for two hours when the train finally arrived.',
        direction: 'es-en',
        explanation: '"Llevaban dos horas esperando" uses llevar + gerund to express duration before a past event, equivalent to "had been waiting for two hours." The train arriving (llegó, preterite) is the later event.'
      }
    ]
  },
  {
    id: 'b2-02',
    level: 'B2',
    order: 2,
    title: 'Future Perfect & Conditional Perfect',
    description: 'Master the compound future and conditional tenses to talk about completed future actions and hypothetical past situations. Essential for advanced si clauses.',
    estimatedTime: '25 min',
    icon: '🚀',
    content: [
      {
        type: 'text',
        text: 'Spanish has two compound tenses that combine with perfect meaning: the future perfect (futuro perfecto) and the conditional perfect (condicional compuesto). Both are formed with a compound auxiliary (habré / habría) plus a past participle.'
      },
      {
        type: 'rule',
        title: 'Future Perfect: Formation & Use',
        text: 'Conjugate haber in the future tense + past participle: habré, habrás, habrá, habremos, habréis, habrán + participio. Use to express: (1) an action that will be completed before a future point in time, (2) speculation about something that probably happened in the past.'
      },
      {
        type: 'table',
        headers: ['Person', 'Haber (future)', 'Example (terminar)'],
        rows: [
          ['yo', 'habré', 'habré terminado'],
          ['tú', 'habrás', 'habrás terminado'],
          ['él/ella', 'habrá', 'habrá terminado'],
          ['nosotros', 'habremos', 'habremos terminado'],
          ['vosotros', 'habréis', 'habréis terminado'],
          ['ellos', 'habrán', 'habrán terminado']
        ]
      },
      {
        type: 'examples',
        items: [
          { spanish: 'Para el viernes, habré terminado el informe.', english: 'By Friday, I will have finished the report.', note: 'Action completed before a future deadline.' },
          { spanish: '¿Habrá llegado ya el correo?', english: 'Could the mail have arrived already?', note: 'Speculation about a past/present situation.' },
          { spanish: 'Se habrá equivocado de número.', english: 'He must have dialed the wrong number.', note: 'Deduction/speculation about what happened.' }
        ]
      },
      {
        type: 'rule',
        title: 'Conditional Perfect: Formation & Use',
        text: 'Conjugate haber in the conditional tense + past participle: habría, habrías, habría, habríamos, habríais, habrían + participio. Use to express: (1) what would have happened (unrealized past conditions), (2) the result clause of Type 3 si clauses.'
      },
      {
        type: 'table',
        headers: ['Person', 'Haber (conditional)', 'Example (viajar)'],
        rows: [
          ['yo', 'habría', 'habría viajado'],
          ['tú', 'habrías', 'habrías viajado'],
          ['él/ella', 'habría', 'habría viajado'],
          ['nosotros', 'habríamos', 'habríamos viajado'],
          ['vosotros', 'habríais', 'habríais viajado'],
          ['ellos', 'habrían', 'habrían viajado']
        ]
      },
      {
        type: 'examples',
        items: [
          { spanish: 'Si hubiera estudiado más, habría aprobado el examen.', english: 'If I had studied more, I would have passed the exam.', note: 'Type 3 si clause: impossible past condition + conditional perfect.' },
          { spanish: 'Habría ido a la fiesta, pero estaba cansado.', english: 'I would have gone to the party, but I was tired.', note: 'Unrealized action due to a real obstacle.' },
          { spanish: 'Ella dijo que habría llamado, pero no pudo.', english: 'She said she would have called, but she couldn\'t.', note: 'Reported speech in the past.' }
        ]
      },
      {
        type: 'tip',
        text: 'The conditional perfect often appears without a si clause when the condition is implied by context: "Yo en tu lugar, no habría dicho eso." (In your place, I would not have said that.)'
      },
      {
        type: 'warning',
        text: 'Never use the conditional or conditional perfect in the si (if) clause itself. The si clause takes indicative (Type 1), imperfect subjunctive (Type 2), or past perfect subjunctive (Type 3). The conditional/conditional perfect goes in the result clause.'
      }
    ],
    exercises: [
      {
        id: 'b2-02-e1',
        type: 'multiple-choice',
        question: 'Complete: "Para mañana a esta hora, nosotros ya ___ (llegar) a Buenos Aires."',
        options: ['llegaremos', 'habremos llegado', 'habríamos llegado', 'habíamos llegado'],
        correct: 1,
        explanation: '"Habremos llegado" (future perfect) is correct. The phrase "para mañana a esta hora" (by this time tomorrow) signals an action that will be completed before a future point, requiring the future perfect.'
      },
      {
        id: 'b2-02-e2',
        type: 'fill-blank',
        template: 'Si hubieran salido antes, ___ (ellos/evitar) el atasco.',
        answer: 'habrían evitado',
        explanation: 'This is a Type 3 si clause (impossible past condition). The si clause uses past perfect subjunctive (hubieran salido), and the result clause requires the conditional perfect: "habrían evitado."'
      },
      {
        id: 'b2-02-e3',
        type: 'translate',
        source: 'By the time you read this letter, I will have left the country.',
        answer: 'Para cuando leas esta carta, ya habré salido del país.',
        direction: 'en-es',
        explanation: '"Para cuando" + present subjunctive (leas) introduces a future time clause. The main clause uses the future perfect "habré salido" to show the action will be completed before that future moment.'
      },
      {
        id: 'b2-02-e4',
        type: 'translate',
        source: '¿Dónde se habrá metido el gato? No lo he visto en todo el día.',
        answer: 'Where could the cat have gone? I haven\'t seen it all day.',
        direction: 'es-en',
        explanation: '"Se habrá metido" uses the future perfect to express speculation or wonder about something that probably happened. It translates as "could have" or "must have" in English.'
      },
      {
        id: 'b2-02-e5',
        type: 'multiple-choice',
        question: 'Which sentence is grammatically CORRECT?',
        options: [
          'Si habría tenido tiempo, te habría ayudado.',
          'Si hubiera tenido tiempo, te habría ayudado.',
          'Si tuviera tiempo, te habría ayudado.',
          'Si tendría tiempo, te ayudaría.'
        ],
        correct: 1,
        explanation: '"Si hubiera tenido tiempo, te habría ayudado" is the correct Type 3 si clause. The si clause uses past perfect subjunctive (hubiera tenido) and the result clause uses conditional perfect (habría ayudado). Never use conditional in the si clause.'
      }
    ]
  },
  {
    id: 'b2-03',
    level: 'B2',
    order: 3,
    title: 'Advanced Present Subjunctive',
    description: 'Deepen your mastery of the present subjunctive with expressions of doubt, denial, emotion, and impersonal constructions. Understand when indicative vs subjunctive changes meaning.',
    estimatedTime: '30 min',
    icon: '🌟',
    content: [
      {
        type: 'text',
        text: 'At B2 level, you move beyond basic subjunctive triggers to nuanced uses with doubt/denial verbs, emotional reactions, and impersonal expressions. The key principle: the subjunctive signals that the speaker does not assert the reality or certainty of the embedded event.'
      },
      {
        type: 'rule',
        title: 'Doubt and Denial',
        text: 'Verbs and expressions that cast doubt on or deny a fact trigger the subjunctive: no creer que, dudar que, no estar seguro/a de que, negar que, no parecer que. Compare: Creo que VIENE (indicative, asserting it) vs No creo que VENGA (subjunctive, doubting it).'
      },
      {
        type: 'examples',
        items: [
          { spanish: 'Dudo que sea verdad lo que dice.', english: 'I doubt that what he says is true.', note: 'Dudar que always → subjunctive.' },
          { spanish: 'No estoy segura de que hayan llegado ya.', english: 'I\'m not sure they have arrived yet.', note: 'Uncertainty triggers subjunctive.' },
          { spanish: 'Ella niega que su empresa contamine el río.', english: 'She denies that her company pollutes the river.', note: 'Negar que → subjunctive (denying reality).' },
          { spanish: 'No me parece que eso sea justo.', english: 'I don\'t think that\'s fair.', note: 'No parecer que → subjunctive.' }
        ]
      },
      {
        type: 'rule',
        title: 'Emotional Reactions',
        text: 'When the main clause expresses emotion about something in the subordinate clause, and the subjects are different, use subjunctive: alegrarse de que (to be glad that), tener miedo de que (to be afraid that), sorprender que (to surprise that), lamentarse de que / sentir que (to be sorry/sad that), esperar que (to hope that).'
      },
      {
        type: 'examples',
        items: [
          { spanish: 'Me alegro de que hayas aprobado el examen.', english: 'I\'m glad that you passed the exam.', note: 'Different subjects: I (emotion) / you (passed).' },
          { spanish: 'Tengo miedo de que no lleguen a tiempo.', english: 'I\'m afraid they won\'t arrive on time.', note: 'Fear about another\'s action.' },
          { spanish: 'Me sorprende que no lo sepas.', english: 'It surprises me that you don\'t know it.', note: 'Sorprender que → subjunctive.' },
          { spanish: 'Lamentamos que no puedas venir.', english: 'We\'re sorry you can\'t come.', note: 'Lamentar que → subjunctive.' }
        ]
      },
      {
        type: 'rule',
        title: 'Impersonal Expressions of Possibility/Opinion',
        text: 'These impersonal expressions of possibility, probability, rarity, or evaluation trigger subjunctive: es posible que, es probable que, es raro que, es extraño que, es una lástima que, es importante que, es necesario que, es increíble que, es normal que, es lógico que.'
      },
      {
        type: 'examples',
        items: [
          { spanish: 'Es posible que llueva esta tarde.', english: 'It is possible that it will rain this afternoon.', note: 'Possibility → subjunctive.' },
          { spanish: 'Es extraño que no haya llamado todavía.', english: 'It\'s strange that he hasn\'t called yet.', note: 'Strangeness/unexpectedness → subjunctive.' },
          { spanish: 'Es una lástima que no puedas quedarte más tiempo.', english: 'It\'s a pity that you can\'t stay longer.', note: 'Evaluation of regret → subjunctive.' }
        ]
      },
      {
        type: 'table',
        headers: ['Expression', 'Verb Mood', 'Reason'],
        rows: [
          ['Creo que viene.', 'Indicative', 'Affirmative belief = assertion of reality'],
          ['No creo que venga.', 'Subjunctive', 'Negative belief = doubt/denial'],
          ['Es obvio que viene.', 'Indicative', 'Certainty/objective fact'],
          ['Es posible que venga.', 'Subjunctive', 'Uncertainty/possibility'],
          ['Sé que está aquí.', 'Indicative', 'Knowledge = factual assertion'],
          ['Dudo que esté aquí.', 'Subjunctive', 'Doubt = non-assertion']
        ]
      },
      {
        type: 'tip',
        text: 'The indicative/subjunctive contrast with creer que is one of the most tested distinctions. "Creo que es verdad" (I think it\'s true — I believe it) vs "No creo que sea verdad" (I don\'t think it\'s true — I doubt it). The negation flips the verb mood.'
      }
    ],
    exercises: [
      {
        id: 'b2-03-e1',
        type: 'multiple-choice',
        question: 'Choose the correct verb form: "Es extraño que Juan no ___ (llamar) todavía."',
        options: ['llama', 'llamará', 'llame', 'llamaba'],
        correct: 2,
        explanation: '"Llame" (present subjunctive) is correct. "Es extraño que" is an impersonal expression of strangeness/unexpectedness, which always triggers the subjunctive in the subordinate clause.'
      },
      {
        id: 'b2-03-e2',
        type: 'fill-blank',
        template: 'No creo que ellos ___ (tener) razón en este caso.',
        answer: 'tengan',
        explanation: '"Tengan" (present subjunctive of tener) is correct. With negative belief expressions like "no creer que," the subordinate clause requires the subjunctive because the speaker is expressing doubt rather than asserting a fact.'
      },
      {
        id: 'b2-03-e3',
        type: 'translate',
        source: 'I\'m sorry that you can\'t come to the party with us.',
        answer: 'Siento que no puedas venir a la fiesta con nosotros.',
        direction: 'en-es',
        explanation: '"Sentir que" (to be sorry that) expresses emotion about someone else\'s situation, requiring the subjunctive "puedas." The subjects are different (I feel sorry / you can\'t come), which is the classic subjunctive trigger.'
      },
      {
        id: 'b2-03-e4',
        type: 'multiple-choice',
        question: 'Which pair correctly contrasts indicative and subjunctive?',
        options: [
          '"Creo que viene" / "No creo que venga"',
          '"Creo que venga" / "No creo que viene"',
          '"Creo que viene" / "No creo que viene"',
          '"Creo que venga" / "No creo que venga"'
        ],
        correct: 0,
        explanation: 'Affirmative "creo que" asserts a reality and uses indicative ("viene"). Negative "no creo que" expresses doubt and uses subjunctive ("venga"). This is one of the most important indicative/subjunctive contrasts in Spanish.'
      },
      {
        id: 'b2-03-e5',
        type: 'translate',
        source: 'Me sorprende que no sepas la respuesta.',
        answer: 'It surprises me that you don\'t know the answer.',
        direction: 'es-en',
        explanation: '"Me sorprende que" (it surprises me that) is an emotional expression that triggers the subjunctive "sepas" (subjunctive of saber). The English equivalent uses indicative, but Spanish requires subjunctive after emotional reactions with different subjects.'
      }
    ]
  },
  {
    id: 'b2-04',
    level: 'B2',
    order: 4,
    title: 'The Imperfect Subjunctive',
    description: 'Learn to form and use the imperfect subjunctive, the past counterpart of the present subjunctive, essential for reported speech, si clauses, and polite requests.',
    estimatedTime: '30 min',
    icon: '🎆',
    content: [
      {
        type: 'text',
        text: 'The imperfect subjunctive (subjuntivo imperfecto) is used in the same contexts as the present subjunctive, but when the main verb is in a past tense or conditional. It has two forms: the -ra form (more common in speech) and the -se form (more literary/formal).'
      },
      {
        type: 'rule',
        title: 'Formation: The Key Trick',
        text: 'Take the third person plural of the preterite, remove -ron, and add the imperfect subjunctive endings. For -ra form: -ra, -ras, -ra, -ramos, -rais, -ran (with written accent on nosotros: -ramos). For -se form: -se, -ses, -se, -semos, -seis, -sen.'
      },
      {
        type: 'table',
        headers: ['Infinitive', 'Preterite 3rd pl.', '-ra form (yo/ellos)', '-se form (yo/ellos)'],
        rows: [
          ['hablar', 'hablaron', 'hablara / hablaran', 'hablase / hablasen'],
          ['comer', 'comieron', 'comiera / comieran', 'comiese / comiesen'],
          ['vivir', 'vivieron', 'viviera / vivieran', 'viviese / viviesen'],
          ['tener', 'tuvieron', 'tuviera / tuvieran', 'tuviese / tuviesen'],
          ['hacer', 'hicieron', 'hiciera / hicieran', 'hiciese / hiciesen'],
          ['ir/ser', 'fueron', 'fuera / fueran', 'fuese / fuesen']
        ]
      },
      {
        type: 'rule',
        title: 'Completely Irregular Forms',
        text: 'These verbs have irregular preterite stems that carry over to the imperfect subjunctive: ser/ir → fuera, estar → estuviera, tener → tuviera, hacer → hiciera, poder → pudiera, querer → quisiera, decir → dijera, venir → viniera, saber → supiera, poner → pusiera, traer → trajera.'
      },
      {
        type: 'examples',
        items: [
          { spanish: 'Quería que vinieras conmigo.', english: 'I wanted you to come with me.', note: 'Past main verb (quería) → imperfect subjunctive (vinieras).' },
          { spanish: 'El profesor pidió que hiciéramos los ejercicios.', english: 'The teacher asked us to do the exercises.', note: 'Pedir que in past → imperfect subjunctive.' },
          { spanish: 'Era necesario que todos supieran la verdad.', english: 'It was necessary that everyone know the truth.', note: 'Impersonal expression in past → imperfect subjunctive.' },
          { spanish: 'No había nadie que pudiera ayudarme.', english: 'There was nobody who could help me.', note: 'Past negative antecedent → imperfect subjunctive.' },
          { spanish: 'Quisiera un café, por favor.', english: 'I would like a coffee, please.', note: 'Quisiera = polite request (softer than quiero or quería).' }
        ]
      },
      {
        type: 'rule',
        title: 'Special Use: Polite Requests',
        text: 'The -ra form of certain verbs is used independently as a polite alternative: quisiera (I would like), pudiera (could I...?), debiera (I should). These are set phrases functioning like the conditional but with extra politeness. "Quisiera hablar con el director" is more formal than "Querría hablar..."'
      },
      {
        type: 'tip',
        text: 'The sequence of tenses rule: if the main verb is present/future/imperative → use present subjunctive in the subordinate clause. If the main verb is past (preterite, imperfect, conditional) → use imperfect subjunctive. This is called la concordancia de tiempos.'
      },
      {
        type: 'table',
        headers: ['Main Verb (tense)', 'Subordinate Verb (subjunctive)'],
        rows: [
          ['Quiero que vengas', 'Present subjunctive'],
          ['Quería que vinieras', 'Imperfect subjunctive'],
          ['He pedido que venga', 'Present subjunctive'],
          ['Pedí que viniera', 'Imperfect subjunctive'],
          ['Pediré que venga', 'Present subjunctive'],
          ['Querría que vinieras', 'Imperfect subjunctive']
        ]
      }
    ],
    exercises: [
      {
        id: 'b2-04-e1',
        type: 'fill-blank',
        template: 'Mis padres querían que yo ___ (estudiar) medicina.',
        answer: 'estudiara',
        explanation: '"Estudiara" (imperfect subjunctive of estudiar) is correct. The main verb "querían" is in the imperfect tense, so the subordinate clause requires the imperfect subjunctive. Formation: estudiaron → estudia- + -ra.'
      },
      {
        id: 'b2-04-e2',
        type: 'multiple-choice',
        question: 'What is the imperfect subjunctive of "ser" in the first person singular?',
        options: ['sería', 'fuera', 'sea', 'era'],
        correct: 1,
        explanation: '"Fuera" is the imperfect subjunctive of ser (and also of ir). It comes from the preterite 3rd person plural "fueron": fuero- + -a = fuera. "Sería" is conditional, "sea" is present subjunctive, and "era" is imperfect indicative.'
      },
      {
        id: 'b2-04-e3',
        type: 'translate',
        source: 'The doctor recommended that she rest for a week.',
        answer: 'El médico recomendó que descansara una semana.',
        direction: 'en-es',
        explanation: '"Recomendó" (preterite of recomendar) triggers the imperfect subjunctive in the subordinate clause. "Descansara" (imperfect subjunctive of descansar) is correct. Formation: descansaron → descansa- + -ra.'
      },
      {
        id: 'b2-04-e4',
        type: 'translate',
        source: 'Era imposible que hubieran terminado tan rápido.',
        answer: 'It was impossible that they had finished so quickly.',
        direction: 'es-en',
        explanation: '"Era imposible que" (it was impossible that) triggers the subjunctive. "Hubieran terminado" is the past perfect subjunctive (imperfect subjunctive of haber + participle), expressing an action that would have been completed before the past reference point.'
      },
      {
        id: 'b2-04-e5',
        type: 'multiple-choice',
        question: 'Which is the most polite way to order a coffee?',
        options: ['Quiero un café.', 'Dame un café.', 'Quisiera un café.', 'Quería un café.'],
        correct: 2,
        explanation: '"Quisiera" (imperfect subjunctive of querer used as a polite request) is the most polite option. It softens the request compared to "quiero" (I want). "Quería" (imperfect indicative) is also polite but "quisiera" is the classic formal choice.'
      }
    ]
  },
  {
    id: 'b2-05',
    level: 'B2',
    order: 5,
    title: 'Si Clauses: All Three Types',
    description: 'Master all three types of conditional sentences in Spanish, from real conditions to hypothetical and impossible past scenarios, plus mixed conditionals.',
    estimatedTime: '30 min',
    icon: '⚖️',
    content: [
      {
        type: 'text',
        text: 'Conditional sentences with "si" (if) in Spanish fall into three types based on the likelihood or possibility of the condition. Each type uses a specific combination of verb tenses. Getting these right is one of the hallmarks of advanced Spanish.'
      },
      {
        type: 'rule',
        title: 'Type 1: Real/Open Conditions',
        text: 'For situations that are genuinely possible or likely. Pattern: si + present indicative → future (or present/imperative). The condition is real and achievable. Can also use si + present → present for general truths.'
      },
      {
        type: 'examples',
        items: [
          { spanish: 'Si estudias, aprobarás el examen.', english: 'If you study, you will pass the exam.', note: 'Real possibility: studying leads to passing.' },
          { spanish: 'Si tienes hambre, hay comida en la nevera.', english: 'If you are hungry, there is food in the fridge.', note: 'Si + present → present (general truth/offer).' },
          { spanish: 'Si llegas antes de las ocho, llámame.', english: 'If you arrive before eight, call me.', note: 'Si + present → imperative.' }
        ]
      },
      {
        type: 'rule',
        title: 'Type 2: Hypothetical Present/Future Conditions',
        text: 'For situations that are unlikely, contrary to current reality, or purely hypothetical. Pattern: si + imperfect subjunctive → conditional. The speaker implies the condition is not currently true or is imagined.'
      },
      {
        type: 'examples',
        items: [
          { spanish: 'Si tuviera dinero, viajaría por el mundo.', english: 'If I had money, I would travel the world.', note: 'Implied: I don\'t have money right now.' },
          { spanish: 'Si fuera presidenta, cambiaría muchas cosas.', english: 'If I were president, I would change many things.', note: 'Purely hypothetical (she is not president).' },
          { spanish: 'Si pudiera, me quedaría aquí para siempre.', english: 'If I could, I would stay here forever.', note: 'Implies: I can\'t (currently).' }
        ]
      },
      {
        type: 'rule',
        title: 'Type 3: Impossible Past Conditions',
        text: 'For conditions that refer to the past and cannot be changed — the situation did not happen. Pattern: si + past perfect subjunctive → conditional perfect. Expresses regret or speculation about an alternate past.'
      },
      {
        type: 'examples',
        items: [
          { spanish: 'Si hubiera estudiado, habría aprobado.', english: 'If I had studied, I would have passed.', note: 'Implies: I didn\'t study, so I didn\'t pass.' },
          { spanish: 'Si hubieras llegado antes, habrías conocido a María.', english: 'If you had arrived earlier, you would have met María.', note: 'Impossible to change: you didn\'t arrive early.' },
          { spanish: 'Si no hubiera llovido, habríamos salido.', english: 'If it hadn\'t rained, we would have gone out.', note: 'It rained, so we didn\'t go out.' }
        ]
      },
      {
        type: 'table',
        headers: ['Type', 'Si Clause', 'Result Clause', 'Meaning'],
        rows: [
          ['1 – Real', 'si + present indicative', 'future / present / imperative', 'Possible/likely'],
          ['2 – Hypothetical', 'si + imperfect subjunctive', 'conditional', 'Unlikely/contrary to present fact'],
          ['3 – Impossible', 'si + past perfect subjunctive', 'conditional perfect', 'Contrary to past fact']
        ]
      },
      {
        type: 'rule',
        title: 'Mixed Conditionals',
        text: 'Mix Type 3 (past condition) with Type 2 (present result): si + past perfect subjunctive → conditional. Expresses: if [something had/hadn\'t happened in the past], [things would be different now].'
      },
      {
        type: 'examples',
        items: [
          { spanish: 'Si hubiera estudiado más, ahora tendría un trabajo mejor.', english: 'If I had studied more, I would have a better job now.', note: 'Past condition → present result (mixed).' },
          { spanish: 'Aunque estudies mucho, puede que no apruebes.', english: 'Even if you study a lot, you might not pass.', note: 'Aunque + subjunctive = hypothetical concession.' }
        ]
      },
      {
        type: 'warning',
        text: 'NEVER use the conditional tense (hablaría, tendría, etc.) or the conditional perfect in the si clause. This is a very common mistake. Only use: indicative (Type 1), imperfect subjunctive (Type 2), or past perfect subjunctive (Type 3) after si.'
      }
    ],
    exercises: [
      {
        id: 'b2-05-e1',
        type: 'multiple-choice',
        question: 'Identify the type of conditional: "Si hubiera sabido la verdad, no habría mentido."',
        options: ['Type 1 – Real condition', 'Type 2 – Hypothetical present', 'Type 3 – Impossible past', 'Mixed conditional'],
        correct: 2,
        explanation: 'This is a Type 3 conditional. The si clause uses past perfect subjunctive (hubiera sabido) and the result clause uses conditional perfect (habría mentido). It refers to a past situation that cannot be changed: the person didn\'t know the truth and did lie.'
      },
      {
        id: 'b2-05-e2',
        type: 'fill-blank',
        template: 'Si ___ (tú/tener) más tiempo libre, ¿qué harías?',
        answer: 'tuvieras',
        explanation: '"Tuvieras" (imperfect subjunctive of tener) is correct for a Type 2 hypothetical conditional. The result clause uses the conditional "harías," confirming this is a Type 2 structure for a hypothetical/unlikely present situation.'
      },
      {
        id: 'b2-05-e3',
        type: 'translate',
        source: 'If it rains tomorrow, we will stay at home.',
        answer: 'Si llueve mañana, nos quedaremos en casa.',
        direction: 'en-es',
        explanation: 'This is a Type 1 (real/open) conditional: si + present indicative (llueve) → future (nos quedaremos). Rain tomorrow is a genuine possibility, not a hypothetical.'
      },
      {
        id: 'b2-05-e4',
        type: 'translate',
        source: 'Si no hubieras dicho eso, ahora seríamos amigos.',
        answer: 'If you hadn\'t said that, we would be friends now.',
        direction: 'es-en',
        explanation: 'This is a mixed conditional: past perfect subjunctive in the si clause (no hubieras dicho = past impossible condition) + conditional in the result clause (seríamos = present hypothetical result). The past event affects the current situation.'
      },
      {
        id: 'b2-05-e5',
        type: 'multiple-choice',
        question: 'Which sentence contains an ERROR in si clause construction?',
        options: [
          'Si comes bien, te sentirás mejor.',
          'Si comiera mejor, me sentiría mejor.',
          'Si habría comido mejor, me habría sentido mejor.',
          'Si hubiera comido mejor, me habría sentido mejor.'
        ],
        correct: 2,
        explanation: '"Si habría comido" is WRONG. The conditional (habría comido) cannot be used in the si clause. For an impossible past condition, use past perfect subjunctive: "Si hubiera comido mejor, me habría sentido mejor" (Type 3).'
      }
    ]
  },
  {
    id: 'b2-06',
    level: 'B2',
    order: 6,
    title: 'The Passive Voice',
    description: 'Learn to use the true passive with ser and the reflexive passive with se, and understand when each is preferred in written and spoken Spanish.',
    estimatedTime: '25 min',
    icon: '📰',
    content: [
      {
        type: 'text',
        text: 'Spanish has two main passive constructions: the true passive (pasiva con ser) and the reflexive passive (pasiva refleja with se). While both can express passive meaning, they differ in formality, frequency, and whether an agent is mentioned.'
      },
      {
        type: 'rule',
        title: 'True Passive: Ser + Past Participle',
        text: 'Form: subject + ser (conjugated in any tense) + past participle (agrees in gender and number with the subject) + por + agent (optional). This construction is more common in written/formal Spanish, especially when the agent is mentioned.'
      },
      {
        type: 'examples',
        items: [
          { spanish: 'El libro fue escrito por Cervantes.', english: 'The book was written by Cervantes.', note: 'Agent (Cervantes) is mentioned with "por."' },
          { spanish: 'Las casas serán construidas por una empresa italiana.', english: 'The houses will be built by an Italian company.', note: 'Future passive with agent.' },
          { spanish: 'La ley ha sido aprobada por el parlamento.', english: 'The law has been approved by parliament.', note: 'Present perfect passive.' },
          { spanish: 'Los documentos habían sido firmados antes de la reunión.', english: 'The documents had been signed before the meeting.', note: 'Past perfect passive.' }
        ]
      },
      {
        type: 'rule',
        title: 'Reflexive Passive: Se + Verb',
        text: 'Form: se + 3rd person singular or plural verb (agrees with the grammatical subject). Used when no agent is mentioned. More common in spoken Spanish and natural-sounding texts. The "subject" typically follows the verb.'
      },
      {
        type: 'examples',
        items: [
          { spanish: 'Se habla español aquí.', english: 'Spanish is spoken here.', note: 'Se + singular verb (habla) because español is singular.' },
          { spanish: 'Se vendieron todas las entradas.', english: 'All the tickets were sold.', note: 'Se + plural verb (vendieron) because entradas is plural.' },
          { spanish: 'Se busca cocinero con experiencia.', english: 'Experienced cook wanted/sought.', note: 'Common in job ads.' },
          { spanish: 'Se necesitan tres voluntarios.', english: 'Three volunteers are needed.', note: 'Plural subject → plural verb.' }
        ]
      },
      {
        type: 'rule',
        title: 'Impersonal Se',
        text: 'The impersonal se uses a singular verb and refers to people in general (one, they, you — general). There is no specific subject. Common in proverbs, general statements, and instructions: Se dice que... (They say that...), Se puede ver... (One can see...), Se come muy bien aquí. (The food is great here. / You eat very well here.)'
      },
      {
        type: 'examples',
        items: [
          { spanish: 'Se dice que va a nevar esta semana.', english: 'They say it\'s going to snow this week.', note: 'Impersonal: no specific subject.' },
          { spanish: 'Aquí se come muy bien.', english: 'You eat very well here. / The food here is great.', note: 'Impersonal se describing a general situation.' },
          { spanish: 'En España se cena tarde.', english: 'In Spain, dinner is eaten late. / People eat dinner late in Spain.', note: 'Cultural generalization with impersonal se.' }
        ]
      },
      {
        type: 'table',
        headers: ['Construction', 'Agent mentioned?', 'Register', 'Example'],
        rows: [
          ['Ser passive', 'Yes (por + agent)', 'Formal/written', 'El libro fue escrito por García Márquez.'],
          ['Se passive', 'No', 'Spoken/natural', 'Se vendieron los libros.'],
          ['Impersonal se', 'No (general)', 'All registers', 'Se dice que es difícil.']
        ]
      },
      {
        type: 'warning',
        text: 'Do not confuse the reflexive se (lavarse = to wash oneself), the passive se (se vendió la casa = the house was sold), and the impersonal se (se come bien aquí = one eats well here). Context and verb agreement with the noun are key to distinguishing passive se from impersonal se.'
      }
    ],
    exercises: [
      {
        id: 'b2-06-e1',
        type: 'multiple-choice',
        question: 'Transform into the reflexive passive: "Vendieron muchos coches el año pasado."',
        options: [
          'Se vendió muchos coches el año pasado.',
          'Se vendieron muchos coches el año pasado.',
          'Muchos coches fueron vendidos el año pasado.',
          'Se venden muchos coches el año pasado.'
        ],
        correct: 1,
        explanation: '"Se vendieron muchos coches" is correct. With the reflexive passive, the verb agrees with the grammatical subject "muchos coches" (plural), so "vendieron" (plural). Option A is wrong (singular verb with plural noun). Option C is the ser passive. Option D is present tense.'
      },
      {
        id: 'b2-06-e2',
        type: 'fill-blank',
        template: 'La catedral ___ (construir) en el siglo XII por los romanos.',
        answer: 'fue construida',
        explanation: '"Fue construida" (ser passive, preterite) is correct. The subject "la catedral" is feminine singular, so the participle "construida" agrees in gender and number. The agent "los romanos" is introduced by "por," typical of the ser passive.'
      },
      {
        id: 'b2-06-e3',
        type: 'translate',
        source: 'In this restaurant, they say the paella is delicious.',
        answer: 'En este restaurante se dice que la paella está deliciosa.',
        direction: 'en-es',
        explanation: '"Se dice que" is the impersonal se construction meaning "they say that / it is said that." The verb is singular regardless of what follows because it is truly impersonal (no grammatical subject).'
      },
      {
        id: 'b2-06-e4',
        type: 'translate',
        source: 'El Premio Nobel de Literatura fue concedido a una escritora colombiana.',
        answer: 'The Nobel Prize in Literature was awarded to a Colombian writer.',
        direction: 'es-en',
        explanation: '"Fue concedido" is the ser passive (preterite of ser + past participle "concedido"). There is no agent mentioned here (no "por + someone"). The participle "concedido" agrees with the masculine singular subject "el Premio Nobel."'
      },
      {
        id: 'b2-06-e5',
        type: 'multiple-choice',
        question: 'Which is the MOST natural-sounding way to say "Three languages are spoken in that country" in everyday Spanish?',
        options: [
          'Tres idiomas son hablados en ese país.',
          'Se habla tres idiomas en ese país.',
          'Se hablan tres idiomas en ese país.',
          'Tres idiomas se habla en ese país.'
        ],
        correct: 2,
        explanation: '"Se hablan tres idiomas" is most natural. With the reflexive passive, the verb agrees with "tres idiomas" (plural) → "hablan." Option A (ser passive) is grammatically correct but overly formal. Option B has wrong agreement (singular verb with plural noun). Option D has the subject before se, which is unnatural here.'
      }
    ]
  },
  {
    id: 'b2-07',
    level: 'B2',
    order: 7,
    title: 'Reported Speech',
    description: 'Learn to report what others said with accurate tense backshift, pronoun changes, and time expression adjustments essential for advanced communication.',
    estimatedTime: '30 min',
    icon: '💬',
    content: [
      {
        type: 'text',
        text: 'Reported speech (estilo indirecto) involves retelling what someone said. In Spanish, as in English, this requires changes to verb tenses, pronouns, and time/place expressions. It is essential for narrating, gossiping, reporting news, and academic writing.'
      },
      {
        type: 'rule',
        title: 'Reporting Verbs',
        text: 'Use these verbs to introduce reported speech: decir que (to say that), afirmar que (to affirm/state that), comentar que (to comment that), explicar que (to explain that), añadir que (to add that), reconocer que (to admit that), confesar que (to confess that), insistir en que (to insist that).'
      },
      {
        type: 'rule',
        title: 'Tense Backshift',
        text: 'When the reporting verb is in the past (dijo, explicó, etc.), the reported verb shifts back in time. Present → Imperfect, Preterite → Past Perfect, Future → Conditional, Present Perfect → Past Perfect, Imperfect → Imperfect (usually no change).'
      },
      {
        type: 'table',
        headers: ['Direct Speech (tense)', 'Reported Speech (tense)', 'Example'],
        rows: [
          ['Present: "Estoy cansado"', 'Imperfect: estaba cansado', 'Dijo que estaba cansado.'],
          ['Preterite: "Fui al médico"', 'Past Perfect: había ido al médico', 'Dijo que había ido al médico.'],
          ['Future: "Vendré mañana"', 'Conditional: vendría al día siguiente', 'Dijo que vendría al día siguiente.'],
          ['Present Perf: "He terminado"', 'Past Perfect: había terminado', 'Dijo que había terminado.'],
          ['Imperfect: "Vivía en Madrid"', 'Imperfect: vivía en Madrid', 'Dijo que vivía en Madrid.'],
          ['Subjunctive: "Quiero que vengas"', 'Imperf. Subj: quisiera que fuera', 'Dijo que quería que fuera.']
        ]
      },
      {
        type: 'rule',
        title: 'Time and Place Expression Changes',
        text: 'When reporting past speech, time and place expressions also change: hoy → ese día, mañana → al día siguiente, ayer → el día anterior, esta semana → esa semana, la semana que viene → la semana siguiente, aquí → allí/allá, ahora → entonces, hace un momento → un momento antes, este/a → ese/a.'
      },
      {
        type: 'examples',
        items: [
          { spanish: 'Dijo: "Vendré mañana." → Dijo que vendría al día siguiente.', english: 'He said: "I will come tomorrow." → He said he would come the next day.', note: 'Future → conditional; mañana → al día siguiente.' },
          { spanish: 'Afirmó: "He terminado el proyecto hoy." → Afirmó que había terminado el proyecto ese día.', english: 'She stated: "I have finished the project today." → She stated she had finished the project that day.', note: 'Present perfect → past perfect; hoy → ese día.' },
          { spanish: '"Estoy aquí ahora." → Dijo que estaba allí entonces.', english: '"I am here now." → She said she was there then.', note: 'aquí → allí; ahora → entonces.' }
        ]
      },
      {
        type: 'rule',
        title: 'Reporting Questions',
        text: 'Yes/no questions: use preguntar si + indicative/subjunctive. Wh-questions: use preguntar + question word (qué, quién, dónde, cuándo, cómo, por qué) + normal word order (no inversion). Note: No question marks in reported questions.'
      },
      {
        type: 'examples',
        items: [
          { spanish: '"¿Vienes?" → Preguntó si venía.', english: '"Are you coming?" → He asked if I was coming.', note: 'Yes/no question → preguntar si.' },
          { spanish: '"¿Dónde vives?" → Preguntó dónde vivía.', english: '"Where do you live?" → She asked where I lived.', note: 'Wh-question → preguntar + question word, no inversion.' },
          { spanish: '"¡Ven aquí!" → Le dijo que fuera allí / Le pidió que fuera allí.', english: '"Come here!" → He told/asked her to go there.', note: 'Commands → decir/pedir + que + imperfect subjunctive.' }
        ]
      },
      {
        type: 'tip',
        text: 'Reporting commands uses pedir/decir + que + imperfect subjunctive (for past reporting): "Me dijo que cerrase la puerta" (He told me to close the door). For present/future reporting of commands: "Me dice que cierre la puerta" (He is telling me to close the door) — present subjunctive.'
      }
    ],
    exercises: [
      {
        id: 'b2-07-e1',
        type: 'multiple-choice',
        question: 'Ana said: "Estoy muy contenta hoy." What is the correct reported version?',
        options: [
          'Ana dijo que está muy contenta hoy.',
          'Ana dijo que estaba muy contenta ese día.',
          'Ana dijo que estuvo muy contenta hoy.',
          'Ana dijo que estuviera muy contenta ese día.'
        ],
        correct: 1,
        explanation: '"Estaba muy contenta ese día" is correct. The present tense "estoy" shifts to imperfect "estaba" in reported speech with a past reporting verb. "Hoy" changes to "ese día" because the time reference shifts from the moment of speaking to the moment of reporting.'
      },
      {
        id: 'b2-07-e2',
        type: 'fill-blank',
        template: 'El médico me preguntó ___ me encontraba bien.',
        answer: 'si',
        explanation: '"Si" introduces a reported yes/no question. The doctor asked a yes/no question ("¿Se encuentra bien?"), which in reported speech becomes "preguntó si me encontraba bien." Use "si" (not "que") for reported yes/no questions.'
      },
      {
        id: 'b2-07-e3',
        type: 'translate',
        source: 'She told me to wait outside.',
        answer: 'Me dijo que esperara fuera.',
        direction: 'en-es',
        explanation: 'Reported commands use decir/pedir + que + imperfect subjunctive. "Wait" becomes "esperara" (imperfect subjunctive of esperar). "Outside" = "fuera." The reporting verb "dijo" is in the preterite, triggering imperfect subjunctive in the subordinate clause.'
      },
      {
        id: 'b2-07-e4',
        type: 'translate',
        source: 'Carlos explicó que había terminado el informe el día anterior.',
        answer: 'Carlos explained that he had finished the report the day before.',
        direction: 'es-en',
        explanation: '"Había terminado" (past perfect) is the reported speech equivalent of "he terminado" (present perfect) or "terminé" (preterite). "El día anterior" is the reported speech form of "ayer." Both tense backshift and time expression change are present here.'
      },
      {
        id: 'b2-07-e5',
        type: 'multiple-choice',
        question: 'Pedro said: "¿Cuándo llegará el tren?" What is the correct reported version?',
        options: [
          'Pedro preguntó cuándo llegará el tren.',
          'Pedro preguntó si llegará el tren.',
          'Pedro preguntó cuándo llegaría el tren.',
          'Pedro preguntó que cuándo llegaría el tren.'
        ],
        correct: 2,
        explanation: '"Pedro preguntó cuándo llegaría el tren." The wh-question word "cuándo" is retained without inversion. The future "llegará" shifts to conditional "llegaría" due to tense backshift. Option A keeps the future (no backshift). Option B uses "si" for a wh-question. Option D incorrectly adds "que" after the reporting verb with a question word.'
      }
    ]
  },
  {
    id: 'b2-08',
    level: 'B2',
    order: 8,
    title: 'Advanced Ser vs Estar',
    description: 'Master the nuanced differences between ser and estar, including adjectives that change meaning entirely depending on which verb is used.',
    estimatedTime: '25 min',
    icon: '🎭',
    content: [
      {
        type: 'text',
        text: 'While beginner learners learn that ser expresses permanent qualities and estar expresses temporary states, the reality is more nuanced. At B2 level, you must master adjectives that change meaning with ser vs estar, and special uses like ser for events and estar for result states.'
      },
      {
        type: 'rule',
        title: 'Adjectives That Change Meaning',
        text: 'Some adjectives have two distinct meanings depending on whether they are used with ser (inherent characteristic) or estar (perceived state or change from norm). Learning these pairs is essential for precise communication.'
      },
      {
        type: 'table',
        headers: ['Adjective', 'With SER', 'With ESTAR'],
        rows: [
          ['aburrido', 'Es aburrido. (He\'s a boring person.)', 'Está aburrido. (He\'s bored right now.)'],
          ['bueno', 'Es bueno. (He\'s a good person.)', 'Está bueno. (It\'s tasty / He looks attractive.)'],
          ['malo', 'Es malo. (He\'s a bad person.)', 'Está malo. (He\'s ill/sick.)'],
          ['listo', 'Es lista. (She\'s clever/smart.)', 'Está lista. (She\'s ready.)'],
          ['seguro', 'Es seguro. (It\'s safe/reliable.)', 'Está seguro. (He\'s sure/certain.)'],
          ['vivo', 'Es muy vivo. (He\'s very clever/sharp.)', 'Está vivo. (He\'s alive.)'],
          ['rico', 'Es rico. (He\'s wealthy.)', 'Está rico. (It\'s delicious.)'],
          ['libre', 'Es libre. (It/she\'s free, unconstrained.)', 'Está libre. (It\'s free/available.)'],
          ['orgulloso', 'Es orgulloso. (He\'s arrogant.)', 'Está orgulloso. (He\'s proud of something.)'],
          ['muerto', '(not used with ser)', 'Está muerto. (He\'s dead.)']
        ]
      },
      {
        type: 'examples',
        items: [
          { spanish: 'El profesor es aburrido, pero los estudiantes no están aburridos.', english: 'The teacher is boring, but the students are not bored.', note: 'Same adjective, two meanings via ser vs estar.' },
          { spanish: '¿Está lista la cena? Sí, y está riquísima.', english: 'Is dinner ready? Yes, and it\'s delicious.', note: 'Two uses of estar: ready + delicious.' },
          { spanish: 'El medicamento es seguro, y el médico está seguro de eso.', english: 'The medicine is safe, and the doctor is sure of that.', note: 'Safe (ser) vs certain (estar).' }
        ]
      },
      {
        type: 'rule',
        title: 'Ser for Events (Location & Time)',
        text: 'Use ser (not estar) to say where and when events take place. This is an exception to the general rule that estar is for location. Events have a scheduled identity, hence ser. Example: La fiesta es en mi casa. El concierto fue ayer en el estadio.'
      },
      {
        type: 'examples',
        items: [
          { spanish: 'La reunión es en la sala de conferencias a las tres.', english: 'The meeting is in the conference room at three.', note: 'Ser for event location and time.' },
          { spanish: 'El concierto fue en el parque.', english: 'The concert was in the park.', note: 'Past event location → ser (fue).' },
          { spanish: 'La puerta está abierta.', english: 'The door is open (it has been opened).', note: 'Estar for result state: someone opened it.' }
        ]
      },
      {
        type: 'rule',
        title: 'Estar for Result States',
        text: 'Use estar + past participle to describe a state that results from a completed action. The participle acts as an adjective and agrees with the subject. Compare: La mesa fue puesta por mi madre (passive, ser — the action of setting it) vs La mesa está puesta (result state, estar — it is currently set).'
      },
      {
        type: 'tip',
        text: 'A useful test: if you can substitute "parece" (seems/looks) for the verb, use estar. "Está cansado" = "parece cansado" (he seems/looks tired). If you can substitute "es conocido como" or describe an inherent trait, use ser.'
      },
      {
        type: 'warning',
        text: 'Remember: "estar muerto" (estar, always — death is a state). You CANNOT say "ser muerto" as a simple statement of being dead. However, "fue asesinado" (he was murdered) uses ser for the passive voice construction.'
      }
    ],
    exercises: [
      {
        id: 'b2-08-e1',
        type: 'multiple-choice',
        question: 'Choose the correct verb: "Después de escuchar la misma canción cien veces, el niño ___ aburrido."',
        options: ['es', 'está', 'fue', 'ha sido'],
        correct: 1,
        explanation: '"Está aburrido" is correct because the child IS BORED (a temporary emotional state resulting from repetition). "Es aburrido" would mean "he\'s a boring person (by nature)." The context (after hearing the same song 100 times) confirms this is a resulting state → estar.'
      },
      {
        id: 'b2-08-e2',
        type: 'fill-blank',
        template: 'La fiesta de cumpleaños ___ en el jardín el próximo sábado.',
        answer: 'es',
        explanation: '"Es" (ser) is correct because we are talking about an event (la fiesta) and where/when it takes place. Events use ser for their location and time, even though for most things, location uses estar. "La fiesta es en el jardín" = the party takes place in the garden.'
      },
      {
        id: 'b2-08-e3',
        type: 'translate',
        source: 'He\'s rich, but this cake is also really rich (delicious).',
        answer: 'Es rico, pero este pastel también está muy rico.',
        direction: 'en-es',
        explanation: '"Es rico" (ser + rico = wealthy) describes an inherent characteristic of the person. "Está muy rico" (estar + rico = delicious) describes the perceived taste of the cake. This classic pair demonstrates how the same adjective has different meanings with ser vs estar.'
      },
      {
        id: 'b2-08-e4',
        type: 'translate',
        source: 'El banco está cerrado los domingos.',
        answer: 'The bank is closed on Sundays.',
        direction: 'es-en',
        explanation: '"Está cerrado" uses estar because "cerrado" (closed) describes a result state — the bank has been closed (by someone). It is currently in the state of being closed. On Sundays, this is a regular/predictable state, but we still use estar because it is a result state, not an inherent quality.'
      },
      {
        id: 'b2-08-e5',
        type: 'multiple-choice',
        question: 'Which sentence uses ser/estar INCORRECTLY?',
        options: [
          'Está listo para salir.',
          'Es listo para los negocios.',
          'El examen es en el aula 3.',
          'Los turistas están en el museo ahora.'
        ],
        correct: 1,
        explanation: 'All sentences are actually correct! Wait — "es listo para los negocios" means "he\'s clever/sharp in business" (ser + listo = clever, an inherent quality). This IS correct. All four sentences are correct: estar listo = ready, ser listo = clever, ser + event location, estar + physical location. This question tests whether you can identify all as correct.'
      }
    ]
  },
  {
    id: 'b2-09',
    level: 'B2',
    order: 9,
    title: 'Complex Sentence Connectors',
    description: 'Expand your repertoire of discourse connectors for contrast, addition, cause, result, and purpose. Learn how aunque changes meaning with indicative vs subjunctive.',
    estimatedTime: '30 min',
    icon: '🌐',
    content: [
      {
        type: 'text',
        text: 'Sentence connectors (conectores discursivos) are the glue of advanced writing and speech. They signal logical relationships between ideas: contrast, addition, cause, result, and purpose. Mastering these is essential for B2 writing tasks and formal communication.'
      },
      {
        type: 'rule',
        title: 'Contrast Connectors',
        text: 'Use these to introduce contrasting or concessive ideas: sin embargo (however), no obstante (nevertheless — more formal), aunque (although/even if), a pesar de (que) (despite/in spite of), si bien (although/even though — formal), pero (but — basic), aun así (even so).'
      },
      {
        type: 'examples',
        items: [
          { spanish: 'Estudió mucho; sin embargo, no aprobó el examen.', english: 'She studied a lot; however, she didn\'t pass the exam.', note: 'Sin embargo connects two independent clauses (with semicolon or period).' },
          { spanish: 'A pesar de sus esfuerzos, no consiguió el trabajo.', english: 'Despite her efforts, she didn\'t get the job.', note: 'A pesar de + noun (no clause).' },
          { spanish: 'A pesar de que llovía, salimos a caminar.', english: 'Despite the fact that it was raining, we went for a walk.', note: 'A pesar de que + clause.' },
          { spanish: 'Si bien el proyecto tiene problemas, vale la pena intentarlo.', english: 'Although the project has problems, it is worth trying.', note: 'Si bien = formal contrast, usually at the start.' }
        ]
      },
      {
        type: 'rule',
        title: 'Aunque: Indicative vs Subjunctive',
        text: 'Aunque + indicative: the speaker acknowledges the fact as known or true (concessive). Aunque + subjunctive: the speaker treats the situation as hypothetical or irrelevant to the outcome (conditional concession). This is one of the most important distinctions for B2+ learners.'
      },
      {
        type: 'examples',
        items: [
          { spanish: 'Aunque llueve, salgo. (indicative)', english: 'Although it is raining (I know it is), I\'m going out.', note: 'Known fact: it IS raining.' },
          { spanish: 'Aunque llueva, saldré. (subjunctive)', english: 'Even if it rains (whether or not), I will go out.', note: 'Hypothetical: it may or may not rain.' },
          { spanish: 'Aunque es tarde, seguimos trabajando.', english: 'Although it is late (we know this), we keep working.', note: 'Indicative = confirmed reality.' },
          { spanish: 'Aunque sea tarde, seguiré trabajando.', english: 'Even if it is late (regardless), I will keep working.', note: 'Subjunctive = treating it as a hypothetical.' }
        ]
      },
      {
        type: 'rule',
        title: 'Cause Connectors',
        text: 'These introduce the reason or cause: porque (because — basic), dado que (given that), puesto que (since/given that), ya que (since/because), debido a (que) (due to/because of), como (since/because — only at the START of a sentence).'
      },
      {
        type: 'examples',
        items: [
          { spanish: 'Como no tenía dinero, no pudo ir de vacaciones.', english: 'Since he had no money, he couldn\'t go on holiday.', note: 'Como + cause at the START of the sentence.' },
          { spanish: 'Suspendió el proyecto dado que no había financiación.', english: 'She suspended the project given that there was no funding.', note: 'Dado que = formal, causal.' },
          { spanish: 'Llegamos tarde debido al tráfico.', english: 'We arrived late due to the traffic.', note: 'Debido a + noun (not clause).' }
        ]
      },
      {
        type: 'rule',
        title: 'Result and Purpose Connectors',
        text: 'Result: por lo tanto (therefore), por eso (that\'s why/therefore), así que (so/therefore), de modo que / de manera que (so that/in such a way that). Purpose: para que + subjunctive (so that), a fin de que + subjunctive (in order that — formal), con el objetivo de + infinitive (with the goal of).'
      },
      {
        type: 'table',
        headers: ['Function', 'Connectors', 'Notes'],
        rows: [
          ['Contrast', 'sin embargo, no obstante, si bien', 'Formal; join clauses'],
          ['Contrast/Concession', 'aunque, a pesar de (que), aun así', 'aunque + ind/subj changes meaning'],
          ['Cause', 'dado que, puesto que, ya que, como', '"como" only at sentence start'],
          ['Result', 'por lo tanto, así que, de modo que', 'introduce consequence'],
          ['Purpose', 'para que, a fin de que (+ subj)', 'always followed by subjunctive'],
          ['Addition', 'además, asimismo, incluso, encima', '"incluso/encima" = even/on top of that']
        ]
      },
      {
        type: 'tip',
        text: 'For formal writing (essays, emails, reports), prefer: sin embargo, no obstante, dado que, puesto que, por consiguiente, asimismo. For informal speech: pero, porque, así que, además. Mixing registers appropriately shows linguistic sophistication.'
      }
    ],
    exercises: [
      {
        id: 'b2-09-e1',
        type: 'multiple-choice',
        question: 'Choose the best connector: "___ la empresa tuvo pérdidas este año, decidió contratar más personal."',
        options: ['Dado que', 'A pesar de que', 'Por lo tanto', 'Para que'],
        correct: 1,
        explanation: '"A pesar de que" (despite the fact that) is correct. The sentence expresses a concession: despite having losses, they hired more staff. "Dado que" introduces cause (would mean they hired BECAUSE of losses). "Por lo tanto" introduces result. "Para que" introduces purpose.'
      },
      {
        id: 'b2-09-e2',
        type: 'fill-blank',
        template: 'Aunque ___ (llover) mañana, celebraremos la fiesta en el jardín de todas formas.',
        answer: 'llueva',
        explanation: '"Llueva" (present subjunctive) is correct. "Aunque" + subjunctive expresses a hypothetical concession: "even if it rains (whether or not)." The speaker will hold the party regardless. If we used indicative "llueve," it would mean "although it is raining [right now, which I know]" — a confirmed present fact, not a future possibility.'
      },
      {
        id: 'b2-09-e3',
        type: 'translate',
        source: 'She spoke slowly so that everyone could understand her.',
        answer: 'Habló despacio para que todos pudieran entenderla.',
        direction: 'en-es',
        explanation: '"Para que" (so that) expresses purpose and always requires the subjunctive in the subordinate clause. With a past reporting verb (habló), the subjunctive shifts to imperfect subjunctive: "pudieran" (imperfect subjunctive of poder). Different subjects (she spoke / everyone could understand) require para que + subjunctive.'
      },
      {
        id: 'b2-09-e4',
        type: 'translate',
        source: 'No teníamos el presupuesto suficiente; por lo tanto, tuvimos que cancelar el proyecto.',
        answer: 'We didn\'t have the sufficient budget; therefore, we had to cancel the project.',
        direction: 'es-en',
        explanation: '"Por lo tanto" means "therefore/consequently" and introduces a result or logical conclusion. It connects two independent clauses, typically separated by a semicolon or period. It is equivalent to "therefore" or "as a result" in formal English.'
      },
      {
        id: 'b2-09-e5',
        type: 'multiple-choice',
        question: 'Which sentence uses "como" (causal) CORRECTLY?',
        options: [
          'No fui a la fiesta como estaba cansado.',
          'Como estaba cansado, no fui a la fiesta.',
          'Estaba cansado, como no fui a la fiesta.',
          'No fui a la fiesta, como estaba cansado también.'
        ],
        correct: 1,
        explanation: '"Como estaba cansado, no fui a la fiesta" is correct. The causal "como" (since/because) must come at the BEGINNING of its clause, and that clause must come BEFORE the main clause. Using "como" mid-sentence or after the main clause is incorrect for the causal meaning (it would be read as a comparator "like/as").'
      }
    ]
  },
  {
    id: 'b2-10',
    level: 'B2',
    order: 10,
    title: 'Idiomatic Expressions',
    description: 'Master essential Spanish idioms with tener, hacer, and estar, plus body part expressions and common false cognates that trip up advanced learners.',
    estimatedTime: '25 min',
    icon: '🎪',
    content: [
      {
        type: 'text',
        text: 'Idiomatic expressions are the hallmark of a truly fluent speaker. Spanish is rich in fixed phrases with tener, hacer, and estar that cannot be translated word for word. Mastering these idioms — and avoiding false cognates — will take your Spanish to a truly native-like level.'
      },
      {
        type: 'rule',
        title: 'Tener Expressions',
        text: 'Many key Spanish expressions use tener (to have) where English uses "to be" or other verbs. These are fixed phrases that must be memorized as units.'
      },
      {
        type: 'table',
        headers: ['Expression', 'Literal', 'Real Meaning', 'Example'],
        rows: [
          ['tener ganas de', 'to have desire of', 'to feel like / to want to', 'Tengo ganas de dormir.'],
          ['tener en cuenta', 'to have in account', 'to take into account/consider', 'Ten en cuenta sus opiniones.'],
          ['tener razón', 'to have reason', 'to be right', '¡Tienes razón!'],
          ['tener prisa', 'to have hurry', 'to be in a hurry', 'No tengo prisa.'],
          ['tener lugar', 'to have place', 'to take place/happen', 'El evento tendrá lugar el viernes.'],
          ['tener éxito', 'to have success', 'to be successful', 'Su libro tuvo mucho éxito.'],
          ['tener sentido', 'to have sense', 'to make sense', 'Eso no tiene sentido.'],
          ['tener pinta de', 'to have appearance of', 'to look like', 'Tiene pinta de ser difícil.']
        ]
      },
      {
        type: 'rule',
        title: 'Hacer Expressions',
        text: 'Hacer (to do/make) appears in many fixed idiomatic phrases with meanings far removed from "doing" or "making."'
      },
      {
        type: 'table',
        headers: ['Expression', 'Real Meaning', 'Example'],
        rows: [
          ['hacer caso (a)', 'to pay attention to / to listen to', 'Nadie me hace caso.'],
          ['hacer falta', 'to be necessary / to need', 'Hace falta más tiempo.'],
          ['hacer ilusión', 'to be exciting / to look forward to', 'Me hace mucha ilusión el viaje.'],
          ['hacer la vista gorda', 'to turn a blind eye', 'El jefe hizo la vista gorda.'],
          ['hacer las paces', 'to make up / to reconcile', 'Al final hicieron las paces.']
        ]
      },
      {
        type: 'rule',
        title: 'Estar Expressions',
        text: 'These estar phrases describe mental states, awareness, and attitudes.'
      },
      {
        type: 'table',
        headers: ['Expression', 'Real Meaning', 'Example'],
        rows: [
          ['estar al tanto (de)', 'to be up to date / aware of', '¿Estás al tanto de las noticias?'],
          ['estar harto/a de', 'to be fed up with', 'Estoy harto de esperar.'],
          ['estar en las nubes', 'to have one\'s head in the clouds', 'Siempre está en las nubes.'],
          ['estar pez (en)', 'to be clueless / hopeless at', 'Estoy pez en matemáticas.'],
          ['no estar para bromas', 'to be in no mood for jokes', 'Hoy no estoy para bromas.']
        ]
      },
      {
        type: 'rule',
        title: 'Body Part Idioms',
        text: 'Spanish has vivid idiomatic expressions using body parts that are used in everyday conversation.'
      },
      {
        type: 'examples',
        items: [
          { spanish: 'Costar un ojo de la cara', english: 'To cost an arm and a leg (literally: to cost an eye from the face)', note: 'Este abrigo me costó un ojo de la cara.' },
          { spanish: 'Meter la pata', english: 'To put one\'s foot in it / to blunder', note: 'Metí la pata al mencionar su ex.' },
          { spanish: 'No tener pelos en la lengua', english: 'To not mince words / to speak frankly (literally: to have no hairs on the tongue)', note: 'Mi abuela no tiene pelos en la lengua.' },
          { spanish: 'Tomar el pelo (a alguien)', english: 'To pull someone\'s leg / to tease/mock', note: '¿Me estás tomando el pelo?' }
        ]
      },
      {
        type: 'warning',
        text: 'FALSE COGNATES (falsos amigos) — these words look like English words but mean something different: embarazada = pregnant (NOT embarrassed; use "avergonzado/a" for embarrassed), realizar = to carry out/achieve (NOT to realize; use "darse cuenta de" for to realize), actualmente = currently/at present (NOT actually; use "en realidad" or "de hecho" for actually), sensible = sensitive (NOT sensible; use "sensato/a" for sensible), éxito = success (NOT exit; use "salida" for exit).'
      },
      {
        type: 'tip',
        text: 'When learning idioms, always memorize them in full sentences with context. Note whether the subject of the sentence is the person who FEELS something (me hace ilusión = I\'m excited about it) or the person who DOES something (tomar el pelo = to tease someone). Many idioms have the experiencer as the indirect object.'
      }
    ],
    exercises: [
      {
        id: 'b2-10-e1',
        type: 'multiple-choice',
        question: 'What does "Estoy harto de esperar" mean?',
        options: [
          'I am full after waiting.',
          'I am fed up with waiting.',
          'I am afraid of waiting.',
          'I am ready to wait.'
        ],
        correct: 1,
        explanation: '"Estar harto/a de" means "to be fed up with." "Estoy harto de esperar" = "I am fed up with waiting." "Harto" literally means "satiated/full," but in this idiom it expresses exasperation or being at one\'s limit. It is a very common expression in spoken Spanish.'
      },
      {
        id: 'b2-10-e2',
        type: 'fill-blank',
        template: 'Cuando conoció a su ídolo, la fan metió ___ al decir algo inapropiado.',
        answer: 'la pata',
        explanation: '"Meter la pata" (to put one\'s foot in it / to blunder) is the idiom here. The fan made a social blunder. The complete phrase is "metió la pata." It is used when someone says or does something awkward or inappropriate accidentally.'
      },
      {
        id: 'b2-10-e3',
        type: 'translate',
        source: 'I\'m really looking forward to our trip to Seville.',
        answer: 'Me hace mucha ilusión nuestro viaje a Sevilla.',
        direction: 'en-es',
        explanation: '"Hacer ilusión" expresses excited anticipation — looking forward to something. "Me hace mucha ilusión" = I\'m really excited about it / I really look forward to it. The person who feels the excitement is the indirect object (me), and the thing causing excitement is the subject (el viaje).'
      },
      {
        id: 'b2-10-e4',
        type: 'translate',
        source: 'Mi compañera de trabajo no tiene pelos en la lengua y siempre dice lo que piensa.',
        answer: 'My coworker doesn\'t mince words and always says what she thinks.',
        direction: 'es-en',
        explanation: '"No tener pelos en la lengua" literally means "to have no hairs on the tongue." Figuratively it means to speak frankly, directly, without holding back — "to not mince words" or "to speak one\'s mind." It describes someone who is very direct and outspoken.'
      },
      {
        id: 'b2-10-e5',
        type: 'multiple-choice',
        question: 'Which sentence uses a false cognate CORRECTLY (i.e., uses the right word for the intended meaning)?',
        options: [
          'Estoy muy embarazada después de ese error en público.',
          'Me di cuenta de que había cometido un error.',
          'Actualmente no entiendo por qué dijiste eso.',
          'El éxito del edificio está a la derecha.'
        ],
        correct: 1,
        explanation: '"Me di cuenta de que" correctly means "I realized that" using "darse cuenta de." Option A: "embarazada" means pregnant, not embarrassed (use "avergonzada"). Option C: "actualmente" means currently/at present, not "actually" (use "en realidad"). Option D: "éxito" means success, not exit (use "salida").'
      }
    ]
  }
];
