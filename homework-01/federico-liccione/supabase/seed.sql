-- Seed data per la demo — eventi realistici italiani
-- Eseguire nel SQL Editor di Supabase dopo schema.sql

INSERT INTO events (
  title, description, event_type, tags,
  location_text, city, region,
  lat, lng,
  start_date, end_date,
  source_url, source_name, content_hash
) VALUES

-- === SCIOPERI ===
(
  'Sciopero generale trasporti pubblici — 8 ore',
  'Sciopero nazionale di 8 ore dei lavoratori del trasporto pubblico locale proclamato da USB e COBAS. Saranno garantite le fasce di garanzia: 5:30-8:30 e 17:00-20:00.',
  'sciopero',
  ARRAY['lavoro','trasporti','precariato'],
  'Tutto il territorio nazionale', 'Roma', 'Lazio',
  41.9028, 12.4964,
  '2026-06-20T00:00:00+02:00', '2026-06-20T23:59:00+02:00',
  'https://cgsse.it/proclamazioni/2026/sciopero-tpl-giugno',
  'cgsse', 'seed001'
),
(
  'Sciopero lavoratori GKN Firenze — solidarietà nazionale',
  'Il Collettivo di Fabbrica GKN proclama uno sciopero con presidio davanti ai cancelli dello stabilimento di Campi Bisenzio. Richiesta di reintegro di tutti i lavoratori e nazionalizzazione dello stabilimento.',
  'sciopero',
  ARRAY['lavoro','industria','campi-bisenzio','solidarietà'],
  'Via Fratelli Cervi 120, Campi Bisenzio', 'Firenze', 'Toscana',
  43.8270, 11.1370,
  '2026-06-21T09:00:00+02:00', '2026-06-21T18:00:00+02:00',
  'https://t.me/GKNFirenze/1234',
  'telegram', 'seed002'
),
(
  'Sciopero scuola — contro i tagli all''istruzione',
  'Sciopero nazionale di tutto il personale scolastico, docenti e ATA. Indetto da COBAS Scuola contro i tagli al Fondo Integrativo Statale e le politiche di precarizzazione del lavoro scolastico.',
  'sciopero',
  ARRAY['istruzione','lavoro','precariato','scuola'],
  'Piazza della Repubblica', 'Roma', 'Lazio',
  41.9017, 12.5008,
  '2026-06-25T00:00:00+02:00', '2026-06-25T23:59:00+02:00',
  'https://cgsse.it/proclamazioni/2026/sciopero-scuola-giugno',
  'cgsse', 'seed003'
),
(
  'Sciopero treni Trenitalia — 24 ore',
  'Sciopero di 24 ore del personale Trenitalia proclamato da ORSA Ferrovie. Possibili cancellazioni e ritardi sulla rete ferroviaria nazionale. Garantiti i treni nelle fasce protette.',
  'sciopero',
  ARRAY['trasporti','lavoro','treni'],
  'Stazione Termini', 'Roma', 'Lazio',
  41.9009, 12.5022,
  '2026-06-28T00:00:00+02:00', '2026-06-28T23:59:00+02:00',
  'https://scioperi.mit.gov.it/dettaglio/2026/trenitalia-giugno',
  'mit', 'seed004'
),
(
  'Sciopero sanità pubblica — contro il sottofinanziamento',
  'Sciopero nazionale di medici e infermieri del SSN indetto da FIALS e NurSind. Richiesta di adeguamento dei fondi per la sanità pubblica e stop alle esternalizzazioni.',
  'sciopero',
  ARRAY['sanità','lavoro','servizi-pubblici'],
  'Ospedale Niguarda', 'Milano', 'Lombardia',
  45.5102, 9.1927,
  '2026-07-03T00:00:00+02:00', '2026-07-03T23:59:00+02:00',
  'https://cgsse.it/proclamazioni/2026/sciopero-sanita-luglio',
  'cgsse', 'seed005'
),

