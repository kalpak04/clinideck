import type { StudyDeck } from '../types/study';

export function createSampleNeetPgDeck(): StudyDeck {
  return {
    id: `deck_sample_${Date.now()}`,
    title: 'Cardiology & ECG Rapid Revision (Sample)',
    fileName: 'NEET-PG-Cardiology-Rapid-Revision-Sample.pdf',
    subject: 'Internal Medicine',
    createdAt: new Date().toISOString(),
    summary:
      'High-yield NEET PG rapid revision notes covering acute coronary syndromes, classic ECG localization, heart blocks, cardiomyopathies, and emergency antiarrhythmic drugs of choice.',
    keyTopics: [
      'Acute Coronary Syndrome',
      'Arrhythmias & ECG',
      'Valvular Heart Disease',
      'Cardiomyopathies',
      'Heart Failure Pharmacology',
    ],
    isSample: true,
    flashcards: [
      {
        id: 'sample_fc_1',
        format: 'clinical_vignette',
        topic: 'Acute Coronary Syndrome',
        front:
          'A 58-year-old man presents with crushing substernal chest pain, hypotension (BP 82/50 mmHg), elevated JVP, and clear lung fields. ECG reveals ST elevation in leads II, III, and aVF. Which medication must be strictly avoided?',
        back: 'Nitrates (Nitroglycerin) and aggressive diuretics.',
        clinicalPearl:
          'Inferior wall MI with hypotension, raised JVP, and clear lungs indicates Right Ventricular Infarction (confirm with right-sided lead V4R). RV MI is preload-dependent—treat with IV normal saline.',
        confidence: 'unseen',
        starred: true,
      },
      {
        id: 'sample_fc_2',
        format: 'exam_one_liner',
        topic: 'Arrhythmias & ECG',
        front:
          'What is the drug of choice for hemodynamically stable paroxysmal supraventricular tachycardia (PSVT) unresponsive to vagal maneuvers?',
        back: 'IV Adenosine (6 mg rapid IV bolus followed by 12 mg if needed).',
        clinicalPearl:
          'Adenosine has an ultra-short half-life (<10 seconds), causes transient AV nodal block, and is contraindicated in severe bronchospastic asthma and WPW with atrial fibrillation.',
        confidence: 'unseen',
        starred: false,
      },
      {
        id: 'sample_fc_3',
        format: 'clinical_vignette',
        topic: 'Cardiomyopathies',
        front:
          'A 21-year-old varsity athlete collapses during training. Auscultation reveals a harsh crescendo-decrescendo systolic murmur at the left sternal border that INCREASES in intensity during the Valsalva maneuver and on standing. Most likely diagnosis and mutation?',
        back: 'Hypertrophic Obstructive Cardiomyopathy (HOCM); autosomal dominant mutation in beta-myosin heavy chain (MYH7) or MYBPC3.',
        clinicalPearl:
          'Only two murmurs increase with Valsalva (decreased preload): HOCM and Mitral Valve Prolapse (click moves earlier). All other systolic murmurs decrease.',
        confidence: 'unseen',
        starred: true,
      },
      {
        id: 'sample_fc_4',
        format: 'exam_one_liner',
        topic: 'Arrhythmias & ECG',
        front:
          'What is the definitive drug of choice for Torsades de Pointes (polymorphic VT with prolonged QT) in a hemodynamically stable patient?',
        back: 'IV Magnesium Sulfate (2 g IV), even when serum magnesium levels are normal.',
        clinicalPearl:
          'Avoid Class IA and Class III antiarrhythmics (except amiodarone rarely) as they further prolong the QT interval; if unstable, perform immediate unsynchronized defibrillation.',
        confidence: 'unseen',
        starred: false,
      },
      {
        id: 'sample_fc_5',
        format: 'clinical_vignette',
        topic: 'Arrhythmias & ECG',
        front:
          'A 32-year-old man with known Wolff-Parkinson-White (WPW) syndrome arrives in the ER with an irregular, wide-complex tachycardia at 195 bpm (BP 112/74 mmHg). Which agent is preferred over AV nodal blockers?',
        back: 'IV Procainamide (or Ibutilide); strictly avoid adenosine, verapamil, diltiazem, beta-blockers, and digoxin.',
        clinicalPearl:
          'Blocking the AV node in pre-excited atrial fibrillation forces unopposed rapid conduction down the accessory Bundle of Kent, precipitating lethal ventricular fibrillation.',
        confidence: 'unseen',
        starred: false,
      },
      {
        id: 'sample_fc_6',
        format: 'exam_one_liner',
        topic: 'Heart Failure Pharmacology',
        front:
          'Which four foundational drug classes ("Four Pillars") reduce all-cause mortality in HFrEF (Heart Failure with Reduced Ejection Fraction)?',
        back: '1) ARNI (Sacubitril-Valsartan) or ACEi/ARB, 2) Evidence-based Beta-blockers (Bisoprolol, Carvedilol, Metoprolol succinate), 3) Mineralocorticoid receptor antagonists (Spironolactone/Eplerenone), 4) SGLT2 inhibitors (Dapagliflozin/Empagliflozin).',
        clinicalPearl:
          'Loop diuretics (furosemide) and digoxin provide symptomatic relief and reduce hospitalizations, but do NOT confer a mortality benefit.',
        confidence: 'unseen',
        starred: true,
      },
      {
        id: 'sample_fc_7',
        format: 'exam_one_liner',
        topic: 'Valvular Heart Disease',
        front:
          'What is the earliest symptom of severe Aortic Stenosis, and which symptom carries the worst prognosis (shortest median survival)?',
        back: 'Earliest symptom: Exertional dyspnea (or angina/syncope triad "SAD"). Worst prognosis: Heart failure / dyspnea (~2 years median survival without valve replacement).',
        clinicalPearl:
          'Remember SAD survival curve: Angina (~5 years), Syncope (~3 years), Dyspnea/Heart failure (~2 years). Associated with pulsus parvus et tardus and Heyde syndrome.',
        confidence: 'unseen',
        starred: false,
      },
      {
        id: 'sample_fc_8',
        format: 'clinical_vignette',
        topic: 'Acute Coronary Syndrome',
        front:
          'Five days after an anterior wall STEMI, a 64-year-old woman develops sudden cardiogenic shock with a new harsh holosystolic murmur at the left lower sternal border and a palpable thrill. Right heart catheterization shows an oxygen step-up from right atrium to right ventricle. Diagnosis?',
        back: 'Interventricular Septal Rupture (VSR).',
        clinicalPearl:
          'Distinguish from papillary muscle rupture (severe acute MR with giant V waves on PCWP, no O2 step-up in RV, more common in inferior MI via posteromedial papillary muscle single blood supply from PDA).',
        confidence: 'unseen',
        starred: false,
      },
    ],
    qaItems: [
      {
        id: 'sample_qa_1',
        format: 'clinical_vignette',
        topic: 'Acute Coronary Syndrome',
        question:
          'How do you differentiate Right Ventricular MI from Left Ventricular cardiogenic shock in an inferior wall STEMI, and how does acute management differ?',
        answer:
          'RV MI presents with the classic triad of hypotension, elevated JVP (with Kussmaul sign), and CLEAR lung fields on auscultation, confirmed by ≥1 mm ST elevation in right-sided lead V4R. Unlike LV failure, RV MI requires cautious IV normal saline boluses to maintain RV preload; nitrates and diuretics are contraindicated as they cause precipitous hypotension.',
        highYieldClue: 'Hypotension + Raised JVP + Clear Lungs = RV MI (Check lead V4R).',
        revised: false,
        starred: true,
      },
      {
        id: 'sample_qa_2',
        format: 'exam_one_liner',
        topic: 'Arrhythmias & ECG',
        question:
          'What are the key ECG differences between Mobitz Type I (Wenckebach) and Mobitz Type II second-degree AV block, and which requires a permanent pacemaker?',
        answer:
          'Mobitz Type I shows progressive PR interval prolongation until a dropped QRS complex (block is at the AV node; usually benign). Mobitz Type II shows constant PR intervals with sudden unexpected dropped QRS complexes (block is infranodal in the His-Purkinje system; high risk of progression to complete heart block and requires a permanent pacemaker).',
        highYieldClue: 'Mobitz II = Constant PR + Dropped beat = Infranodal = Pacemaker.',
        revised: false,
      },
      {
        id: 'sample_qa_3',
        format: 'clinical_vignette',
        topic: 'Cardiomyopathies',
        question:
          'Which bedside dynamic auscultation maneuvers increase vs. decrease the systolic ejection murmur of Hypertrophic Obstructive Cardiomyopathy (HOCM)?',
        answer:
          'Maneuvers that DECREASE LV preload or afterload (Valsalva strain phase, abrupt standing, amyl nitrite) bring the septum and anterior mitral leaflet closer together, worsening outflow obstruction and INCREASING the murmur. Maneuvers that INCREASE preload or afterload (squatting, passive leg raise, sustained handgrip) expand the LV cavity and DECREASE the murmur.',
        highYieldClue: 'Less blood in LV = Louder HOCM murmur (Valsalva / Standing).',
        revised: false,
        starred: true,
      },
      {
        id: 'sample_qa_4',
        format: 'exam_one_liner',
        topic: 'Valvular Heart Disease',
        question:
          'What is the characteristic auscultatory sequence of Mitral Stenosis, and how does the S2–Opening Snap (OS) interval correlate with severity?',
        answer:
          'Mitral stenosis produces a loud S1, an early diastolic Opening Snap (OS) after S2, and a low-pitched mid-diastolic rumbling murmur with presystolic accentuation (lost in atrial fibrillation) best heard at the apex in the left lateral decubitus position. A SHORTER S2–OS interval indicates higher left atrial pressure and MORE SEVERE stenosis.',
        highYieldClue: 'Shorter S2–OS gap = Tighter Mitral Stenosis.',
        revised: false,
      },
      {
        id: 'sample_qa_5',
        format: 'exam_one_liner',
        topic: 'Heart Failure Pharmacology',
        question:
          'Why must a 36-hour washout period be observed when switching a heart failure patient from an ACE inhibitor to Sacubitril-Valsartan (ARNI)?',
        answer:
          'Both ACE inhibitors and neprilysin inhibitors (sacubitril) prevent the breakdown of bradykinin. Overlapping them causes severe bradykinin accumulation and a markedly increased risk of life-threatening angioedema. No washout is required when switching from an ARB to an ARNI.',
        highYieldClue: '36-hour ACEi washout before ARNI prevents bradykinin-mediated angioedema.',
        revised: false,
      },
      {
        id: 'sample_qa_6',
        format: 'clinical_vignette',
        topic: 'Acute Coronary Syndrome',
        question:
          'Which papillary muscle is most vulnerable to rupture following myocardial infarction, and what hemodynamic hallmark confirms acute mitral regurgitation on Swan-Ganz catheterization?',
        answer:
          'The posteromedial papillary muscle is most susceptible because it receives a single arterial blood supply from the posterior descending artery (PDA), unlike the anterolateral muscle which has dual supply (LAD and LCX). Swan-Ganz pulmonary capillary wedge pressure (PCWP) tracing demonstrates giant V waves without an oxygen saturation step-up in the right ventricle.',
        highYieldClue: 'Posteromedial = Single supply (PDA) -> Acute MR -> Giant V waves on PCWP.',
        revised: false,
      },
    ],
    mcqs: [
      {
        id: 'sample_mcq_1',
        format: 'clinical_vignette',
        topic: 'Acute Coronary Syndrome',
        stem: 'A 60-year-old diabetic man arrives with 2 hours of severe epigastric pain and diaphoresis. BP is 84/52 mmHg, HR 62/min, JVP is elevated to the angle of the jaw, and lungs are clear bilaterally. ECG shows ST elevation in leads II, III, and aVF with ST depression in I and aVL. What is the most appropriate immediate supportive step alongside urgent PCI preparation?',
        options: [
          'Sublingual nitroglycerin 0.4 mg',
          'IV furosemide 40 mg bolus',
          'Cautious IV 0.9% normal saline bolus',
          'IV metoprolol 5 mg',
        ],
        correctIndex: 2,
        explanation:
          'The triad of hypotension, elevated JVP, and clear lung fields in an inferior wall STEMI is classic for Right Ventricular infarction. Because RV stroke volume depends heavily on preload, cautious IV crystalloid (0.9% saline) restores cardiac output.',
        distractorNotes:
          'Nitroglycerin and furosemide reduce preload and worsen shock in RV MI; IV beta-blockers are contraindicated in acute hypotension/cardiogenic shock.',
        starred: true,
      },
      {
        id: 'sample_mcq_2',
        format: 'clinical_vignette',
        topic: 'Arrhythmias & ECG',
        stem: 'A 28-year-old man with history of delta waves on baseline ECG presents with palpitations and dizziness. BP is 116/72 mmHg. Cardiac monitor shows an irregularly irregular wide-complex tachycardia at 200 beats/min with beat-to-beat QRS morphology variation. Which drug is the treatment of choice?',
        options: [
          'IV Adenosine',
          'IV Verapamil',
          'IV Procainamide',
          'IV Digoxin',
        ],
        correctIndex: 2,
        explanation:
          'Irregularly irregular wide-complex tachycardia in a WPW patient represents pre-excited atrial fibrillation. In a stable patient, IV Procainamide (or Ibutilide) slows conduction through the accessory pathway safely.',
        distractorNotes:
          'Adenosine, verapamil, and digoxin block the AV node and enhance conduction down the accessory pathway, risking immediate degeneration into ventricular fibrillation.',
        starred: true,
      },
      {
        id: 'sample_mcq_3',
        format: 'exam_one_liner',
        topic: 'Cardiomyopathies',
        stem: 'Which bedside maneuver decreases the intensity of the systolic murmur in Hypertrophic Obstructive Cardiomyopathy (HOCM)?',
        options: [
          'Valsalva maneuver (strain phase)',
          'Abrupt standing from squatting',
          'Sustained isometric handgrip',
          'Administration of amyl nitrite',
        ],
        correctIndex: 2,
        explanation:
          'Sustained isometric handgrip increases systemic vascular resistance (afterload), enlarging left ventricular end-systolic volume and reducing dynamic LV outflow tract obstruction, thereby decreasing the HOCM murmur.',
        distractorNotes:
          'Valsalva, abrupt standing, and amyl nitrite all decrease preload or afterload, shrinking LV volume and intensifying the HOCM murmur.',
      },
      {
        id: 'sample_mcq_4',
        format: 'exam_one_liner',
        topic: 'Heart Failure Pharmacology',
        stem: 'All of the following drugs have been proven to reduce all-cause mortality in Heart Failure with Reduced Ejection Fraction (HFrEF) EXCEPT:',
        options: [
          'Carvedilol',
          'Spironolactone',
          'Dapagliflozin',
          'Furosemide',
        ],
        correctIndex: 3,
        explanation:
          'Loop diuretics like furosemide relieve pulmonary and peripheral congestion effectively, improving symptoms and quality of life, but do not independently reduce all-cause mortality in HFrEF.',
        distractorNotes:
          'Carvedilol (beta-blocker), spironolactone (MRA), and dapagliflozin (SGLT2 inhibitor) are all core mortality-reducing pillars of guideline-directed medical therapy.',
      },
      {
        id: 'sample_mcq_5',
        format: 'clinical_vignette',
        topic: 'Acute Coronary Syndrome',
        stem: 'Four days after an inferior STEMI, a 67-year-old man develops sudden flash pulmonary edema, hypotension, and a new soft systolic murmur at the apex. Pulmonary artery catheterization reveals giant V waves on the wedge tracing without an oxygen step-up in the right ventricle. Which structure has most likely ruptured?',
        options: [
          'Anterolateral papillary muscle',
          'Posteromedial papillary muscle',
          'Interventricular septum',
          'Left ventricular free wall',
        ],
        correctIndex: 1,
        explanation:
          'The posteromedial papillary muscle has a single blood supply from the posterior descending artery (PDA), making it highly vulnerable in inferior wall MI. Rupture causes acute severe mitral regurgitation with giant V waves on PCWP.',
        distractorNotes:
          'Anterolateral papillary muscle has dual LAD/LCX supply; VSR causes an O2 saturation step-up from RA to RV; free wall rupture presents with cardiac tamponade and pulseless electrical activity.',
      },
    ],
    quizHistory: [],
  };
}
