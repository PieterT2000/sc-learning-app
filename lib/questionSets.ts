/**
 * Named collections of catechism questions the user can choose to be quizzed
 * on, picked on the Home screen. Each set is a contiguous inclusive id range
 * (the 107 WSC questions are ids 1..107). A session still draws up to
 * SESSION_SIZE questions from within the chosen set - see
 * progressStore.getSessionQuestions.
 *
 * Theme groupings follow the standard outline of the Westminster Shorter
 * Catechism (Part I: what man is to believe concerning God, Q1-38; Part II:
 * what duty God requires of man, Q39-107).
 */
export interface QuestionSet {
  id: string;
  label: string; // shown in the <select>
  group: string; // <optgroup> heading
  from: number; // inclusive question id
  to: number; // inclusive question id
  blurb?: string; // one line shown under the selector when this set is chosen
}

export const ALL_SET_ID = 'all';

export const QUESTION_SETS: ReadonlyArray<QuestionSet> = [
  {
    id: ALL_SET_ID,
    label: 'All 107 questions',
    group: 'Everything',
    from: 1,
    to: 107,
    blurb: 'The whole Westminster Shorter Catechism, in order.',
  },

  // --- by number -------------------------------------------------------
  { id: 'n1', label: 'Q1-10', group: 'By number', from: 1, to: 10 },
  { id: 'n2', label: 'Q11-20', group: 'By number', from: 11, to: 20 },
  { id: 'n3', label: 'Q21-30', group: 'By number', from: 21, to: 30 },
  { id: 'n4', label: 'Q31-40', group: 'By number', from: 31, to: 40 },
  { id: 'n5', label: 'Q41-50', group: 'By number', from: 41, to: 50 },
  { id: 'n6', label: 'Q51-60', group: 'By number', from: 51, to: 60 },
  { id: 'n7', label: 'Q61-70', group: 'By number', from: 61, to: 70 },
  { id: 'n8', label: 'Q71-80', group: 'By number', from: 71, to: 80 },
  { id: 'n9', label: 'Q81-90', group: 'By number', from: 81, to: 90 },
  { id: 'n10', label: 'Q91-100', group: 'By number', from: 91, to: 100 },
  { id: 'n11', label: 'Q101-107', group: 'By number', from: 101, to: 107 },

  // --- by theme (top level) ------------------------------------------
  {
    id: 't1',
    label: 'Foundations & Nature of God (Q1-12)',
    group: 'By theme',
    from: 1,
    to: 12,
    blurb:
      "Man's chief end, Scripture as the rule of faith, the nature and Trinity of God, his decrees, creation, and the Covenant of Life.",
  },
  {
    id: 't2',
    label: 'The Fall, Sin & Human Misery (Q13-19)',
    group: 'By theme',
    from: 13,
    to: 19,
    blurb: 'The Fall, the nature of sin, original sin, total depravity, and the estate of misery.',
  },
  {
    id: 't3',
    label: 'Redemption & the Mediator (Q20-28)',
    group: 'By theme',
    from: 20,
    to: 28,
    blurb:
      'The Covenant of Grace, Christ the Redeemer, his offices as Prophet, Priest and King, and his humiliation and exaltation.',
  },
  {
    id: 't4',
    label: 'Application of Redemption & Benefits (Q29-38)',
    group: 'By theme',
    from: 29,
    to: 38,
    blurb:
      'Effectual calling, justification, adoption, sanctification and their fruits, and the benefits at death and the resurrection.',
  },
  {
    id: 't5',
    label: 'The Moral Law & the Ten Commandments (Q39-81)',
    group: 'By theme',
    from: 39,
    to: 81,
    blurb:
      'The nature and summary of the moral law, and each of the Ten Commandments - the first table (duty to God) and the second (duty to man).',
  },
  {
    id: 't6',
    label: 'Sin, Guilt & Human Inability (Q82-84)',
    group: 'By theme',
    from: 82,
    to: 84,
    blurb: 'Inability to keep the law, the degrees of guilt, and the wrath of God.',
  },
  {
    id: 't7',
    label: 'Means of Grace (Q85-107)',
    group: 'By theme',
    from: 85,
    to: 107,
    blurb:
      "Faith and repentance, the ministry of the Word, the sacraments (Baptism and the Lord's Supper), and prayer.",
  },

  // --- by topic (finer subsections) --------------------------------
  { id: 's1', label: "Man's chief end & Scripture (Q1-3)", group: 'By topic', from: 1, to: 3 },
  { id: 's2', label: 'Nature, attributes & Trinity of God (Q4-6)', group: 'By topic', from: 4, to: 6 },
  { id: 's3', label: "God's decrees, creation & providence (Q7-8)", group: 'By topic', from: 7, to: 8 },
  { id: 's4', label: 'Creation of man & the Covenant of Life (Q9-12)', group: 'By topic', from: 9, to: 12 },
  { id: 's5', label: 'The Fall & the nature of sin (Q13-15)', group: 'By topic', from: 13, to: 15 },
  { id: 's6', label: 'Original sin & the estate of misery (Q16-19)', group: 'By topic', from: 16, to: 19 },
  { id: 's7', label: 'Covenant of Grace & Christ the Redeemer (Q20-22)', group: 'By topic', from: 20, to: 22 },
  { id: 's8', label: 'The three offices of Christ (Q23-26)', group: 'By topic', from: 23, to: 26 },
  { id: 's9', label: 'Humiliation & exaltation of Christ (Q27-28)', group: 'By topic', from: 27, to: 28 },
  { id: 's10', label: 'The Spirit & effectual calling (Q29-31)', group: 'By topic', from: 29, to: 31 },
  { id: 's11', label: 'Justification, adoption & sanctification (Q32-36)', group: 'By topic', from: 32, to: 36 },
  { id: 's12', label: 'Benefits at death & the resurrection (Q37-38)', group: 'By topic', from: 37, to: 38 },
  { id: 's13', label: 'Nature of the moral law & the Decalogue preface (Q39-44)', group: 'By topic', from: 39, to: 44 },
  { id: 's14', label: '1st Commandment - worshipping God alone (Q45-48)', group: 'By topic', from: 45, to: 48 },
  { id: 's15', label: '2nd Commandment - pure worship (Q49-52)', group: 'By topic', from: 49, to: 52 },
  { id: 's16', label: "3rd Commandment - God's name (Q53-56)", group: 'By topic', from: 53, to: 56 },
  { id: 's17', label: '4th Commandment - the Sabbath (Q57-62)', group: 'By topic', from: 57, to: 62 },
  { id: 's18', label: '5th Commandment - honouring authority (Q63-66)', group: 'By topic', from: 63, to: 66 },
  { id: 's19', label: '6th Commandment - preserving life (Q67-69)', group: 'By topic', from: 67, to: 69 },
  { id: 's20', label: '7th Commandment - chastity & purity (Q70-72)', group: 'By topic', from: 70, to: 72 },
  { id: 's21', label: '8th Commandment - property & wealth (Q73-75)', group: 'By topic', from: 73, to: 75 },
  { id: 's22', label: '9th Commandment - truth & good name (Q76-78)', group: 'By topic', from: 76, to: 78 },
  { id: 's23', label: '10th Commandment - contentment (Q79-81)', group: 'By topic', from: 79, to: 81 },
  { id: 's24', label: 'Faith, repentance & outward means (Q85-87)', group: 'By topic', from: 85, to: 87 },
  { id: 's25', label: 'The ministry of the Word (Q88-90)', group: 'By topic', from: 88, to: 90 },
  { id: 's26', label: "The sacraments - Baptism & the Lord's Supper (Q91-97)", group: 'By topic', from: 91, to: 97 },
  { id: 's27', label: "Prayer & the Lord's Prayer (Q98-107)", group: 'By topic', from: 98, to: 107 },
];

export function questionSetById(id: string): QuestionSet {
  return QUESTION_SETS.find((s) => s.id === id) ?? QUESTION_SETS[0];
}

/** Size (question count) of a set. */
export function questionSetSize(id: string): number {
  const set = questionSetById(id);
  return set.to - set.from + 1;
}

/** Inclusive id range -> explicit list of question ids. */
export function idsForQuestionSet(id: string): number[] {
  const set = questionSetById(id);
  const ids: number[] = [];
  for (let i = set.from; i <= set.to; i++) ids.push(i);
  return ids;
}

/** Stable order of the <optgroup> headings for the selector. */
export const QUESTION_SET_GROUPS: readonly string[] = [
  'Everything',
  'By number',
  'By theme',
  'By topic',
];
