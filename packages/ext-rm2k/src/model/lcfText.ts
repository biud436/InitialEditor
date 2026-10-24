// LCF 파일의 글(맵 이름, ChipSet 이름)은 게임을 만든 컴퓨터의 코드 페이지 바이트다. RPG Maker 2000 은 일본어(Shift_JIS)가
// 기본이고, 한국어판과 번역판은 CP949, 서유럽은 Windows-1252 따위를 쓴다. 파일에는 코드 페이지가 적혀 있지 않다.
//
// 짐작(guessEncoding): 글을 후보마다 풀어 보고, 풀지 못한 후보는 빼고, 남은 후보는 ASCII 가 아닌 글자 가운데 그 언어에서 흔한
// 글자(일본어 가나와 JIS 1수준 한자, 한국어 KS X 1001 한글, 중국어 GB2312 1급 한자, 키릴 문자, 라틴 글자)의 비율로 고른다.
// 한 바이트 인코딩은 이웃 글자도 본다: 키릴 문자는 ASCII 영문자에 붙어 있지 않을 때, 라틴 글자는 ASCII 영문자에 붙어 있을 때만
// 흔한 글자다 ("Café" 의 é 는 키릴 문자 й 로도 풀린다). 비율이 같으면 목록의 앞쪽이다. 모든 글이 ASCII 면 windows-1252 다.

export interface LcfEncoding {
  /** TextDecoder 의 이름 */
  id: string;
  label: string;
}

export const LCF_ENCODINGS: readonly LcfEncoding[] = [
  { id: "shift_jis", label: "일본어 (Shift_JIS)" },
  { id: "euc-kr", label: "한국어 (CP949)" },
  { id: "gbk", label: "중국어 간체 (GBK)" },
  { id: "big5", label: "중국어 번체 (Big5)" },
  { id: "windows-1251", label: "키릴 문자 (Windows-1251)" },
  { id: "windows-1252", label: "서유럽 (Windows-1252)" },
];

export const ASCII_ENCODING = "windows-1252";

/** RPG_RT.ini 의 [EasyRPG] Encoding (코드 페이지 번호) */
const CODE_PAGES: Readonly<Record<string, string>> = {
  "932": "shift_jis",
  "949": "euc-kr",
  "936": "gbk",
  "950": "big5",
  "1251": "windows-1251",
  "1252": "windows-1252",
};

/** TextDecoder (Node 와 웹뷰에 있다. 이 패키지의 lib 에는 DOM 이 없어 쓰는 메서드만 적는다) */
interface Decoder {
  decode(input: Uint8Array): string;
}

const decoders = new Map<string, Decoder>();
function decoder(id: string, fatal: boolean): Decoder {
  const key = `${id}:${fatal}`;
  let d = decoders.get(key);
  if (!d) decoders.set(key, (d = new TextDecoder(id, { fatal })));
  return d;
}

/** 글을 푼다. 풀 수 없는 바이트는 대체 문자가 된다 */
export function decodeLcfText(bytes: Uint8Array, encoding: string): string {
  return decoder(encoding, false).decode(bytes);
}

/** 두 바이트 글자의 한 구역을 풀어 글자 집합으로 */
function block(id: string, leads: [number, number], trails: [number, number]): Set<string> {
  const bytes: number[] = [];
  for (let a = leads[0]; a <= leads[1]; a++) for (let b = trails[0]; b <= trails[1]; b++) bytes.push(a, b);
  return new Set(decoder(id, false).decode(new Uint8Array(bytes)));
}

/** 글자 하나가 그 언어에서 흔한가. 앞뒤 글자도 받는다 */
type CommonTest = (ch: string, prev: string, next: string) => boolean;

const asciiLetter = (ch: string) => /^[A-Za-z]$/.test(ch);

let commonSets: Map<string, CommonTest> | null = null;
function common(): Map<string, CommonTest> {
  if (commonSets) return commonSets;
  const jisKanji = block("shift_jis", [0x88, 0x98], [0x40, 0xfc]);
  const kana = (c: number) => c >= 0x3041 && c <= 0x30ff;
  const hangul = block("euc-kr", [0xb0, 0xc8], [0xa1, 0xfe]);
  const hanzi = block("gbk", [0xb0, 0xd7], [0xa1, 0xfe]);
  const big5 = block("big5", [0xa4, 0xc6], [0x40, 0x7e]);
  for (const ch of block("big5", [0xa4, 0xc6], [0xa1, 0xfe])) big5.add(ch);
  commonSets = new Map<string, CommonTest>([
    ["shift_jis", (ch) => kana(ch.codePointAt(0)!) || jisKanji.has(ch)],
    ["euc-kr", (ch) => hangul.has(ch)],
    ["gbk", (ch) => hanzi.has(ch)],
    ["big5", (ch) => big5.has(ch)],
    ["windows-1251", (ch, prev, next) => /[А-яЁё]/.test(ch) && !asciiLetter(prev) && !asciiLetter(next)],
    ["windows-1252", (ch, prev, next) => /[À-ÿ]/.test(ch) && ch !== "×" && ch !== "÷" && (asciiLetter(prev) || asciiLetter(next))],
  ]);
  return commonSets;
}

const isAscii = (bytes: Uint8Array) => bytes.every((b) => b < 0x80);

/** 글들의 코드 페이지를 짐작한다. ini 는 RPG_RT.ini 의 바이트 (있으면 [EasyRPG] Encoding 을 따른다) */
export function guessEncoding(samples: readonly Uint8Array[], ini?: Uint8Array): string {
  if (ini) {
    const m = /^\s*Encoding\s*=\s*(\d+)/im.exec(decodeLcfText(ini, ASCII_ENCODING));
    if (m && CODE_PAGES[m[1]]) return CODE_PAGES[m[1]];
  }
  const texts = samples.filter((s) => s.length > 0 && !isAscii(s));
  if (texts.length === 0) return ASCII_ENCODING;
  let best = ASCII_ENCODING;
  let bestScore = -1;
  for (const { id } of LCF_ENCODINGS) {
    let total = 0;
    let hits = 0;
    let ok = true;
    const isCommon = common().get(id)!;
    for (const bytes of texts) {
      let text: string;
      try {
        text = decoder(id, true).decode(bytes);
      } catch {
        ok = false;
        break;
      }
      const chars = [...text];
      chars.forEach((ch, i) => {
        if (ch.codePointAt(0)! < 0x80) return;
        total++;
        if (isCommon(ch, chars[i - 1] ?? "", chars[i + 1] ?? "")) hits++;
      });
    }
    if (!ok || total === 0) continue;
    const score = hits / total;
    if (score > bestScore) {
      best = id;
      bestScore = score;
    }
  }
  return best;
}
