// Romanised Nepali to Devanagari.
//
// Romanisation is lossy: "Sita" could be सिता or सीता, and nothing in the English
// spelling says which. So this works in two passes — a dictionary of names that
// actually recur on a Nepali school roll, then letter rules for everything else.
// The output is a suggestion for a human to accept, never a silent replacement.

/// Names whose conventional spelling the rules would get wrong. Keys are lower
/// case; add to this rather than bending the rules, which would break others.
const KNOWN: Record<string, string> = {
  // Given names
  sita: "सीता", gita: "गीता", rita: "रीता", nita: "नीता", anita: "अनिता",
  sunita: "सुनिता", kabita: "कविता", kavita: "कविता", sarita: "सरिता",
  asha: "आशा", usha: "उषा", nisha: "निशा", puja: "पूजा", pooja: "पूजा",
  rekha: "रेखा", muna: "मुना", bina: "बिना", sabina: "सबिना", sapana: "सपना",
  samjhana: "सम्झना", laxmi: "लक्ष्मी", saraswati: "सरस्वती", parvati: "पार्वती",
  radha: "राधा", sushila: "सुशीला", kamala: "कमला", bimala: "विमला",
  ram: "राम", shyam: "श्याम", hari: "हरि", krishna: "कृष्ण", gopal: "गोपाल",
  ramesh: "रमेश", suresh: "सुरेश", mahesh: "महेश", dinesh: "दिनेश",
  rajesh: "राजेश", naresh: "नरेश", ganesh: "गणेश", bishnu: "विष्णु",
  prakash: "प्रकाश", subash: "सुभाष", subhash: "सुभाष", santosh: "सन्तोष",
  anish: "अनिश", ashish: "आशिष", manish: "मनिष", nabin: "नविन",
  navin: "नवीन", bibek: "विवेक", bivek: "विवेक", sujan: "सुजन",
  sagar: "सागर", kiran: "किरण", rohan: "रोहन", bikash: "विकास",
  bikas: "विकास", ujjwal: "उज्ज्वल", deepak: "दीपक", dipak: "दीपक",
  binod: "विनोद", pramod: "प्रमोद", arjun: "अर्जुन", bharat: "भरत",
  buddha: "बुद्ध", indra: "इन्द्र", madan: "मदन", milan: "मिलन",
  // Surnames
  sharma: "शर्मा", thapa: "थापा", rai: "राई", gurung: "गुरुङ",
  magar: "मगर", tamang: "तामाङ", lama: "लामा", limbu: "लिम्बु",
  shrestha: "श्रेष्ठ", maharjan: "महर्जन", karki: "कार्की",
  adhikari: "अधिकारी", poudel: "पौडेल", paudel: "पौडेल",
  bhattarai: "भट्टराई", acharya: "आचार्य", dahal: "दाहाल",
  koirala: "कोइराला", pandey: "पाण्डे", panday: "पाण्डे",
  joshi: "जोशी", basnet: "बस्नेत", khatri: "क्षेत्री", chhetri: "क्षेत्री",
  kc: "के.सी.", bhandari: "भण्डारी", subedi: "सुवेदी", regmi: "रेग्मी",
  ghimire: "घिमिरे", neupane: "न्यौपाने", sapkota: "सापकोटा",
  aryal: "अर्याल", timilsina: "तिमिल्सिना", bista: "बिष्ट", bisht: "बिष्ट",
  rana: "राणा", malla: "मल्ल", newar: "नेवार", yadav: "यादव",
  chaudhary: "चौधरी", mandal: "मण्डल", sah: "साह", shah: "शाह",
  // Honorific-ish middles
  bahadur: "बहादुर", kumar: "कुमार", kumari: "कुमारी", prasad: "प्रसाद",
  devi: "देवी", raj: "राज", man: "मान",
};

// Longest-first so "chh" wins over "ch", and "aa" over "a".
const CONSONANTS: [string, string][] = [
  ["kshy", "क्ष"], ["ksh", "क्ष"], ["chh", "छ"], ["shr", "श्र"],
  ["gy", "ज्ञ"], ["ng", "ङ"], ["ny", "ञ"],
  ["kh", "ख"], ["gh", "घ"], ["ch", "च"], ["jh", "झ"], ["th", "थ"],
  ["dh", "ध"], ["ph", "फ"], ["bh", "भ"], ["sh", "श"], ["ss", "ष"],
  ["k", "क"], ["g", "ग"], ["c", "च"], ["j", "ज"], ["t", "त"], ["d", "द"],
  ["n", "न"], ["p", "प"], ["f", "फ"], ["b", "ब"], ["m", "म"], ["y", "य"],
  ["r", "र"], ["l", "ल"], ["v", "व"], ["w", "व"], ["s", "स"], ["h", "ह"],
  ["z", "ज"], ["x", "क्स"], ["q", "क"],
];

const VOWELS: [string, string, string][] = [
  // roman, independent, matra
  ["aa", "आ", "ा"], ["ai", "ऐ", "ै"], ["au", "औ", "ौ"],
  ["ee", "ई", "ी"], ["ii", "ई", "ी"], ["oo", "ऊ", "ू"], ["uu", "ऊ", "ू"],
  ["ri", "ऋ", "ृ"],
  ["a", "अ", ""], ["i", "इ", "ि"], ["u", "उ", "ु"],
  ["e", "ए", "े"], ["o", "ओ", "ो"],
];

const HALANT = "्";

function matchAt(word: string, at: number, table: [string, string][] | [string, string, string][]) {
  for (const entry of table) {
    if (word.startsWith(entry[0], at)) return entry;
  }
  return null;
}

/// Letter-by-letter fallback. Gets the shape right and the vowel lengths often
/// wrong, which is exactly why the result is offered rather than applied.
function transliterateWord(word: string): string {
  let out = "";
  let i = 0;
  let atStart = true;

  while (i < word.length) {
    const consonant = matchAt(word, i, CONSONANTS) as [string, string] | null;

    if (consonant) {
      out += consonant[1];
      i += consonant[0].length;

      const vowel = matchAt(word, i, VOWELS) as [string, string, string] | null;
      if (vowel) {
        out += vowel[2];
        i += vowel[0].length;
      } else {
        // A consonant with nothing after it keeps its inherent 'a' at the end of
        // a word (राम), but takes a halant mid-cluster (श्री).
        const atEnd = i >= word.length;
        if (!atEnd) out += HALANT;
      }
      atStart = false;
      continue;
    }

    const vowel = matchAt(word, i, VOWELS) as [string, string, string] | null;
    if (vowel) {
      // A vowel opening a word takes its standalone form.
      out += atStart ? vowel[1] : vowel[2];
      i += vowel[0].length;
      atStart = false;
      continue;
    }

    // Anything unrecognised passes through so nothing is silently dropped.
    out += word[i];
    i += 1;
    atStart = false;
  }

  return out;
}

export function transliterateName(roman: string): string {
  const words = roman.trim().split(/\s+/).filter(Boolean);
  return words
    .map((word) => {
      const key = word.toLowerCase().replace(/[^a-z]/g, "");
      if (!key) return word;
      return KNOWN[key] ?? transliterateWord(key);
    })
    .join(" ");
}

/// True when the text is already Devanagari, so a suggestion would be pointless.
export function isDevanagari(text: string): boolean {
  return /[ऀ-ॿ]/.test(text);
}