-- === MANIFESTAZIONI ===
(
  'Manifestazione nazionale per la Palestina — Stop al genocidio',
  'Corteo nazionale convocato dalle reti per la Palestina. Si parte da Piazza della Repubblica alle 14:00, arrivo a Piazza San Giovanni. Partecipazione di centri sociali, associazioni, partiti di sinistra e comunità palestinese in Italia.',
  'manifestazione',
  ARRAY['palestina','no-guerra','solidarietà','antifascismo'],
  'Piazza della Repubblica', 'Roma', 'Lazio',
  41.9017, 12.5008,
  '2026-06-22T14:00:00+02:00', '2026-06-22T19:00:00+02:00',
  'https://t.me/poterealpopoloita/5678',
  'telegram', 'seed006'
),
(
  'Manifestazione per il clima — Fridays for Future Milano',
  'Sciopero globale per il clima indetto da Fridays for Future. Corteo da Largo Cairoli fino all''Arena Civica. Richiesta di uscita dalle fonti fossili entro il 2030 e giustizia climatica.',
  'corteo',
  ARRAY['ambiente','clima','no-fossili','giovani'],
  'Largo Cairoli', 'Milano', 'Lombardia',
  45.4705, 9.1796,
  '2026-06-27T10:00:00+02:00', '2026-06-27T14:00:00+02:00',
  'https://t.me/FridaysForFutureIT/890',
  'telegram', 'seed007'
),
(
  'Manifestazione contro le politiche migratorie — Torino',
  'Manifestazione convocata da una rete di associazioni antirazziste per protestare contro il decreto sicurezza e le politiche di respingimento. Concentramento in Piazza Castello.',
  'manifestazione',
  ARRAY['migranti','antifascismo','diritti','antirazzismo'],
  'Piazza Castello', 'Torino', 'Piemonte',
  45.0732, 7.6858,
  '2026-07-04T15:00:00+02:00', '2026-07-04T18:00:00+02:00',
  'https://t.me/poterealpopoloita/6001',
  'telegram', 'seed008'
),
(
  'Corteo antifascista — 25 Aprile Bologna',
  'Corteo dell''ANPI per il 25 Aprile in ricordo della Liberazione. Partenza dal Parco della Montagnola alle 10:00 con arrivo in Piazza Maggiore. Presenti sezioni ANPI, partigiani e cittadinanza.',
  'corteo',
  ARRAY['antifascismo','resistenza','25-aprile','storia'],
  'Parco della Montagnola', 'Bologna', 'Emilia-Romagna',
  44.5067, 11.3471,
  '2026-07-05T10:00:00+02:00', '2026-07-05T13:00:00+02:00',
  'https://t.me/ANPIufficiale/2345',
  'telegram', 'seed009'
),
(
  'Manifestazione per i diritti LGBTQ+ — Napoli Pride',
  'Pride di Napoli: concentramento in Piazza Municipio e corteo verso Lungomare Caracciolo. Partecipazione di associazioni LGBTQ+, centri sociali e organizzazioni politiche.',
  'corteo',
  ARRAY['diritti-lgbtq','femminismo','antifascismo'],
  'Piazza Municipio', 'Napoli', 'Campania',
  40.8401, 14.2529,
  '2026-07-11T16:00:00+02:00', '2026-07-11T21:00:00+02:00',
  'https://t.me/poterealpopoloita/6200',
  'telegram', 'seed010'
),

-- === PRESIDI ===
(
  'Presidio contro la chiusura del pronto soccorso di Genova',
  'Presidio permanente davanti all''ospedale San Martino organizzato da comitati cittadini contro la decisione della Regione di ridurre i servizi di pronto soccorso.',
  'presidio',
  ARRAY['sanità','servizi-pubblici','territorio'],
  'Ospedale Policlinico San Martino', 'Genova', 'Liguria',
  44.4056, 8.9463,
  '2026-06-23T10:00:00+02:00', '2026-06-23T17:00:00+02:00',
  'https://t.me/poterealpopoloita/5900',
  'telegram', 'seed011'
),
(
  'Presidio contro lo sgombero del centro sociale Askatasuna',
  'Presidio di solidarietà davanti al centro sociale Askatasuna contro il decreto di sgombero emesso dal Prefetto. Partecipazione di vari collettivi torinesi.',
  'presidio',
  ARRAY['diritti','antifascismo','casa','centri-sociali'],
  'Corso Regina Margherita 47', 'Torino', 'Piemonte',
  45.0758, 7.6741,
  '2026-06-24T18:00:00+02:00', '2026-06-24T21:00:00+02:00',
  'https://t.me/poterealpopoloita/5950',
  'telegram', 'seed012'
),

-- === ALTRI ===
(
  'Assemblea pubblica casa e affitti — emergenza abitativa',
  'Assemblea aperta di inquilini e occupanti contro il caro affitti e le speculazioni immobiliari. Interverranno rappresentanti di Asia-USB, Unione Inquilini e centri sociali romani.',
  'manifestazione',
  ARRAY['casa','precariato','affitti','diritti'],
  'Piazza Vittorio Emanuele II', 'Roma', 'Lazio',
  41.8930, 12.5110,
  '2026-07-01T17:30:00+02:00', '2026-07-01T20:00:00+02:00',
  'https://t.me/poterealpopoloita/6100',
  'telegram', 'seed013'
),
(
  'Sciopero lavoratori Amazon — riconoscimento diritti sindacali',
  'Sciopero dei lavoratori del magazzino Amazon di Piacenza indetto da SI Cobas. Richiesta di riconoscimento delle rappresentanze sindacali e stop ai ritmi insostenibili di lavoro.',
  'sciopero',
  ARRAY['lavoro','logistica','precariato','amazon'],
  'Via Sormanno, zona industriale', 'Piacenza', 'Emilia-Romagna',
  44.9854, 9.6928,
  '2026-07-02T06:00:00+02:00', '2026-07-02T18:00:00+02:00',
  'https://t.me/SiCobas/3456',
  'telegram', 'seed014'
),
(
  'Manifestazione contro le basi NATO — Venezia',
  'Manifestazione promossa dalla rete No-War contro l''ampliamento della base militare NATO di Vicenza e il riarmo europeo. Concentramento in Piazzale Roma.',
  'manifestazione',
  ARRAY['no-guerra','pace','nato','antimilitarismo'],
  'Piazzale Roma', 'Venezia', 'Veneto',
  45.4408, 12.3200,
  '2026-07-06T14:00:00+02:00', '2026-07-06T18:00:00+02:00',
  'https://t.me/poterealpopoloita/6300',
  'telegram', 'seed015'
);
